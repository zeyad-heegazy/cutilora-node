import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { Clinic } from '../tenancy/models/clinic.model.js';
import { ClinicInvoice, ClinicInvoiceCounter } from './models/clinic-invoice.model.js';
import { ClinicExpense } from './models/clinic-expense.model.js';
import { ClinicCashSession } from './models/clinic-cash-session.model.js';

type Scope = { tenantId: string; clinicId: string; branchId: string | null; userId: string };
type InvoiceInput = { idempotencyKey?: string; customer?: any; lines?: any[]; currency?: string; dueAt?: Date };

function calculateBasisPoints(amountMinor: number, basisPoints: number): number {
  return Number((BigInt(amountMinor) * BigInt(basisPoints)) / 10000n);
}

export function calculateInvoiceSettlement(totalMinor: number, creditedMinor: number, paidMinor: number, refundedMinor: number) {
  const adjustedTotalMinor = totalMinor - creditedMinor;
  const netPaidMinor = paidMinor - refundedMinor;
  const balanceDueMinor = Math.max(0, adjustedTotalMinor - netPaidMinor);
  const creditBalanceMinor = Math.max(0, netPaidMinor - adjustedTotalMinor);
  const status = balanceDueMinor === 0
    ? (adjustedTotalMinor === 0 && netPaidMinor === 0 ? 'credited' : 'paid')
    : (creditedMinor > 0 && netPaidMinor === 0 ? 'partially_credited' : (netPaidMinor > 0 ? 'partially_paid' : 'issued'));
  return { balanceDueMinor, creditBalanceMinor, status };
}

export function calculateInvoiceLines(lines: any[]) {
  const calculated = lines.map((line) => {
    const subtotalMinor = line.quantity * line.unitPriceMinor;
    if (!Number.isSafeInteger(subtotalMinor)) throw { status: 400, code: 'AMOUNT_OUT_OF_RANGE', message: 'Invoice line amount exceeds the supported range.' };
    const discountMinor = calculateBasisPoints(subtotalMinor, line.discountBps ?? 0);
    const taxableMinor = subtotalMinor - discountMinor;
    const taxMinor = calculateBasisPoints(taxableMinor, line.taxBps ?? 0);
    return { ...line, subtotalMinor, discountMinor, taxMinor, totalMinor: taxableMinor + taxMinor };
  });
  const totals = calculated.reduce((acc, line) => ({
    subtotalMinor: acc.subtotalMinor + line.subtotalMinor,
    discountMinor: acc.discountMinor + line.discountMinor,
    taxMinor: acc.taxMinor + line.taxMinor,
    totalMinor: acc.totalMinor + line.totalMinor,
  }), { subtotalMinor: 0, discountMinor: 0, taxMinor: 0, totalMinor: 0 });
  if (Object.values(totals).some((value) => !Number.isSafeInteger(value))) throw { status: 400, code: 'AMOUNT_OUT_OF_RANGE', message: 'Invoice total exceeds the supported range.' };
  return { lines: calculated, totals };
}

async function assertClinic(scope: Scope) {
  const clinic = await Clinic.findOne({ _id: scope.clinicId, tenantId: scope.tenantId, status: 'active' }).select('preferences.currency timezone');
  if (!clinic) throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'Clinic not found in the selected tenant.' };
  return clinic;
}

function invoiceFilter(scope: Scope) {
  return {
    tenantId: scope.tenantId, clinicId: scope.clinicId,
    ...(scope.branchId ? { branchId: scope.branchId } : {}),
  };
}

async function reserveCashSession(scope: Scope, currency: string): Promise<{ sessionId: any; token: string }> {
  const token = randomBytes(24).toString('hex');
  const now = new Date();
  const session = await ClinicCashSession.findOneAndUpdate(
    { ...invoiceFilter(scope), status: 'open', currency, $or: [
      { cashMutationLockExpiresAt: null },
      { cashMutationLockExpiresAt: { $lte: now } },
      { cashMutationLockExpiresAt: { $exists: false } },
    ] },
    { $set: { cashMutationLockToken: token, cashMutationLockExpiresAt: new Date(now.getTime() + 5 * 60 * 1000) }, $inc: { version: 1 } },
    { new: true, projection: { _id: 1, currency: 1 } },
  );
  if (!session) {
    const open = await ClinicCashSession.findOne({ ...invoiceFilter(scope), status: 'open' }).select('currency +cashMutationLockExpiresAt');
    if (!open) throw { status: 409, code: 'CASH_SESSION_REQUIRED', message: 'Open a cash session before recording a cash transaction.' };
    if (open.currency !== currency) throw { status: 409, code: 'CASH_SESSION_CURRENCY_MISMATCH', message: 'Cash transaction currency must match the active cash session currency.' };
    throw { status: 409, code: 'CASH_SESSION_BUSY', message: 'Another cash transaction is being recorded. Retry shortly.' };
  }
  return { sessionId: session._id, token };
}

