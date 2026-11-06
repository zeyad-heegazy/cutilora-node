import { Types } from 'mongoose';
import { ClinicFinanceEntry } from '../models/clinic-finance-entry.model.js';
import { ClinicFinancePackage } from '../models/clinic-finance-package.model.js';
import { ClinicFinancePackageEvent } from '../models/clinic-finance-package-event.model.js';
import { ClinicFinanceDailyClose } from '../models/clinic-finance-daily-close.model.js';
import { Clinic } from '../../../tenancy/models/clinic.model.js';
import { Branch } from '../../../tenancy/models/branch.model.js';
import { TenantAuditEvent } from '../../../tenancy/models/tenant-audit-event.model.js';
import { logger } from '../../../../shared/logger/logger.js';

type Actor = { tenantId: string; userId: string; clinicId?: string | null; branchId?: string | null; scope?: string };
type Scope = { clinicId?: string; branchId?: string; from?: Date; to?: Date; currency?: string; page?: number; perPage?: number };
const fail = (status: number, code: string, message: string): never => { throw { status, code, message }; };
const validId = (value: string) => Types.ObjectId.isValid(value) && /^[a-f\d]{24}$/i.test(value);
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.round(value * 100) === value * 100;
const cleanCurrency = (value: string) => value.trim().toUpperCase();

