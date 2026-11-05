import { Types } from 'mongoose';
import { Clinic } from '../tenancy/models/clinic.model.js';
import { ClinicInvoice, ClinicInvoiceCounter } from './models/clinic-invoice.model.js';
import { ClinicExpense } from './models/clinic-expense.model.js';

type Scope = { tenantId: string; clinicId: string; branchId: string | null; userId: string };
type InvoiceInput = { customer?: any; lines?: any[]; currency?: string };

function calculateBasisPoints(amountMinor: number, basisPoints: number): number {
  return Number((BigInt(amountMinor) * BigInt(basisPoints)) / 10000n);
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

function dateFilter(from?: Date, to?: Date) {
  return from || to ? { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } : undefined;
}

export const clinicFinanceService = {
  async createInvoice(scope: Scope, input: InvoiceInput) {
    const clinic = await assertClinic(scope);
    const { lines, totals } = calculateInvoiceLines(input.lines ?? []);
    const currency = (input.currency ?? clinic.preferences?.currency ?? 'EGP').toUpperCase();
    return ClinicInvoice.create({
      ...invoiceFilter(scope), customer: input.customer, lines, currency, ...totals,
      paidMinor: 0, refundedMinor: 0, balanceDueMinor: totals.totalMinor,
      status: 'draft', createdBy: scope.userId, updatedBy: scope.userId,
      events: [{ type: 'invoice.created', actorUserId: scope.userId, occurredAt: new Date() }],
    });
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
    if (!['issued', 'partially_paid'].includes(current.status)) throw { status: 409, code: 'INVOICE_NOT_PAYABLE', message: 'Only issued invoices with an outstanding balance can receive payments.' };
    const balanceDueMinor = current.totalMinor - (current.paidMinor - current.refundedMinor);
    if (input.amountMinor > balanceDueMinor) throw { status: 400, code: 'PAYMENT_EXCEEDS_BALANCE', message: 'Payment exceeds the outstanding invoice balance.' };
    const payment = {
      _id: new Types.ObjectId(), idempotencyKey: input.idempotencyKey, method: input.method, amountMinor: input.amountMinor,
      currency: current.currency, reference: input.reference ?? '', receivedAt: input.receivedAt ?? new Date(),
      recordedBy: scope.userId, refundedMinor: 0, refunds: [],
    };
    const nextPaid = current.paidMinor + input.amountMinor;
    const nextStatus = nextPaid - current.refundedMinor >= current.totalMinor ? 'paid' : 'partially_paid';
    const updated = await ClinicInvoice.findOneAndUpdate(
      { _id: invoiceId, ...invoiceFilter(scope), version: current.version, status: current.status, balanceDueMinor: { $gte: input.amountMinor } },
      { $push: { payments: payment, events: { type: 'payment.recorded', actorUserId: scope.userId, occurredAt: new Date(), metadata: { paymentId: payment._id, amountMinor: input.amountMinor, method: input.method } } },
        $set: { paidMinor: nextPaid, balanceDueMinor: current.totalMinor - (nextPaid - current.refundedMinor), status: nextStatus, updatedBy: scope.userId }, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'INVOICE_CHANGED', message: 'Invoice changed while recording payment. Reload and retry.' };
    return updated;
  },

  async refundPayment(scope: Scope, invoiceId: string, paymentId: string, input: any) {
    const current = await ClinicInvoice.findOne({ _id: invoiceId, ...invoiceFilter(scope) });
    if (!current) return null;
    const payment = current.payments.id(paymentId);
    if (!payment) throw { status: 404, code: 'PAYMENT_NOT_FOUND', message: 'Payment not found on this invoice.' };
    const priorRefund = payment.refunds.find((item: any) => item.idempotencyKey === input.idempotencyKey);
    if (priorRefund) {
      if (priorRefund.amountMinor !== input.amountMinor || priorRefund.reason !== input.reason) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different refund details.' };
      return current;
    }
    const refundable = payment.amountMinor - payment.refundedMinor;
    if (input.amountMinor > refundable) throw { status: 400, code: 'REFUND_EXCEEDS_PAYMENT', message: 'Refund exceeds the remaining refundable payment amount.' };
    const now = new Date();
    const nextRefunded = current.refundedMinor + input.amountMinor;
    const nextBalance = current.totalMinor - (current.paidMinor - nextRefunded);
    const nextStatus = current.paidMinor - nextRefunded <= 0 ? 'issued' : (nextBalance === 0 ? 'paid' : 'partially_paid');
    const updated = await ClinicInvoice.findOneAndUpdate(
      { _id: invoiceId, ...invoiceFilter(scope), version: current.version, 'payments._id': payment._id, 'payments.refundedMinor': payment.refundedMinor },
      { $inc: { 'payments.$.refundedMinor': input.amountMinor, refundedMinor: input.amountMinor, version: 1 },
        $push: { 'payments.$.refunds': { idempotencyKey: input.idempotencyKey, amountMinor: input.amountMinor, reason: input.reason, refundedAt: now, recordedBy: scope.userId },
          events: { type: 'payment.refunded', actorUserId: scope.userId, occurredAt: now, metadata: { paymentId, amountMinor: input.amountMinor, reason: input.reason } } },
        $set: { balanceDueMinor: nextBalance, status: nextStatus, updatedBy: scope.userId } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'INVOICE_CHANGED', message: 'Payment changed while recording refund. Reload and retry.' };
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
    return ClinicExpense.create({
      ...invoiceFilter(scope), description: input.description, category: input.category,
      supplier: input.supplier ?? {}, amountMinor: input.amountMinor, currency,
      dueAt: input.dueAt ?? null, incurredAt: input.incurredAt ?? new Date(),
      status: 'recorded', createdBy: scope.userId, updatedBy: scope.userId, events: [{ type: 'expense.recorded', actorUserId: scope.userId, occurredAt: new Date() }],
    });
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
    const updated = await ClinicExpense.findOneAndUpdate(
      { _id: expenseId, ...invoiceFilter(scope), status: 'recorded' },
      { $set: { status: 'paid', paymentMethod: input.method, paidAt: input.paidAt ?? new Date(), updatedBy: scope.userId }, $push: { events: { type: 'expense.paid', actorUserId: scope.userId, occurredAt: new Date(), metadata: { method: input.method } } } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'EXPENSE_NOT_PAYABLE', message: 'Expense is missing or is not awaiting payment.' };
    return updated;
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

  async summary(scope: Scope, query: { from?: Date; to?: Date; branchId?: string }) {
    const filter: any = { ...invoiceFilter(scope) };
    if (query.branchId) {
      if (scope.branchId && query.branchId !== scope.branchId) throw { status: 403, code: 'BRANCH_ACCESS_DENIED', message: 'You cannot access another branch.' };
      filter.branchId = query.branchId;
    }
    const invoiceDate = dateFilter(query.from, query.to);
    const [invoices, expenses] = await Promise.all([
      ClinicInvoice.find({ ...filter, status: { $in: ['issued', 'partially_paid', 'paid'] }, ...(invoiceDate ? { issuedAt: invoiceDate } : {}) }).select('currency totalMinor paidMinor refundedMinor balanceDueMinor status').lean(),
      ClinicExpense.find({ ...filter, status: { $in: ['recorded', 'paid'] }, ...(invoiceDate ? { incurredAt: invoiceDate } : {}) }).select('currency amountMinor status').lean(),
    ]);
    const byCurrency = new Map<string, any>();
    const bucket = (currency: string) => {
      if (!byCurrency.has(currency)) byCurrency.set(currency, { currency, invoicedMinor: 0, collectedMinor: 0, refundedMinor: 0, outstandingMinor: 0, expensesMinor: 0, paidExpensesMinor: 0 });
      return byCurrency.get(currency);
    };
    for (const invoice of invoices) {
      const row = bucket(invoice.currency);
      row.invoicedMinor += invoice.totalMinor;
      row.collectedMinor += invoice.paidMinor;
      row.refundedMinor += invoice.refundedMinor;
      row.outstandingMinor += invoice.balanceDueMinor;
    }
    for (const expense of expenses) {
      const row = bucket(expense.currency);
      row.expensesMinor += expense.amountMinor;
      if (expense.status === 'paid') row.paidExpensesMinor += expense.amountMinor;
    }
    return { currencies: [...byCurrency.values()].map((row) => ({ ...row, netCollectionsMinor: row.collectedMinor - row.refundedMinor, cashOperatingResultMinor: row.collectedMinor - row.refundedMinor - row.paidExpensesMinor })), period: { from: query.from ?? null, to: query.to ?? null } };
  },
};
