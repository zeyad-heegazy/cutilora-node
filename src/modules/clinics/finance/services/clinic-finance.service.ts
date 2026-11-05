import { Types } from 'mongoose';
import { ClinicFinanceEntry } from '../models/clinic-finance-entry.model.js';
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
  return { tenantId, ...(scope.clinicId ? { clinicId: scope.clinicId } : {}), ...(scope.branchId ? { branchId: scope.branchId } : {}), ...(scope.currency ? { currency: cleanCurrency(scope.currency) } : {}), ...dateFilter(scope) };
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
    const data = { tenantId: actor.tenantId, clinicId: input.clinicId, branchId: input.branchId || null, type: 'invoice', status: input.status === 'draft' ? 'draft' : 'issued', currency, amount, patientId: input.patientId && validId(input.patientId) ? input.patientId : null, invoiceNumber: input.invoiceNumber?.trim() || null, description: input.description?.trim() || '', lineItems, occurredAt: input.issuedAt ? new Date(input.issuedAt) : new Date(), createdBy: actor.userId };
    if (input.patientId && !validId(input.patientId)) fail(400, 'INVALID_PATIENT_ID', 'patientId must be a valid identifier.');
    if (input.invoiceNumber && await ClinicFinanceEntry.exists({ tenantId: actor.tenantId, invoiceNumber: input.invoiceNumber.trim() })) fail(409, 'INVOICE_NUMBER_EXISTS', 'Invoice number already exists for this tenant.');
    try { const created = await ClinicFinanceEntry.create(data); await audit(actor, 'finance.invoice.created', created); return normalizeEntry(created); }
    catch (error: any) { if (error?.code === 11000) fail(409, 'INVOICE_NUMBER_EXISTS', 'Invoice number already exists for this tenant.'); throw error; }
  },
  async recordPayment(actor: Actor, input: any) {
    if (!validId(input.invoiceId)) fail(400, 'INVALID_INVOICE_ID', 'invoiceId must be a valid identifier.');
    const invoice = await ClinicFinanceEntry.findOne({ _id: input.invoiceId, tenantId: actor.tenantId, type: 'invoice', status: 'issued' }).lean();
    if (!invoice) fail(404, 'INVOICE_NOT_FOUND', 'Issued invoice not found in this tenant.');
    assertActorClinic(actor, invoice.clinicId, invoice.branchId);
    if (!money(input.amount) || input.amount <= 0) fail(400, 'INVALID_AMOUNT', 'Payment amount must be greater than zero with at most two decimal places.');
    if (cleanCurrency(input.currency) !== invoice.currency) fail(409, 'CURRENCY_MISMATCH', 'Payment currency must match the invoice currency.');
    if (input.branchId && String(input.branchId) !== String(invoice.branchId || '')) fail(400, 'BRANCH_SCOPE_MISMATCH', 'Payment branch must match the invoice branch.');
    if (input.idempotencyKey) {
      const existing = await ClinicFinanceEntry.findOne({ tenantId: actor.tenantId, idempotencyKey: input.idempotencyKey }).lean();
      if (existing) { if (existing.type !== 'payment' || String(existing.invoiceId) !== String(input.invoiceId) || existing.amount !== input.amount || existing.currency !== invoice.currency) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different payment.'); return existing; }
    }
    const reserved = await ClinicFinanceEntry.findOneAndUpdate(
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
        const existing = await ClinicFinanceEntry.findOne({ tenantId: actor.tenantId, idempotencyKey: input.idempotencyKey }).lean();
        if (existing) return existing;
      }
      throw error;
    }
  },
  async recordRefund(actor: Actor, input: any) {
    if (!validId(input.paymentId)) fail(400, 'INVALID_PAYMENT_ID', 'paymentId must be a valid identifier.');
    const payment = await ClinicFinanceEntry.findOne({ _id: input.paymentId, tenantId: actor.tenantId, type: 'payment', status: 'posted' }).lean();
    if (!payment) fail(404, 'PAYMENT_NOT_FOUND', 'Posted payment not found in this tenant.');
    assertActorClinic(actor, payment.clinicId, payment.branchId);
    if (!money(input.amount) || input.amount <= 0) fail(400, 'INVALID_AMOUNT', 'Refund amount must be greater than zero with at most two decimal places.');
    const reservedPayment = await ClinicFinanceEntry.findOneAndUpdate(
      { _id: payment._id, tenantId: actor.tenantId, type: 'payment', status: 'posted', $expr: { $lte: [{ $add: [{ $ifNull: ['$refundedAmount', 0] }, input.amount] }, '$amount'] } },
      { $inc: { refundedAmount: input.amount } }, { new: true },
    ).lean();
    if (!reservedPayment) fail(409, 'REFUND_EXCEEDS_PAYMENT', 'Refund exceeds the unrefunded payment amount.');
    try {
      const refund = await ClinicFinanceEntry.create({ tenantId: actor.tenantId, clinicId: payment.clinicId, branchId: payment.branchId, type: 'refund', status: 'posted', currency: payment.currency, amount: input.amount, patientId: payment.patientId, invoiceId: payment.invoiceId, paymentId: payment._id, method: input.method?.trim() || payment.method, reference: input.reference?.trim() || null, occurredAt: input.refundedAt ? new Date(input.refundedAt) : new Date(), createdBy: actor.userId });
      await ClinicFinanceEntry.updateOne({ _id: payment.invoiceId, tenantId: actor.tenantId, type: 'invoice' }, { $inc: { settledAmount: -input.amount } });
      await audit(actor, 'finance.refund.recorded', refund, { paymentId: String(payment._id) });
      return normalizeEntry(refund);
    } catch (error) {
      await ClinicFinanceEntry.updateOne({ _id: payment._id, tenantId: actor.tenantId }, { $inc: { refundedAmount: -input.amount } });
      throw error;
    }
  },
  async createExpense(actor: Actor, input: any) {
    await assertClinicScope(actor.tenantId, input.clinicId, input.branchId);
    if (!money(input.amount) || input.amount <= 0) fail(400, 'INVALID_AMOUNT', 'Expense amount must be greater than zero with at most two decimal places.');
    const currency = cleanCurrency(input.currency);
    if (!/^[A-Z]{3}$/.test(currency)) fail(400, 'INVALID_CURRENCY', 'currency must be a three-letter ISO currency code.');
    const expense = await ClinicFinanceEntry.create({ tenantId: actor.tenantId, clinicId: input.clinicId, branchId: input.branchId || null, type: 'expense', status: 'posted', currency, amount: input.amount, category: input.category.trim(), description: input.description?.trim() || '', reference: input.reference?.trim() || null, occurredAt: input.spentAt ? new Date(input.spentAt) : new Date(), createdBy: actor.userId });
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
      byCurrency[currency] ||= { currency, invoiced: 0, collected: 0, refunded: 0, expenses: 0, netCash: 0, invoiceCount: 0, paymentCount: 0, refundCount: 0, expenseCount: 0 };
      const item = byCurrency[currency];
      if (row._id.type === 'invoice') { item.invoiced += row.total; item.invoiceCount += row.count; }
      if (row._id.type === 'payment') { item.collected += row.total; item.paymentCount += row.count; }
      if (row._id.type === 'refund') { item.refunded += row.total; item.refundCount += row.count; }
      if (row._id.type === 'expense') { item.expenses += row.total; item.expenseCount += row.count; }
    }
    for (const item of Object.values(byCurrency) as any[]) item.netCash = Math.round((item.collected - item.refunded - item.expenses) * 100) / 100;
    const outstanding = await ClinicFinanceEntry.aggregate([
      { $match: { ...base, type: 'invoice', status: 'issued' } },
      { $lookup: { from: 'clinicfinanceentries', let: { invoice: '$_id', tenant: '$tenantId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$tenantId', '$$tenant'] }, { $eq: ['$invoiceId', '$$invoice'] }, { $in: ['$type', ['payment','refund']] }, { $eq: ['$status', 'posted'] }] } } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ], as: 'settlements' } },
      { $addFields: { paid: { $sum: { $map: { input: '$settlements', as: 's', in: { $cond: [{ $eq: ['$$s._id','payment'] }, '$$s.total', { $multiply: ['$$s.total', -1] }] } } } } },
      { $addFields: { balance: { $max: [0, { $subtract: ['$amount', '$paid'] }] } } },
      { $group: { _id: '$currency', outstanding: { $sum: '$balance' }, invoiceCount: { $sum: { $cond: [{ $gt: ['$balance',0] },1,0] } } } },
    ]);
    const clinics = await ClinicFinanceEntry.aggregate([
      { $match: match },
      { $group: { _id: { clinicId: '$clinicId', type: '$type', currency: '$currency' }, total: { $sum: '$amount' } } },
    ]);
    const byClinic: Record<string, any> = {};
    for (const row of clinics) {
      const id = String(row._id.clinicId), currency = row._id.currency;
      byClinic[id] ||= { clinicId: id, currencies: {} };
      byClinic[id].currencies[currency] ||= { invoiced: 0, collected: 0, refunded: 0, expenses: 0, netCash: 0 };
      const v = byClinic[id].currencies[currency];
      if (row._id.type === 'invoice') v.invoiced += row.total;
      if (row._id.type === 'payment') v.collected += row.total;
      if (row._id.type === 'refund') v.refunded += row.total;
      if (row._id.type === 'expense') v.expenses += row.total;
      v.netCash = Math.round((v.collected - v.refunded - v.expenses) * 100) / 100;
    }
    return { period: { from: scope.from || null, to: scope.to || null }, filters: { clinicId: scope.clinicId || null, branchId: scope.branchId || null }, currencies: Object.values(byCurrency), outstanding: outstanding.map((x: any) => ({ currency: x._id, amount: x.outstanding, invoiceCount: x.invoiceCount })), clinics: Object.values(byClinic), generatedAt: new Date().toISOString(), currencyConversion: 'not_performed' };
  },
};