async function assertClinicScope(tenantId: string, clinicId: string, branchId?: string) {
  if (!validId(clinicId)) fail(400, 'INVALID_CLINIC_ID', 'clinicId must be a valid identifier.');
  const clinic = await Clinic.findOne({ _id: clinicId, tenantId, status: 'active' }).select('_id').lean();
  if (!clinic) fail(404, 'CLINIC_NOT_FOUND', 'Active clinic not found in this tenant.');
  if (branchId) {
    if (!validId(branchId)) fail(400, 'INVALID_BRANCH_ID', 'branchId must be a valid identifier.');
    const branch = await Branch.findOne({ _id: branchId, tenantId, clinicId, status: 'active' }).select('_id').lean();
    if (!branch) fail(404, 'BRANCH_NOT_FOUND', 'Active branch not found in this clinic.');
  }
}
function dateFilter(scope: Scope) {
  return { ...(scope.from || scope.to ? { occurredAt: { ...(scope.from ? { $gte: scope.from } : {}), ...(scope.to ? { $lte: scope.to } : {}) } } : {}) };
}
function scopeFilter(tenantId: string, scope: Scope) {
  return { tenantId: new Types.ObjectId(tenantId), ...(scope.clinicId ? { clinicId: new Types.ObjectId(scope.clinicId) } : {}), ...(scope.branchId ? { branchId: new Types.ObjectId(scope.branchId) } : {}), ...(scope.currency ? { currency: cleanCurrency(scope.currency) } : {}), ...dateFilter(scope) };
}
function assertActorClinic(actor: Actor, clinicId: unknown, branchId: unknown) {
  if (actor.scope === 'clinic' && String(actor.clinicId) !== String(clinicId)) fail(403, 'CLINIC_ACCESS_DENIED', 'This finance record is outside your clinic scope.');
  if (actor.scope === 'branch' && (String(actor.clinicId) !== String(clinicId) || String(actor.branchId) !== String(branchId))) fail(403, 'BRANCH_ACCESS_DENIED', 'This finance record is outside your branch scope.');
}
async function audit(actor: Actor, action: string, entry: any, metadata: Record<string, unknown> = {}) {
  try {
    await TenantAuditEvent.create({
      tenantId: actor.tenantId, actorUserId: actor.userId, action,
      targetType: 'clinic_finance_entry', targetId: String(entry._id),
      clinicId: entry.clinicId, branchId: entry.branchId || null,
      metadata: { type: entry.type, amount: entry.amount, currency: entry.currency, ...metadata },
    });
  } catch (error) {
    logger.error('Failed to persist clinic finance audit event', {
      tenantId: actor.tenantId, action, entryId: String(entry._id),
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
function normalizeEntry(entry: any) { const value = entry?.toObject ? entry.toObject() : entry; return value; }

export const clinicFinanceService = {
  async createInvoice(actor: Actor, input: any) {
    await assertClinicScope(actor.tenantId, input.clinicId, input.branchId);
    if (!Array.isArray(input.lineItems) || !input.lineItems.length) fail(400, 'INVALID_LINE_ITEMS', 'At least one invoice line item is required.');
    const lineItems = input.lineItems.map((item: any) => {
      if (!item.description?.trim() || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0 || Math.round(item.quantity * 10000) !== item.quantity * 10000 || !money(item.unitPrice)) fail(400, 'INVALID_LINE_ITEM', 'Each line item requires a description, positive quantity and non-negative unitPrice with at most two decimal places.');
      const total = Math.round(item.quantity * item.unitPrice * 100) / 100;
      return { category: String(item.category || 'Uncategorized').trim().slice(0, 80), description: item.description.trim(), quantity: item.quantity, unitPrice: item.unitPrice, total };
    });
    const amount = Math.round(lineItems.reduce((sum: number, item: any) => sum + item.total, 0) * 100) / 100;
    if (!amount) fail(400, 'INVALID_INVOICE_AMOUNT', 'Invoice total must be greater than zero.');
    const currency = cleanCurrency(input.currency);
    if (!/^[A-Z]{3}$/.test(currency)) fail(400, 'INVALID_CURRENCY', 'currency must be a three-letter ISO currency code.');
    assertActorClinic(actor, input.clinicId, input.branchId || null);
    const data = { tenantId: actor.tenantId, clinicId: input.clinicId, branchId: input.branchId || null, type: 'invoice', status: 'issued', currency, amount, patientId: input.patientId && validId(input.patientId) ? input.patientId : null, invoiceNumber: input.invoiceNumber?.trim() || null, description: input.description?.trim() || '', lineItems, occurredAt: input.issuedAt ? new Date(input.issuedAt) : new Date(), createdBy: actor.userId };
    if (input.patientId && !validId(input.patientId)) fail(400, 'INVALID_PATIENT_ID', 'patientId must be a valid identifier.');
    if (input.invoiceNumber && await ClinicFinanceEntry.exists({ tenantId: actor.tenantId, clinicId: input.clinicId, invoiceNumber: input.invoiceNumber.trim() })) fail(409, 'INVOICE_NUMBER_EXISTS', 'Invoice number already exists for this tenant.');
    try { const created = await ClinicFinanceEntry.create(data); await audit(actor, 'finance.invoice.created', created); return normalizeEntry(created); }
    catch (error: any) { if (error?.code === 11000) fail(409, 'INVOICE_NUMBER_EXISTS', 'Invoice number already exists for this tenant.'); throw error; }
  },
  async recordPayment(actor: Actor, input: any) {
    if (!validId(input.invoiceId)) fail(400, 'INVALID_INVOICE_ID', 'invoiceId must be a valid identifier.');
    const invoice: any = await ClinicFinanceEntry.findOne({ _id: input.invoiceId, tenantId: actor.tenantId, type: 'invoice', status: 'issued' }).lean();
    if (!invoice) fail(404, 'INVOICE_NOT_FOUND', 'Issued invoice not found in this tenant.');
    assertActorClinic(actor, invoice.clinicId, invoice.branchId);
    if (!money(input.amount) || input.amount <= 0) fail(400, 'INVALID_AMOUNT', 'Payment amount must be greater than zero with at most two decimal places.');
    if (cleanCurrency(input.currency) !== invoice.currency) fail(409, 'CURRENCY_MISMATCH', 'Payment currency must match the invoice currency.');
    if (input.branchId && String(input.branchId) !== String(invoice.branchId || '')) fail(400, 'BRANCH_SCOPE_MISMATCH', 'Payment branch must match the invoice branch.');
    if (input.idempotencyKey) {
      const existing: any = await ClinicFinanceEntry.findOne({ tenantId: actor.tenantId, idempotencyKey: input.idempotencyKey }).lean();
      if (existing) { if (existing.type !== 'payment' || String(existing.invoiceId) !== String(input.invoiceId) || existing.amount !== input.amount || existing.currency !== invoice.currency) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different payment.'); return existing; }
    }
    const reserved: any = await ClinicFinanceEntry.findOneAndUpdate(
      { _id: invoice._id, tenantId: actor.tenantId, type: 'invoice', status: 'issued', $expr: { $lte: [{ $add: [{ $ifNull: ['$settledAmount', 0] }, input.amount] }, '$amount'] } },
      { $inc: { settledAmount: input.amount } }, { new: true },
    ).lean();
    if (!reserved) fail(409, 'PAYMENT_EXCEEDS_BALANCE', 'Payment exceeds the remaining invoice balance.');
    try {
      const payment = await ClinicFinanceEntry.create({ tenantId: actor.tenantId, clinicId: invoice.clinicId, branchId: invoice.branchId || null, type: 'payment', status: 'posted', currency: invoice.currency, amount: input.amount, patientId: invoice.patientId, invoiceId: invoice._id, method: input.method?.trim() || 'other', reference: input.reference?.trim() || null, idempotencyKey: input.idempotencyKey || null, occurredAt: input.paidAt ? new Date(input.paidAt) : new Date(), createdBy: actor.userId });
      await audit(actor, 'finance.payment.recorded', payment);
      return normalizeEntry(payment);
    } catch (error: any) {
      await ClinicFinanceEntry.updateOne({ _id: invoice._id, tenantId: actor.tenantId }, { $inc: { settledAmount: -input.amount } });
      if (error?.code === 11000 && input.idempotencyKey) {
        const existing: any = await ClinicFinanceEntry.findOne({ tenantId: actor.tenantId, idempotencyKey: input.idempotencyKey }).lean();
        if (existing) return existing;
      }
      throw error;
    }
  },
  async recordRefund(actor: Actor, input: any) {
    if (!validId(input.paymentId)) fail(400, 'INVALID_PAYMENT_ID', 'paymentId must be a valid identifier.');
    const payment: any = await ClinicFinanceEntry.findOne({ _id: input.paymentId, tenantId: actor.tenantId, type: 'payment', status: 'posted' }).lean();
    if (!payment) fail(404, 'PAYMENT_NOT_FOUND', 'Posted payment not found in this tenant.');
    assertActorClinic(actor, payment.clinicId, payment.branchId);
    if (!money(input.amount) || input.amount <= 0) fail(400, 'INVALID_AMOUNT', 'Refund amount must be greater than zero with at most two decimal places.');
    const reservedPayment: any = await ClinicFinanceEntry.findOneAndUpdate(
      { _id: payment._id, tenantId: actor.tenantId, type: 'payment', status: 'posted', $expr: { $lte: [{ $add: [{ $ifNull: ['$refundedAmount', 0] }, input.amount] }, '$amount'] } },
      { $inc: { refundedAmount: input.amount } }, { new: true },
    ).lean();
    if (!reservedPayment) fail(409, 'REFUND_EXCEEDS_PAYMENT', 'Refund exceeds the unrefunded payment amount.');
    const invoiceReservation: any = await ClinicFinanceEntry.findOneAndUpdate(
      { _id: payment.invoiceId, tenantId: actor.tenantId, type: 'invoice', settledAmount: { $gte: input.amount } },
      { $inc: { settledAmount: -input.amount } }, { new: true },
    ).lean();
    if (!invoiceReservation) {
      await ClinicFinanceEntry.updateOne({ _id: payment._id, tenantId: actor.tenantId }, { $inc: { refundedAmount: -input.amount } });
      fail(409, 'REFUND_INVOICE_BALANCE_CONFLICT', 'The invoice balance changed while processing the refund. Retry after refreshing.');
    }
    try {
      const refund = await ClinicFinanceEntry.create({ tenantId: actor.tenantId, clinicId: payment.clinicId, branchId: payment.branchId, type: 'refund', status: 'posted', currency: payment.currency, amount: input.amount, patientId: payment.patientId, invoiceId: payment.invoiceId, paymentId: payment._id, method: input.method?.trim() || payment.method, reference: input.reference?.trim() || null, occurredAt: input.refundedAt ? new Date(input.refundedAt) : new Date(), createdBy: actor.userId });
      await audit(actor, 'finance.refund.recorded', refund, { paymentId: String(payment._id) });
      return normalizeEntry(refund);
    } catch (error) {
      await Promise.all([
        ClinicFinanceEntry.updateOne({ _id: payment._id, tenantId: actor.tenantId }, { $inc: { refundedAmount: -input.amount } }),
        ClinicFinanceEntry.updateOne({ _id: payment.invoiceId, tenantId: actor.tenantId }, { $inc: { settledAmount: input.amount } }),
      ]);
      throw error;
    }
  },
  async voidEntry(actor: Actor, input: { entryId: string; reason: string }) {
    if (!validId(input.entryId)) fail(400, 'INVALID_FINANCE_ENTRY_ID', 'entryId must be a valid identifier.');
    const entry: any = await ClinicFinanceEntry.findOne({ _id: input.entryId, tenantId: actor.tenantId }).lean();
    if (!entry) fail(404, 'FINANCE_ENTRY_NOT_FOUND', 'Finance entry not found in this tenant.');
    assertActorClinic(actor, entry.clinicId, entry.branchId);
    if (entry.type !== 'invoice' && entry.type !== 'expense') fail(409, 'FINANCE_ENTRY_NOT_VOIDABLE', 'Payments and refunds cannot be voided; use the refund/reversal workflow.');
    const filter = entry.type === 'invoice'
      ? { _id: entry._id, tenantId: actor.tenantId, type: 'invoice', status: { $in: ['draft', 'issued'] }, settledAmount: { $lte: 0 } }
      : { _id: entry._id, tenantId: actor.tenantId, type: 'expense', status: 'posted' };
    const updated = await ClinicFinanceEntry.findOneAndUpdate(
      filter,
      { $set: { status: 'void', voidedAt: new Date(), voidedBy: actor.userId, voidReason: input.reason.trim() } },
      { new: true },
    ).lean();
    if (!updated) fail(409, 'FINANCE_ENTRY_VOID_CONFLICT', 'The finance entry is settled or has changed and cannot be voided.');
    await audit(actor, 'finance.entry.voided', updated, { reason: input.reason.trim() });
    return normalizeEntry(updated);
  },
  async createPackage(actor: Actor, input: any) {
    if (!validId(input.invoiceId) || !validId(input.paymentId)) fail(400, 'INVALID_PACKAGE_SOURCE', 'A valid invoiceId and paymentId are required.');
    if (!Number.isInteger(input.sessionsPurchased) || input.sessionsPurchased < 1 || input.sessionsPurchased > 1000) fail(400, 'INVALID_PACKAGE_SESSIONS', 'sessionsPurchased must be an integer between 1 and 1000.');
    const invoice: any = await ClinicFinanceEntry.findOne({ _id: input.invoiceId, tenantId: actor.tenantId, type: 'invoice', status: 'issued' }).lean();
    if (!invoice) fail(404, 'INVOICE_NOT_FOUND', 'Issued package invoice not found in this tenant.');
    assertActorClinic(actor, invoice.clinicId, invoice.branchId);
    const payment: any = await ClinicFinanceEntry.findOne({ _id: input.paymentId, tenantId: actor.tenantId, type: 'payment', status: 'posted', invoiceId: invoice._id }).lean();
    if (!payment) fail(404, 'PAYMENT_NOT_FOUND', 'A posted payment for the package invoice is required.');
    assertActorClinic(actor, payment.clinicId, payment.branchId);
    if (!invoice.patientId || payment.currency !== invoice.currency || (payment.refundedAmount ?? 0) > 0 || invoice.settledAmount < invoice.amount || payment.amount < input.saleAmount || !money(input.saleAmount) || input.saleAmount <= 0 || input.saleAmount !== invoice.amount) {
      fail(409, 'PACKAGE_NOT_PAID', 'The package invoice must be fully settled and the linked payment must cover the package sale amount.');
    }
    const packageRecord = await ClinicFinancePackage.create({
      tenantId: actor.tenantId, clinicId: invoice.clinicId, branchId: invoice.branchId || null,
      patientId: invoice.patientId, invoiceId: invoice._id, paymentId: payment._id,
      name: String(input.name).trim(), currency: invoice.currency, saleAmount: input.saleAmount,
      sessionsPurchased: input.sessionsPurchased, sessionsRemaining: input.sessionsPurchased,
      status: 'active', expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdBy: actor.userId, updatedBy: actor.userId,
    });
    try {
      await ClinicFinancePackageEvent.create({
        tenantId: actor.tenantId, clinicId: invoice.clinicId, branchId: invoice.branchId || null,
        packageId: packageRecord._id, eventType: 'sold', sessionsDelta: input.sessionsPurchased,
        amount: input.saleAmount, currency: invoice.currency, reference: String(invoice._id),
        createdBy: actor.userId,
      });
    } catch (error) {
      await ClinicFinancePackage.deleteOne({ _id: packageRecord._id, tenantId: actor.tenantId });
      throw error;
    }
    await audit(actor, 'finance.package.sold', packageRecord, { sessionsPurchased: input.sessionsPurchased, invoiceId: String(invoice._id) });
    return normalizeEntry(packageRecord);
  },
  async redeemPackage(actor: Actor, input: any) {
    if (!validId(input.packageId)) fail(400, 'INVALID_PACKAGE_ID', 'packageId must be a valid identifier.');
    if (!Number.isInteger(input.sessions) || input.sessions < 1 || input.sessions > 100) fail(400, 'INVALID_REDEMPTION_SESSIONS', 'sessions must be an integer between 1 and 100.');
    if (!input.idempotencyKey || String(input.idempotencyKey).length < 8 || String(input.idempotencyKey).length > 120) fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid idempotencyKey is required for package redemption.');
    const existingEvent: any = await ClinicFinancePackageEvent.findOne({ tenantId: actor.tenantId, idempotencyKey: input.idempotencyKey }).lean();
    if (existingEvent) {
      if (String(existingEvent.packageId) !== String(input.packageId) || existingEvent.eventType !== 'redeemed' || existingEvent.sessionsDelta !== -input.sessions) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different package redemption.');
      return existingEvent;
    }
    const packageRecord: any = await ClinicFinancePackage.findOne({ _id: input.packageId, tenantId: actor.tenantId }).lean();
    if (!packageRecord) fail(404, 'PACKAGE_NOT_FOUND', 'Package not found in this tenant.');
    assertActorClinic(actor, packageRecord.clinicId, packageRecord.branchId);
    const now = new Date();
    if (packageRecord.expiresAt && new Date(packageRecord.expiresAt) <= now) {
      await ClinicFinancePackage.updateOne({ _id: packageRecord._id, tenantId: actor.tenantId, status: 'active' }, { $set: { status: 'expired', updatedBy: actor.userId } });
      await ClinicFinancePackageEvent.create({
        tenantId: actor.tenantId, clinicId: packageRecord.clinicId, branchId: packageRecord.branchId,
        packageId: packageRecord._id, eventType: 'expired', sessionsDelta: 0,
        reason: 'Package expiry reached.', createdBy: actor.userId,
      });
      await audit(actor, 'finance.package.expired', packageRecord);
      fail(409, 'PACKAGE_EXPIRED', 'This package has expired and cannot be redeemed.');
    }
    const updated: any = await ClinicFinancePackage.findOneAndUpdate(
      { _id: packageRecord._id, tenantId: actor.tenantId, status: 'active', sessionsRemaining: { $gte: input.sessions }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      { $inc: { sessionsRemaining: -input.sessions }, $set: { updatedBy: actor.userId } },
      { new: true },
    ).lean();
    if (!updated) fail(409, 'PACKAGE_REDEMPTION_CONFLICT', 'The package has insufficient sessions or is no longer active.');
    let event: any;
    try {
      event = await ClinicFinancePackageEvent.create({
        tenantId: actor.tenantId, clinicId: packageRecord.clinicId, branchId: packageRecord.branchId,
        packageId: packageRecord._id, eventType: 'redeemed', sessionsDelta: -input.sessions,
        reference: input.reference?.trim() || null, reason: input.reason?.trim() || null,
        idempotencyKey: input.idempotencyKey, createdBy: actor.userId,
      });
    } catch (error: any) {
      const rolledBack: any = await ClinicFinancePackage.findOneAndUpdate(
        { _id: packageRecord._id, tenantId: actor.tenantId },
        { $inc: { sessionsRemaining: input.sessions } },
        { new: true },
      ).lean();
      if (error?.code === 11000) {
        const duplicate = await ClinicFinancePackageEvent.findOne({ tenantId: actor.tenantId, idempotencyKey: input.idempotencyKey }).lean();
        if (duplicate) {
          if (rolledBack) {
            await ClinicFinancePackage.updateOne(
              { _id: packageRecord._id, tenantId: actor.tenantId, sessionsRemaining: { $gt: 0 } },
              { $set: { status: 'active' } },
            );
          }
          return duplicate;
        }
      }
      throw error;
    }
    if (updated.sessionsRemaining === 0) {
      await ClinicFinancePackage.updateOne(
        { _id: updated._id, tenantId: actor.tenantId, status: 'active', sessionsRemaining: 0 },
        { $set: { status: 'fully_redeemed' } },
      );
    }
    await audit(actor, 'finance.package.redeemed', updated, { sessions: input.sessions, packageEventId: String(event._id) });
    const current = await ClinicFinancePackage.findOne({ _id: updated._id, tenantId: actor.tenantId }).lean();
    return { package: current ?? updated, event };
  },
  async refundPackage(actor: Actor, input: any) {
    if (!validId(input.packageId)) fail(400, 'INVALID_PACKAGE_ID', 'packageId must be a valid identifier.');
    const packageRecord: any = await ClinicFinancePackage.findOne({ _id: input.packageId, tenantId: actor.tenantId }).lean();
    if (!packageRecord) fail(404, 'PACKAGE_NOT_FOUND', 'Package not found in this tenant.');
    assertActorClinic(actor, packageRecord.clinicId, packageRecord.branchId);
    if (packageRecord.status !== 'active' || packageRecord.sessionsRemaining !== packageRecord.sessionsPurchased) fail(409, 'PACKAGE_NOT_REFUNDABLE', 'Only unused active packages can be refunded.');
    const reserved = await ClinicFinancePackage.findOneAndUpdate(
      { _id: packageRecord._id, tenantId: actor.tenantId, status: 'active', sessionsRemaining: packageRecord.sessionsPurchased },
      { $set: { status: 'refund_pending', updatedBy: actor.userId } }, { new: true },
    ).lean();
    if (!reserved) fail(409, 'PACKAGE_REFUND_CONFLICT', 'Package state changed while processing the refund.');
    let refund: any;
    try {
      refund = await this.recordRefund(actor, { paymentId: String(packageRecord.paymentId), amount: packageRecord.saleAmount, method: input.method, reference: input.reference, refundedAt: input.refundedAt });
    } catch (error) {
      await ClinicFinancePackage.updateOne({ _id: packageRecord._id, tenantId: actor.tenantId, status: 'refund_pending' }, { $set: { status: 'active', updatedBy: actor.userId } });
      throw error;
    }
    const updated = await ClinicFinancePackage.findOneAndUpdate(
      { _id: packageRecord._id, tenantId: actor.tenantId, status: 'refund_pending' },
      { $set: { status: 'refunded', updatedBy: actor.userId } }, { new: true },
    ).lean();
    try {
      const event = await ClinicFinancePackageEvent.create({
        tenantId: actor.tenantId, clinicId: packageRecord.clinicId, branchId: packageRecord.branchId,
        packageId: packageRecord._id, eventType: 'refunded', sessionsDelta: 0,
        amount: packageRecord.saleAmount, currency: packageRecord.currency,
        reference: String(refund._id), reason: input.reason?.trim() || null, createdBy: actor.userId,
      });
      await audit(actor, 'finance.package.refunded', updated, { refundId: String(refund._id), packageEventId: String(event._id) });
    } catch (error) {
      logger.error('Package refund succeeded but package event logging failed.', {
        tenantId: actor.tenantId, packageId: String(packageRecord._id),
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
    return { package: updated, refund };
  },
  async listPackages(actor: Actor, scope: Scope & { status?: string }) {
    const page = Math.max(1, scope.page || 1), perPage = Math.min(100, Math.max(1, scope.perPage || 25));
    const filter: Record<string, any> = {
      tenantId: new Types.ObjectId(actor.tenantId),
      ...(scope.clinicId ? { clinicId: new Types.ObjectId(scope.clinicId) } : {}),
      ...(scope.branchId ? { branchId: new Types.ObjectId(scope.branchId) } : {}),
      ...(scope.status ? { status: scope.status } : {}),
    };
    if (actor.scope === 'clinic') filter.clinicId = new Types.ObjectId(actor.clinicId!);
    if (actor.scope === 'branch') {
      filter.clinicId = new Types.ObjectId(actor.clinicId!);
      filter.branchId = new Types.ObjectId(actor.branchId!);
    }
    const [items, total] = await Promise.all([
      ClinicFinancePackage.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * perPage).limit(perPage).lean(),
      ClinicFinancePackage.countDocuments(filter),
    ]);
    return { items, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } };
  },
  async listPackageEvents(actor: Actor, packageId: string) {
    if (!validId(packageId)) fail(400, 'INVALID_PACKAGE_ID', 'packageId must be a valid identifier.');
    const packageRecord: any = await ClinicFinancePackage.findOne({ _id: packageId, tenantId: actor.tenantId }).lean();
    if (!packageRecord) return null;
    assertActorClinic(actor, packageRecord.clinicId, packageRecord.branchId);
    return ClinicFinancePackageEvent.find({ tenantId: actor.tenantId, packageId: packageRecord._id }).sort({ createdAt: -1 }).lean();
  },
  async openDailyClose(actor: Actor, input: any) {
    await assertClinicScope(actor.tenantId, input.clinicId, input.branchId);
    assertActorClinic(actor, input.clinicId, input.branchId || null);
    if (!money(input.openingCash)) fail(400, 'INVALID_OPENING_CASH', 'openingCash must be a non-negative amount with at most two decimal places.');
    const businessDateValue = new Date(`${input.businessDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate) || !Number.isFinite(businessDateValue.getTime()) || businessDateValue.toISOString().slice(0, 10) !== input.businessDate) fail(400, 'INVALID_BUSINESS_DATE', 'businessDate must be a real calendar date in YYYY-MM-DD format.');
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format(new Date()); }
    catch { fail(400, 'INVALID_TIMEZONE', 'timezone must be a valid IANA timezone.'); }
    const periodStartAt = new Date(input.periodStartAt), periodEndAt = new Date(input.periodEndAt);
    if (!Number.isFinite(periodStartAt.getTime()) || !Number.isFinite(periodEndAt.getTime()) || periodStartAt >= periodEndAt) fail(400, 'INVALID_CLOSE_PERIOD', 'periodStartAt must be before periodEndAt.');
    const localBusinessDate = new Intl.DateTimeFormat('en-CA', { timeZone: input.timezone }).format(periodStartAt);
    if (localBusinessDate !== input.businessDate) fail(400, 'BUSINESS_DATE_MISMATCH', 'businessDate must match periodStartAt in the supplied timezone.');
    try {
      const close = await ClinicFinanceDailyClose.create({
        tenantId: actor.tenantId, clinicId: input.clinicId, branchId: input.branchId || null,
        businessDate: input.businessDate, timezone: input.timezone, currency: cleanCurrency(input.currency),
        periodStartAt, periodEndAt, openingCash: input.openingCash, status: 'open', openedBy: actor.userId,
      });
      await audit(actor, 'finance.daily_close.opened', close, { businessDate: input.businessDate, timezone: input.timezone });
      return normalizeEntry(close);
    } catch (error: any) {
      if (error?.code === 11000) fail(409, 'DAILY_CLOSE_ALREADY_EXISTS', 'A daily close already exists for this clinic/branch, date and currency.');
      throw error;
    }
  },
  async closeDailyClose(actor: Actor, input: any) {
    if (!validId(input.closeId)) fail(400, 'INVALID_DAILY_CLOSE_ID', 'closeId must be a valid identifier.');
    if (!money(input.countedCash)) fail(400, 'INVALID_COUNTED_CASH', 'countedCash must be a non-negative amount with at most two decimal places.');
    const close: any = await ClinicFinanceDailyClose.findOne({ _id: input.closeId, tenantId: actor.tenantId, status: 'open' }).lean();
    if (!close) fail(404, 'OPEN_DAILY_CLOSE_NOT_FOUND', 'Open daily close not found in this tenant.');
    assertActorClinic(actor, close.clinicId, close.branchId);
    if (new Date(close.periodEndAt) > new Date()) fail(409, 'DAILY_CLOSE_PERIOD_NOT_ENDED', 'The cash period cannot be closed before its end time.');
    const match: Record<string, any> = {
      tenantId: new Types.ObjectId(actor.tenantId), clinicId: close.clinicId,
      currency: close.currency, status: 'posted',
      type: { $in: ['payment', 'refund', 'expense'] }, method: 'cash',
      occurredAt: { $gte: close.periodStartAt, $lt: close.periodEndAt },
      ...(close.branchId ? { branchId: close.branchId } : {}),
    };
    const grouped = await ClinicFinanceEntry.aggregate([{ $match: match }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]);
    const totals = Object.fromEntries(grouped.map((row: any) => [row._id, row.total]));
    const cashPayments = totals.payment ?? 0, cashRefunds = totals.refund ?? 0, cashExpenses = totals.expense ?? 0;
    const expectedCash = Math.round((close.openingCash + cashPayments - cashRefunds - cashExpenses) * 100) / 100;
    const variance = Math.round((input.countedCash - expectedCash) * 100) / 100;
    if (variance !== 0 && !input.varianceReason?.trim()) fail(400, 'CASH_VARIANCE_REASON_REQUIRED', 'A reason is required when counted cash differs from expected cash.');
    const updated = await ClinicFinanceDailyClose.findOneAndUpdate(
      { _id: close._id, tenantId: actor.tenantId, status: 'open' },
      { $set: { status: 'closed', expectedCash, countedCash: input.countedCash, variance, varianceReason: input.varianceReason?.trim() || null, cashPayments, cashRefunds, cashExpenses, closedBy: actor.userId, closedAt: new Date() } },
      { new: true },
    ).lean();
    if (!updated) fail(409, 'DAILY_CLOSE_CONFLICT', 'The daily close was modified by another user.');
    await audit(actor, 'finance.daily_close.closed', updated, { expectedCash, countedCash: input.countedCash, variance });
    return updated;
  },
  async approveDailyClose(actor: Actor, closeId: string) {
    if (!validId(closeId)) fail(400, 'INVALID_DAILY_CLOSE_ID', 'closeId must be a valid identifier.');
    const close: any = await ClinicFinanceDailyClose.findOne({ _id: closeId, tenantId: actor.tenantId, status: 'closed' }).lean();
    if (!close) fail(404, 'CLOSED_DAILY_CLOSE_NOT_FOUND', 'Closed daily close not found in this tenant.');
    assertActorClinic(actor, close.clinicId, close.branchId);
    if (String(close.closedBy) === actor.userId) fail(403, 'DAILY_CLOSE_SEPARATION_REQUIRED', 'The user who closed the cash period cannot approve it.');
    const updated = await ClinicFinanceDailyClose.findOneAndUpdate(
      { _id: close._id, tenantId: actor.tenantId, status: 'closed', closedBy: { $ne: actor.userId } },
      { $set: { status: 'approved', approvedBy: actor.userId, approvedAt: new Date() } },
      { new: true },
    ).lean();
    if (!updated) fail(409, 'DAILY_CLOSE_APPROVAL_CONFLICT', 'The daily close changed before approval.');
    await audit(actor, 'finance.daily_close.approved', updated);
    return updated;
  },
  async listDailyCloses(tenantId: string, scope: Scope) {
    const filter: Record<string, any> = {
      tenantId: new Types.ObjectId(tenantId),
      ...(scope.clinicId ? { clinicId: new Types.ObjectId(scope.clinicId) } : {}),
      ...(scope.branchId ? { branchId: new Types.ObjectId(scope.branchId) } : {}),
    };
    if (scope.from || scope.to) filter.periodStartAt = {
      ...(scope.from ? { $gte: scope.from } : {}),
      ...(scope.to ? { $lte: scope.to } : {}),
    };
    return ClinicFinanceDailyClose.find(filter).sort({ periodStartAt: -1 }).limit(100).lean();
  },
  async createExpense(actor: Actor, input: any) {
    await assertClinicScope(actor.tenantId, input.clinicId, input.branchId);
    assertActorClinic(actor, input.clinicId, input.branchId || null);
    if (!money(input.amount) || input.amount <= 0) fail(400, 'INVALID_AMOUNT', 'Expense amount must be greater than zero with at most two decimal places.');
    const currency = cleanCurrency(input.currency);
    if (!/^[A-Z]{3}$/.test(currency)) fail(400, 'INVALID_CURRENCY', 'currency must be a three-letter ISO currency code.');
    const expense = await ClinicFinanceEntry.create({ tenantId: actor.tenantId, clinicId: input.clinicId, branchId: input.branchId || null, type: 'expense', status: 'posted', currency, amount: input.amount, category: input.category.trim(), description: input.description?.trim() || '', reference: input.reference?.trim() || null, method: input.method?.trim() || 'other', occurredAt: input.spentAt ? new Date(input.spentAt) : new Date(), createdBy: actor.userId });
    await audit(actor, 'finance.expense.recorded', expense);
    return normalizeEntry(expense);
  },
  async listEntries(tenantId: string, scope: Scope) {
    const page = Math.max(1, scope.page || 1), perPage = Math.min(100, Math.max(1, scope.perPage || 25));
    const filter = scopeFilter(tenantId, scope);
    const [items, total] = await Promise.all([
      ClinicFinanceEntry.find(filter).sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * perPage).limit(perPage).lean(),
      ClinicFinanceEntry.countDocuments(filter),
    ]);
    return { items, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } };
  },
  async clinicComparison(tenantId: string, scope: Scope) {
    const rows = await ClinicFinanceEntry.aggregate([
      { $match: { ...scopeFilter(tenantId, scope), status: { $in: ['issued', 'posted'] } } },
      { $group: { _id: { clinicId: '$clinicId', branchId: '$branchId', currency: '$currency', type: '$type' }, total: { $sum: '$amount' } } },
    ]);
    const clinicIds = [...new Set(rows.map((row: any) => String(row._id.clinicId)))];
    const branchIds = [...new Set(rows.map((row: any) => row._id.branchId ? String(row._id.branchId) : null).filter(Boolean))];
    const [clinics, branches] = await Promise.all([
      Clinic.find({ tenantId, _id: { $in: clinicIds } }).select('_id name').lean(),
      Branch.find({ tenantId, _id: { $in: branchIds } }).select('_id name').lean(),
    ]);
    const clinicNames = new Map(clinics.map((item: any) => [String(item._id), item.name]));
    const branchNames = new Map(branches.map((item: any) => [String(item._id), item.name]));
    const result: Record<string, any> = {};
    for (const row of rows) {
      const clinicId = String(row._id.clinicId), branchId = row._id.branchId ? String(row._id.branchId) : null;
      const key = clinicId + ':' + (branchId || 'all') + ':' + row._id.currency;
      result[key] ||= { clinicId, clinicName: clinicNames.get(clinicId) || 'Clinic', branchId, branchName: branchId ? branchNames.get(branchId) || 'Branch' : null, currency: row._id.currency, invoiced: 0, collected: 0, refunded: 0, expenses: 0, operatingResult: 0, netCash: 0 };
      const item = result[key];
      if (row._id.type === 'invoice') item.invoiced += row.total;
      if (row._id.type === 'payment') item.collected += row.total;
      if (row._id.type === 'refund') item.refunded += row.total;
      if (row._id.type === 'expense') item.expenses += row.total;
      item.operatingResult = Math.round((item.invoiced - item.refunded - item.expenses) * 100) / 100;
      item.netCash = Math.round((item.collected - item.refunded - item.expenses) * 100) / 100;
    }
    return Object.values(result);
  },
  async revenueTrends(tenantId: string, scope: Scope) {
    const rows = await ClinicFinanceEntry.aggregate([
      { $match: { ...scopeFilter(tenantId, scope), type: { $in: ['invoice', 'payment', 'refund'] }, status: { $in: ['issued', 'posted'] } } },
      { $group: { _id: { period: { $dateToString: { format: '%Y-%m', date: '$occurredAt' } }, currency: '$currency', type: '$type' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { '_id.period': 1 } },
    ]);
    const trends: Record<string, any> = {};
    for (const row of rows) {
      const key = row._id.period + ':' + row._id.currency;
      trends[key] ||= { period: row._id.period, currency: row._id.currency, invoiced: 0, collected: 0, refunded: 0, invoiceCount: 0, paymentCount: 0 };
      const item = trends[key];
      if (row._id.type === 'invoice') { item.invoiced += row.total; item.invoiceCount += row.count; }
      if (row._id.type === 'payment') { item.collected += row.total; item.paymentCount += row.count; }
      if (row._id.type === 'refund') item.refunded += row.total;
    }
    const [methods, mix] = await Promise.all([
      ClinicFinanceEntry.aggregate([
        { $match: { ...scopeFilter(tenantId, scope), type: 'payment', status: 'posted' } },
        { $group: { _id: { currency: '$currency', method: '$method' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { amount: -1 } },
      ]),
      ClinicFinanceEntry.aggregate([
        { $match: { ...scopeFilter(tenantId, scope), type: 'invoice', status: 'issued' } },
        { $unwind: '$lineItems' },
        { $group: { _id: { currency: '$currency', category: { $ifNull: ['$lineItems.category', 'Uncategorized'] } }, amount: { $sum: '$lineItems.total' } } },
        { $sort: { amount: -1 } },
      ]),
    ]);
    return {
      timezone: 'UTC',
      trends: Object.values(trends),
      paymentMethods: methods.map((row: any) => ({ currency: row._id.currency, method: row._id.method || 'other', amount: row.amount, count: row.count })),
      revenueMix: mix.map((row: any) => ({ currency: row._id.currency, category: row._id.category, amount: row.amount })),
    };
  },
  async expenseSummary(tenantId: string, scope: Scope) {
    const rows = await ClinicFinanceEntry.aggregate([
      { $match: { ...scopeFilter(tenantId, scope), type: 'expense', status: 'posted' } },
      { $group: { _id: { currency: '$currency', category: '$category', clinicId: '$clinicId', branchId: '$branchId' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]);
    const clinicIds = [...new Set(rows.map((row: any) => String(row._id.clinicId)))];
    const clinics = await Clinic.find({ tenantId, _id: { $in: clinicIds } }).select('_id name').lean();
    const names = new Map(clinics.map((item: any) => [String(item._id), item.name]));
    return rows.map((row: any) => ({ currency: row._id.currency, category: row._id.category || 'Uncategorized', clinicId: String(row._id.clinicId), clinicName: names.get(String(row._id.clinicId)) || 'Clinic', branchId: row._id.branchId ? String(row._id.branchId) : null, amount: row.amount, count: row.count }));
  },
  async exportReport(tenantId: string, scope: Scope) {
    const rows = await this.clinicComparison(tenantId, scope);
    const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const headers = ['clinicId','clinicName','branchId','branchName','currency','invoiced','collected','refunded','expenses','operatingResult','netCash'];
    const csv = [headers.join(','), ...rows.map((row: any) => headers.map((key) => quote(row[key])).join(','))].join('\n');
    return { csv, exported: rows.length, truncated: false };
  },
  async overview(tenantId: string, scope: Scope) {
    const base = scopeFilter(tenantId, scope);
    const match = { ...base, status: { $in: ['issued', 'posted'] } };
    const grouped = await ClinicFinanceEntry.aggregate([
      { $match: match },
      { $group: { _id: { type: '$type', currency: '$currency', clinicId: '$clinicId', branchId: '$branchId' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const byCurrency: Record<string, any> = {};
    for (const row of grouped) {
      const currency = row._id.currency;
      byCurrency[currency] ||= { currency, invoiced: 0, collected: 0, refunded: 0, expenses: 0, operatingResult: 0, netCash: 0, invoiceCount: 0, paymentCount: 0, refundCount: 0, expenseCount: 0 };
      const item = byCurrency[currency];
      if (row._id.type === 'invoice') { item.invoiced += row.total; item.invoiceCount += row.count; }
      if (row._id.type === 'payment') { item.collected += row.total; item.paymentCount += row.count; }
      if (row._id.type === 'refund') { item.refunded += row.total; item.refundCount += row.count; }
      if (row._id.type === 'expense') { item.expenses += row.total; item.expenseCount += row.count; }
    }
    for (const item of Object.values(byCurrency) as any[]) { item.operatingResult = Math.round((item.invoiced - item.refunded - item.expenses) * 100) / 100; item.netCash = Math.round((item.collected - item.refunded - item.expenses) * 100) / 100; }
    const outstanding = await ClinicFinanceEntry.aggregate([
      { $match: { ...base, type: 'invoice', status: 'issued' } },
      { $addFields: { balance: { $max: [0, { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }] } } },
      { $group: { _id: '$currency', outstanding: { $sum: '$balance' }, invoiceCount: { $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] } } } },
    ]);
    const clinics = await ClinicFinanceEntry.aggregate([
      { $match: match },
      { $group: { _id: { clinicId: '$clinicId', type: '$type', currency: '$currency' }, total: { $sum: '$amount' } } },
    ]);
    const byClinic: Record<string, any> = {};
    for (const row of clinics) {
      const id = String(row._id.clinicId), currency = row._id.currency;
      byClinic[id] ||= { clinicId: id, currencies: {} };
      byClinic[id].currencies[currency] ||= { invoiced: 0, collected: 0, refunded: 0, expenses: 0, operatingResult: 0, netCash: 0 };
      const v = byClinic[id].currencies[currency];
      if (row._id.type === 'invoice') v.invoiced += row.total;
      if (row._id.type === 'payment') v.collected += row.total;
      if (row._id.type === 'refund') v.refunded += row.total;
      if (row._id.type === 'expense') v.expenses += row.total;
      v.operatingResult = Math.round((v.invoiced - v.refunded - v.expenses) * 100) / 100; v.netCash = Math.round((v.collected - v.refunded - v.expenses) * 100) / 100;
    }
    return { period: { from: scope.from || null, to: scope.to || null }, filters: { clinicId: scope.clinicId || null, branchId: scope.branchId || null }, currencies: Object.values(byCurrency), outstanding: outstanding.map((x: any) => ({ currency: x._id, amount: x.outstanding, invoiceCount: x.invoiceCount })), clinics: Object.values(byClinic), generatedAt: new Date().toISOString(), currencyConversion: 'not_performed' };
  },
};