async function releaseCashSession(scope: Scope, reservation: { sessionId: any; token: string }): Promise<void> {
  await ClinicCashSession.updateOne(
    { _id: reservation.sessionId, ...invoiceFilter(scope), status: 'open', cashMutationLockToken: reservation.token },
    { $set: { cashMutationLockToken: null, cashMutationLockExpiresAt: null }, $inc: { version: 1 } },
  );
}

function dateFilter(from?: Date, to?: Date) {
  return from || to ? { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } : undefined;
}

export function getReceivableAgingBucket(overdueDays: number): 'current' | 'days1To30' | 'days31To60' | 'days61To90' | 'over90Days' {
  if (overdueDays <= 0) return 'current';
  if (overdueDays <= 30) return 'days1To30';
  if (overdueDays <= 60) return 'days31To60';
  if (overdueDays <= 90) return 'days61To90';
  return 'over90Days';
}

export const clinicFinanceService = {
  async createInvoice(scope: Scope, input: InvoiceInput) {
    const clinic = await assertClinic(scope);
    const { lines, totals } = calculateInvoiceLines(input.lines ?? []);
    const currency = (input.currency ?? clinic.preferences?.currency ?? 'EGP').toUpperCase();
    const requestFingerprint = createHash('sha256').update(JSON.stringify({ customer: input.customer, lines: input.lines, currency: input.currency ?? null, dueAt: input.dueAt ?? null, branchId: scope.branchId })).digest('hex');
    const existing = await ClinicInvoice.findOne({ tenantId: scope.tenantId, clinicId: scope.clinicId, idempotencyKey: input.idempotencyKey }).select('+requestFingerprint');
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different invoice details.' };
      return existing;
    }
    try {
      return await ClinicInvoice.create({
        ...invoiceFilter(scope), idempotencyKey: input.idempotencyKey, requestFingerprint,
        customer: input.customer, lines, currency, dueAt: input.dueAt ?? null, ...totals,
        paidMinor: 0, refundedMinor: 0, balanceDueMinor: totals.totalMinor,
        status: 'draft', createdBy: scope.userId, updatedBy: scope.userId,
        events: [{ type: 'invoice.created', actorUserId: scope.userId, occurredAt: new Date() }],
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const raced = await ClinicInvoice.findOne({ tenantId: scope.tenantId, clinicId: scope.clinicId, idempotencyKey: input.idempotencyKey }).select('+requestFingerprint');
        if (raced?.requestFingerprint === requestFingerprint) return raced;
        if (raced) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different invoice details.' };
      }
      throw error;
    }
  },

  async listInvoices(scope: Scope, query: any) {
    const filter: any = { ...invoiceFilter(scope) };
    if (query.status) filter.status = query.status;
    if (query.branchId) {
      if (scope.branchId && query.branchId !== scope.branchId) throw { status: 403, code: 'BRANCH_ACCESS_DENIED', message: 'You cannot access another branch.' };
      filter.branchId = query.branchId;
    }
    const issuedAt = dateFilter(query.from, query.to);
    if (issuedAt) filter.issuedAt = issuedAt;
    const [items, total] = await Promise.all([
      ClinicInvoice.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.perPage).limit(query.perPage).lean(),
      ClinicInvoice.countDocuments(filter),
    ]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, pages: Math.ceil(total / query.perPage) } };
  },

  getInvoice(scope: Scope, invoiceId: string) {
    return ClinicInvoice.findOne({ _id: invoiceId, ...invoiceFilter(scope) }).lean();
  },

  async updateDraftInvoice(scope: Scope, invoiceId: string, input: InvoiceInput) {
    const current = await ClinicInvoice.findOne({ _id: invoiceId, ...invoiceFilter(scope) });
    if (!current) return null;
    if (current.status !== 'draft') throw { status: 409, code: 'INVOICE_NOT_EDITABLE', message: 'Only draft invoices can be edited.' };
    const update: any = { updatedBy: scope.userId };
    if (input.customer) update.customer = input.customer;
    if (input.dueAt) update.dueAt = input.dueAt;
    if (input.lines) {
      const result = calculateInvoiceLines(input.lines);
      update.lines = result.lines;
      Object.assign(update, result.totals);
      update.balanceDueMinor = result.totals.totalMinor;
    }
    if (input.currency && input.currency !== current.currency) throw { status: 409, code: 'INVOICE_CURRENCY_IMMUTABLE', message: 'Invoice currency cannot be changed after creation.' };
    return ClinicInvoice.findOneAndUpdate(
      { _id: invoiceId, ...invoiceFilter(scope), status: 'draft', version: current.version },
      { $set: update, $inc: { version: 1 }, $push: { events: { type: 'invoice.updated', actorUserId: scope.userId, occurredAt: new Date() } } },
      { new: true, runValidators: true },
    );
  },

  async issueInvoice(scope: Scope, invoiceId: string) {
    const current = await ClinicInvoice.findOne({ _id: invoiceId, ...invoiceFilter(scope), status: 'draft' });
    if (!current) return null;
    if (current.totalMinor <= 0) throw { status: 409, code: 'INVOICE_TOTAL_INVALID', message: 'An invoice must have a positive total before it can be issued.' };
    const clinic = await assertClinic(scope);
    const now = new Date();
    const year = Number(new Intl.DateTimeFormat('en', { timeZone: clinic.timezone || 'Africa/Cairo', year: 'numeric' }).format(now));
    const counter = await ClinicInvoiceCounter.findOneAndUpdate(
      { tenantId: scope.tenantId, clinicId: scope.clinicId, year },
      { $inc: { sequence: 1 }, $setOnInsert: { tenantId: scope.tenantId, clinicId: scope.clinicId, year } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const invoiceNumber = `INV-${year}-${String(counter.sequence).padStart(6, '0')}`;
    return ClinicInvoice.findOneAndUpdate(
      { _id: invoiceId, ...invoiceFilter(scope), status: 'draft', version: current.version },
      { $set: { status: 'issued', invoiceNumber, issuedAt: now, updatedBy: scope.userId }, $inc: { version: 1 },
        $push: { events: { type: 'invoice.issued', actorUserId: scope.userId, occurredAt: now, metadata: { invoiceNumber } } } },
      { new: true, runValidators: true },
    );
  },

  async recordPayment(scope: Scope, invoiceId: string, input: any) {
    const current = await ClinicInvoice.findOne({ _id: invoiceId, ...invoiceFilter(scope) });
    if (!current) return null;
    const priorPayment = current.payments.find((item: any) => item.idempotencyKey === input.idempotencyKey);
    if (priorPayment) {
      if (priorPayment.amountMinor !== input.amountMinor || priorPayment.method !== input.method || priorPayment.reference !== (input.reference ?? '')) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different payment details.' };
      return current;
    }
    if (!['issued', 'partially_paid', 'partially_credited'].includes(current.status)) throw { status: 409, code: 'INVOICE_NOT_PAYABLE', message: 'Only issued invoices with an outstanding balance can receive payments.' };
    const balanceDueMinor = current.balanceDueMinor;
    if (input.amountMinor > balanceDueMinor) throw { status: 400, code: 'PAYMENT_EXCEEDS_BALANCE', message: 'Payment exceeds the outstanding invoice balance.' };
    const cashReservation = input.method === 'cash' ? await reserveCashSession(scope, current.currency) : null;
    const cashSessionId = cashReservation?.sessionId ?? null;
    const payment = {
      _id: new Types.ObjectId(), cashSessionId, idempotencyKey: input.idempotencyKey, method: input.method, amountMinor: input.amountMinor,
      currency: current.currency, reference: input.reference ?? '', receivedAt: input.method === 'cash' ? new Date() : (input.receivedAt ?? new Date()),
      recordedBy: scope.userId, refundedMinor: 0, refunds: [],
    };
    const nextPaid = current.paidMinor + input.amountMinor;
    const settlement = calculateInvoiceSettlement(current.totalMinor, current.creditedMinor ?? 0, nextPaid, current.refundedMinor);
    try {
      const updated = await ClinicInvoice.findOneAndUpdate(
        { _id: invoiceId, ...invoiceFilter(scope), version: current.version, status: current.status, balanceDueMinor: { $gte: input.amountMinor } },
        { $push: { payments: payment, events: { type: 'payment.recorded', actorUserId: scope.userId, occurredAt: new Date(), metadata: { paymentId: payment._id, amountMinor: input.amountMinor, method: input.method } } },
          $set: { paidMinor: nextPaid, balanceDueMinor: settlement.balanceDueMinor, creditBalanceMinor: settlement.creditBalanceMinor, status: settlement.status, updatedBy: scope.userId }, $inc: { version: 1 } },
        { new: true, runValidators: true },
      );
      if (!updated) throw { status: 409, code: 'INVOICE_CHANGED', message: 'Invoice changed while recording payment. Reload and retry.' };
      return updated;
    } finally {
      if (cashReservation) await releaseCashSession(scope, cashReservation);
    }
  },

  async refundPayment(scope: Scope, invoiceId: string, paymentId: string, input: any) {
    const current = await ClinicInvoice.findOne({ _id: invoiceId, ...invoiceFilter(scope) });
    if (!current) return null;
    const payment = current.payments.id(paymentId);
    if (!payment) throw { status: 404, code: 'PAYMENT_NOT_FOUND', message: 'Payment not found on this invoice.' };
    const priorRefund = payment.refunds.find((item: any) => item.idempotencyKey === input.idempotencyKey);
    if (priorRefund) {
      if (priorRefund.amountMinor !== input.amountMinor || priorRefund.reason !== input.reason || priorRefund.method !== input.method) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different refund details.' };
      return current;
    }
    const refundable = payment.amountMinor - payment.refundedMinor;
    if (input.amountMinor > refundable) throw { status: 400, code: 'REFUND_EXCEEDS_PAYMENT', message: 'Refund exceeds the remaining refundable payment amount.' };
    const cashReservation = input.method === 'cash' ? await reserveCashSession(scope, current.currency) : null;
    const cashSessionId = cashReservation?.sessionId ?? null;
    const now = new Date();
    const nextRefunded = current.refundedMinor + input.amountMinor;
    const settlement = calculateInvoiceSettlement(current.totalMinor, current.creditedMinor ?? 0, current.paidMinor, nextRefunded);
    try {
      const updated = await ClinicInvoice.findOneAndUpdate(
        { _id: invoiceId, ...invoiceFilter(scope), version: current.version, 'payments._id': payment._id, 'payments.refundedMinor': payment.refundedMinor },
        { $inc: { 'payments.$.refundedMinor': input.amountMinor, refundedMinor: input.amountMinor, version: 1 },
          $push: { 'payments.$.refunds': { idempotencyKey: input.idempotencyKey, method: input.method, cashSessionId, amountMinor: input.amountMinor, reason: input.reason, refundedAt: now, recordedBy: scope.userId },
            events: { type: 'payment.refunded', actorUserId: scope.userId, occurredAt: now, metadata: { paymentId, amountMinor: input.amountMinor, reason: input.reason } } },
          $set: { balanceDueMinor: settlement.balanceDueMinor, creditBalanceMinor: settlement.creditBalanceMinor, status: settlement.status, updatedBy: scope.userId } },
        { new: true, runValidators: true },
      );
      if (!updated) throw { status: 409, code: 'INVOICE_CHANGED', message: 'Payment changed while recording refund. Reload and retry.' };
      return updated;
    } finally {
      if (cashReservation) await releaseCashSession(scope, cashReservation);
    }
  },


  async issueCreditNote(scope: Scope, invoiceId: string, input: { idempotencyKey: string; amountMinor: number; reason: string }) {
    const current = await ClinicInvoice.findOne({ _id: invoiceId, ...invoiceFilter(scope) });
    if (!current) return null;
    const prior = current.creditNotes.find((note: any) => note.idempotencyKey === input.idempotencyKey);
    if (prior) {
      if (prior.amountMinor !== input.amountMinor || prior.reason !== input.reason) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different credit note details.' };
      return current;
    }
    if (!['issued', 'partially_paid', 'partially_credited', 'paid', 'credited'].includes(current.status)) throw { status: 409, code: 'INVOICE_NOT_CREDITABLE', message: 'Only issued invoices can receive credit notes.' };
    const availableMinor = current.totalMinor - (current.creditedMinor ?? 0);
    if (input.amountMinor > availableMinor) throw { status: 400, code: 'CREDIT_EXCEEDS_INVOICE', message: 'Credit note exceeds the remaining invoice value.' };
    const now = new Date();
    const creditedMinor = (current.creditedMinor ?? 0) + input.amountMinor;
    const settlement = calculateInvoiceSettlement(current.totalMinor, creditedMinor, current.paidMinor, current.refundedMinor);
    const noteNumber = `CN-${current.invoiceNumber}-${String(current.creditNotes.length + 1).padStart(3, '0')}`;
    const updated = await ClinicInvoice.findOneAndUpdate(
      { _id: invoiceId, ...invoiceFilter(scope), version: current.version, creditedMinor: current.creditedMinor ?? 0 },
      { $inc: { creditedMinor: input.amountMinor, version: 1 },
        $set: { balanceDueMinor: settlement.balanceDueMinor, creditBalanceMinor: settlement.creditBalanceMinor, status: settlement.status, updatedBy: scope.userId },
        $push: {
          creditNotes: { idempotencyKey: input.idempotencyKey, noteNumber, amountMinor: input.amountMinor, reason: input.reason, issuedAt: now, recordedBy: scope.userId },
          events: { type: 'invoice.credit_note_issued', actorUserId: scope.userId, occurredAt: now, metadata: { noteNumber, amountMinor: input.amountMinor, reason: input.reason } },
        } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'INVOICE_CHANGED', message: 'Invoice changed while issuing credit note. Reload and retry.' };
    return updated;
  },

  async voidInvoice(scope: Scope, invoiceId: string, reason: string) {
    const updated = await ClinicInvoice.findOneAndUpdate(
      { _id: invoiceId, ...invoiceFilter(scope), status: { $in: ['draft', 'issued'] }, paidMinor: 0, refundedMinor: 0 },
      { $set: { status: 'void', voidedAt: new Date(), voidReason: reason, updatedBy: scope.userId }, $inc: { version: 1 },
        $push: { events: { type: 'invoice.voided', actorUserId: scope.userId, occurredAt: new Date(), metadata: { reason } } } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'INVOICE_NOT_VOIDABLE', message: 'Invoice is missing, already settled, or cannot be voided.' };
    return updated;
  },

  async createExpense(scope: Scope, input: any) {
    const clinic = await assertClinic(scope);
    const currency = (input.currency ?? clinic.preferences?.currency ?? 'EGP').toUpperCase();
    const requestFingerprint = createHash('sha256').update(JSON.stringify({ description: input.description, category: input.category, supplier: input.supplier ?? {}, amountMinor: input.amountMinor, currency: input.currency ?? null, dueAt: input.dueAt ?? null, incurredAt: input.incurredAt ?? null, branchId: scope.branchId })).digest('hex');
    const existing = await ClinicExpense.findOne({ tenantId: scope.tenantId, clinicId: scope.clinicId, idempotencyKey: input.idempotencyKey }).select('+requestFingerprint');
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different expense details.' };
      return existing;
    }
    try {
      return await ClinicExpense.create({
        ...invoiceFilter(scope), idempotencyKey: input.idempotencyKey, requestFingerprint,
        description: input.description, category: input.category, supplier: input.supplier ?? {},
        amountMinor: input.amountMinor, currency, dueAt: input.dueAt ?? null, incurredAt: input.incurredAt ?? new Date(),
        status: 'recorded', createdBy: scope.userId, updatedBy: scope.userId,
        events: [{ type: 'expense.recorded', actorUserId: scope.userId, occurredAt: new Date() }],
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const raced = await ClinicExpense.findOne({ tenantId: scope.tenantId, clinicId: scope.clinicId, idempotencyKey: input.idempotencyKey }).select('+requestFingerprint');
        if (raced?.requestFingerprint === requestFingerprint) return raced;
        if (raced) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different expense details.' };
      }
      throw error;
    }
  },

  async listExpenses(scope: Scope, query: any) {
    const filter: any = { ...invoiceFilter(scope) };
    if (query.status) filter.status = query.status;
    if (query.branchId) {
      if (scope.branchId && query.branchId !== scope.branchId) throw { status: 403, code: 'BRANCH_ACCESS_DENIED', message: 'You cannot access another branch.' };
      filter.branchId = query.branchId;
    }
    const incurredAt = dateFilter(query.from, query.to);
    if (incurredAt) filter.incurredAt = incurredAt;
    const [items, total] = await Promise.all([
      ClinicExpense.find(filter).sort({ incurredAt: -1 }).skip((query.page - 1) * query.perPage).limit(query.perPage).lean(),
      ClinicExpense.countDocuments(filter),
    ]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, pages: Math.ceil(total / query.perPage) } };
  },

  async payExpense(scope: Scope, expenseId: string, input: any) {
    const current = await ClinicExpense.findOne({ _id: expenseId, ...invoiceFilter(scope) });
    if (!current) throw { status: 404, code: 'EXPENSE_NOT_FOUND', message: 'Expense not found.' };
    if (current.status === 'paid' && current.paymentIdempotencyKey === input.idempotencyKey && current.paymentMethod === input.method) return current;
    if (current.status !== 'recorded') throw { status: 409, code: 'EXPENSE_NOT_PAYABLE', message: 'Expense is not awaiting payment.' };
    const cashReservation = input.method === 'cash' ? await reserveCashSession(scope, current.currency) : null;
    const cashSessionId = cashReservation?.sessionId ?? null;
    try {
      const updated = await ClinicExpense.findOneAndUpdate(
        { _id: expenseId, ...invoiceFilter(scope), status: 'recorded' },
        { $set: { status: 'paid', paymentMethod: input.method, paymentIdempotencyKey: input.idempotencyKey, cashSessionId, paidAt: input.method === 'cash' ? new Date() : (input.paidAt ?? new Date()), updatedBy: scope.userId }, $push: { events: { type: 'expense.paid', actorUserId: scope.userId, occurredAt: new Date(), metadata: { method: input.method } } } },
        { new: true, runValidators: true },
      );
      if (!updated) throw { status: 409, code: 'EXPENSE_NOT_PAYABLE', message: 'Expense was paid or changed by another request.' };
      return updated;
    } finally {
      if (cashReservation) await releaseCashSession(scope, cashReservation);
    }
  },

  async voidExpense(scope: Scope, expenseId: string, reason: string) {
    const updated = await ClinicExpense.findOneAndUpdate(
      { _id: expenseId, ...invoiceFilter(scope), status: 'recorded' },
      { $set: { status: 'void', voidedAt: new Date(), voidReason: reason, updatedBy: scope.userId }, $push: { events: { type: 'expense.voided', actorUserId: scope.userId, occurredAt: new Date(), metadata: { reason } } } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'EXPENSE_NOT_VOIDABLE', message: 'Only unpaid recorded expenses can be voided.' };
    return updated;
  },


  async receivables(scope: Scope, query: { asOf?: Date; branchId?: string }) {
    const filter: any = { ...invoiceFilter(scope), status: { $in: ['issued', 'partially_paid', 'partially_credited'] }, balanceDueMinor: { $gt: 0 } };
    if (query.branchId) {
      if (scope.branchId && query.branchId !== scope.branchId) throw { status: 403, code: 'BRANCH_ACCESS_DENIED', message: 'You cannot access another branch.' };
      filter.branchId = query.branchId;
    }
    const invoices = await ClinicInvoice.find(filter).select('currency balanceDueMinor dueAt issuedAt createdAt').lean() as any[];
    const asOf = query.asOf ?? new Date();
    const buckets = new Map<string, any>();
    const getBucket = (currency: string) => {
      if (!buckets.has(currency)) buckets.set(currency, { currency, currentMinor: 0, days1To30Minor: 0, days31To60Minor: 0, days61To90Minor: 0, over90DaysMinor: 0, invoiceCount: 0 });
      return buckets.get(currency);
    };
    for (const invoice of invoices) {
      const dueAt = invoice.dueAt ?? invoice.issuedAt ?? invoice.createdAt;
      const overdueDays = Math.floor((asOf.getTime() - new Date(dueAt).getTime()) / 86400000);
      const row = getBucket(invoice.currency);
      row.invoiceCount += 1;
      const bucket = getReceivableAgingBucket(overdueDays);
      const field = bucket === 'current' ? 'currentMinor'
        : bucket === 'days1To30' ? 'days1To30Minor'
          : bucket === 'days31To60' ? 'days31To60Minor'
            : bucket === 'days61To90' ? 'days61To90Minor' : 'over90DaysMinor';
      row[field] += invoice.balanceDueMinor;
    }
    return { asOf, currencies: [...buckets.values()].map((row) => ({ ...row, outstandingMinor: row.currentMinor + row.days1To30Minor + row.days31To60Minor + row.days61To90Minor + row.over90DaysMinor })) };
  },

  async reports(scope: Scope, query: { from: Date; to: Date; branchId?: string; groupBy: 'day' | 'month' }) {
    const filter: any = { ...invoiceFilter(scope) };
    if (query.branchId) {
      if (scope.branchId && query.branchId !== scope.branchId) throw { status: 403, code: 'BRANCH_ACCESS_DENIED', message: 'You cannot access another branch.' };
      filter.branchId = query.branchId;
    }
    const range = { $gte: query.from, $lte: query.to };
    const [invoices, expenses, clinic] = await Promise.all([
      ClinicInvoice.find({ ...filter, status: { $in: ['issued', 'partially_paid', 'partially_credited', 'paid', 'credited'] }, $or: [{ issuedAt: range }, { 'payments.receivedAt': range }, { 'payments.refunds.refundedAt': range }] }).select('currency totalMinor creditedMinor creditNotes issuedAt createdAt lines payments').lean(),
      ClinicExpense.find({ ...filter, status: { $in: ['recorded', 'paid'] }, $or: [{ incurredAt: range }, { paidAt: range }] }).select('currency amountMinor category status incurredAt paidAt').lean(),
      Clinic.findOne({ _id: scope.clinicId, tenantId: scope.tenantId }).select('timezone').lean(),
    ]);
    const timezone = (clinic as any)?.timezone || 'Africa/Cairo';
    const periodKey = (date: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', query.groupBy === 'month'
        ? { timeZone: timezone, year: 'numeric', month: '2-digit' }
        : { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return query.groupBy === 'month' ? `${values.year}-${values.month}` : `${values.year}-${values.month}-${values.day}`;
    };
    const totals = new Map<string, any>();
    const rowFor = (currency: string) => {
      if (!totals.has(currency)) totals.set(currency, { currency, invoicedMinor: 0, collectedMinor: 0, refundedMinor: 0, expensesMinor: 0, paidExpensesMinor: 0 });
      return totals.get(currency);
    };
    const methods = new Map<string, any>();
    const categories = new Map<string, any>();
    const services = new Map<string, any>();
    const trends = new Map<string, any>();
    const trendFor = (currency: string, date: Date) => {
      const key = periodKey(date);
      const mapKey = `${currency}:${key}`;
      if (!trends.has(mapKey)) trends.set(mapKey, { currency, period: key, invoicedMinor: 0, creditedMinor: 0, collectedMinor: 0, refundedMinor: 0, expensesMinor: 0, paidExpensesMinor: 0 });
      return trends.get(mapKey);
    };
    for (const invoice of invoices as any[]) {
      const issuedAt = invoice.issuedAt ? new Date(invoice.issuedAt) : null;
      if (issuedAt && issuedAt >= query.from && issuedAt <= query.to) {
        rowFor(invoice.currency).invoicedMinor += invoice.totalMinor;
        trendFor(invoice.currency, issuedAt).invoicedMinor += invoice.totalMinor;
        for (const line of invoice.lines ?? []) {
          const serviceReference = line.serviceReference || 'unclassified';
          const key = `${invoice.currency}:${serviceReference}`;
          if (!services.has(key)) services.set(key, { currency: invoice.currency, serviceReference, revenueMinor: 0, quantity: 0 });
          services.get(key).revenueMinor += line.totalMinor;
          services.get(key).quantity += line.quantity;
        }
      }
      for (const note of invoice.creditNotes ?? []) {
        const creditedAt = new Date(note.issuedAt);
        if (creditedAt >= query.from && creditedAt <= query.to) {
          rowFor(invoice.currency).creditedMinor += note.amountMinor;
          trendFor(invoice.currency, creditedAt).creditedMinor += note.amountMinor;
        }
      }
      for (const payment of invoice.payments ?? []) {
        const receivedAt = new Date(payment.receivedAt);
        if (receivedAt >= query.from && receivedAt <= query.to) {
          rowFor(invoice.currency).collectedMinor += payment.amountMinor;
          trendFor(invoice.currency, receivedAt).collectedMinor += payment.amountMinor;
          const key = `${invoice.currency}:${payment.method}`;
          if (!methods.has(key)) methods.set(key, { currency: invoice.currency, method: payment.method, collectedMinor: 0, refundedMinor: 0 });
          methods.get(key).collectedMinor += payment.amountMinor;
        }
        for (const refund of payment.refunds ?? []) {
          const refundedAt = new Date(refund.refundedAt);
          if (refundedAt >= query.from && refundedAt <= query.to) {
            rowFor(invoice.currency).refundedMinor += refund.amountMinor;
            trendFor(invoice.currency, refundedAt).refundedMinor += refund.amountMinor;
            const key = `${invoice.currency}:${refund.method}`;
            if (!methods.has(key)) methods.set(key, { currency: invoice.currency, method: refund.method, collectedMinor: 0, refundedMinor: 0 });
            methods.get(key).refundedMinor += refund.amountMinor;
          }
        }
      }
    }
    for (const expense of expenses as any[]) {
      const incurredAt = new Date(expense.incurredAt);
      if (incurredAt >= query.from && incurredAt <= query.to) {
        rowFor(expense.currency).expensesMinor += expense.amountMinor;
        const key = `${expense.currency}:${expense.category}`;
        if (!categories.has(key)) categories.set(key, { currency: expense.currency, category: expense.category, incurredMinor: 0, paidMinor: 0 });
        categories.get(key).incurredMinor += expense.amountMinor;
        trendFor(expense.currency, incurredAt).expensesMinor += expense.amountMinor;
      }
      if (expense.status === 'paid' && expense.paidAt) {
        const paidAt = new Date(expense.paidAt);
        if (paidAt >= query.from && paidAt <= query.to) {
          rowFor(expense.currency).paidExpensesMinor += expense.amountMinor;
          const key = `${expense.currency}:${expense.category}`;
          if (!categories.has(key)) categories.set(key, { currency: expense.currency, category: expense.category, incurredMinor: 0, paidMinor: 0 });
          categories.get(key).paidMinor += expense.amountMinor;
          trendFor(expense.currency, paidAt).paidExpensesMinor += expense.amountMinor;
        }
      }
    }
    return {
      period: { from: query.from, to: query.to, groupBy: query.groupBy, timezone },
      totalsByCurrency: [...totals.values()].map((row) => ({ ...row, netInvoicedMinor: row.invoicedMinor - row.creditedMinor, netCollectionsMinor: row.collectedMinor - row.refundedMinor, cashBasisOperatingResultMinor: row.collectedMinor - row.refundedMinor - row.paidExpensesMinor })),
      collectionMethods: [...methods.values()],
      expenseCategories: [...categories.values()],
      serviceRevenue: [...services.values()],
      trends: [...trends.values()].sort((a, b) => a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency)),
    };
  },

  async summary(scope: Scope, query: { from?: Date; to?: Date; branchId?: string }) {
    const filter: any = { ...invoiceFilter(scope) };
    if (query.branchId) {
      if (scope.branchId && query.branchId !== scope.branchId) throw { status: 403, code: 'BRANCH_ACCESS_DENIED', message: 'You cannot access another branch.' };
      filter.branchId = query.branchId;
    }
    const invoiceDate = dateFilter(query.from, query.to);
    const [invoices, expenses] = await Promise.all([
      ClinicInvoice.find({ ...filter, status: { $in: ['issued', 'partially_paid', 'partially_credited', 'paid', 'credited'] }, ...(invoiceDate ? { issuedAt: invoiceDate } : {}) }).select('currency totalMinor paidMinor refundedMinor creditedMinor balanceDueMinor status').lean(),
      ClinicExpense.find({ ...filter, status: { $in: ['recorded', 'paid'] }, ...(invoiceDate ? { incurredAt: invoiceDate } : {}) }).select('currency amountMinor status').lean(),
    ]);
    const byCurrency = new Map<string, any>();
    const bucket = (currency: string) => {
      if (!byCurrency.has(currency)) byCurrency.set(currency, { currency, invoicedMinor: 0, creditedMinor: 0, collectedMinor: 0, refundedMinor: 0, outstandingMinor: 0, expensesMinor: 0, paidExpensesMinor: 0 });
      return byCurrency.get(currency);
    };
    for (const invoice of invoices) {
      const row = bucket(invoice.currency);
      row.invoicedMinor += invoice.totalMinor;
      row.creditedMinor = (row.creditedMinor ?? 0) + (invoice.creditedMinor ?? 0);
      row.collectedMinor += invoice.paidMinor;
      row.refundedMinor += invoice.refundedMinor;
      row.outstandingMinor += invoice.balanceDueMinor;
    }
    for (const expense of expenses) {
      const row = bucket(expense.currency);
      row.expensesMinor += expense.amountMinor;
      if (expense.status === 'paid') row.paidExpensesMinor += expense.amountMinor;
    }
    return { currencies: [...byCurrency.values()].map((row) => ({ ...row, netInvoicedMinor: row.invoicedMinor - row.creditedMinor, netCollectionsMinor: row.collectedMinor - row.refundedMinor, cashOperatingResultMinor: row.collectedMinor - row.refundedMinor - row.paidExpensesMinor })), period: { from: query.from ?? null, to: query.to ?? null } };
  },
};
