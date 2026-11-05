import { Clinic } from '../tenancy/models/clinic.model.js';
import { ClinicInvoice } from './models/clinic-invoice.model.js';
import { ClinicExpense } from './models/clinic-expense.model.js';
import { ClinicCashSession } from './models/clinic-cash-session.model.js';

type Scope = { tenantId: string; clinicId: string; branchId: string | null; userId: string };
const scopeFilter = (scope: Scope) => ({ tenantId: scope.tenantId, clinicId: scope.clinicId, branchId: scope.branchId });

async function findOpen(scope: Scope) {
  return ClinicCashSession.findOne({ ...scopeFilter(scope), status: 'open' });
}
export function calculateCashSessionBalance(input: { openingBalanceMinor: number; collectedMinor: number; refundedMinor: number; cashExpensesMinor: number; movements: Array<{ direction: 'in' | 'out'; amountMinor: number }> }) {
  const movementNet = input.movements.reduce((sum, movement) => sum + (movement.direction === 'in' ? movement.amountMinor : -movement.amountMinor), 0);
  const expected = input.openingBalanceMinor + input.collectedMinor - input.refundedMinor - input.cashExpensesMinor + movementNet;
  if (!Number.isSafeInteger(expected)) throw { status: 409, code: 'CASH_BALANCE_OUT_OF_RANGE', message: 'Expected cash balance exceeds the supported range.' };
  return expected;
}

async function calculateExpected(session: any, scope: Scope) {
  const [invoices, expenses] = await Promise.all([
    ClinicInvoice.find({ ...scopeFilter(scope), 'payments.cashSessionId': session._id }).select('payments').lean(),
    ClinicExpense.find({ ...scopeFilter(scope), cashSessionId: session._id, status: 'paid' }).select('amountMinor').lean(),
  ]);
  let collectedMinor = 0;
  let refundedMinor = 0;
  for (const invoice of invoices as any[]) {
    for (const payment of invoice.payments ?? []) {
      if (String(payment.cashSessionId ?? '') !== String(session._id)) continue;
      if (payment.method === 'cash') collectedMinor += payment.amountMinor;
      for (const refund of payment.refunds ?? []) {
        if (refund.method === 'cash' && String(refund.cashSessionId ?? '') === String(session._id)) refundedMinor += refund.amountMinor;
      }
    }
  }
  const cashExpensesMinor = (expenses as any[]).reduce((sum, expense) => sum + expense.amountMinor, 0);
  return calculateCashSessionBalance({ openingBalanceMinor: session.openingBalanceMinor, collectedMinor, refundedMinor, cashExpensesMinor, movements: session.movements ?? [] });
}

export const cashSessionService = {
  async getOpen(scope: Scope) {
    return findOpen(scope);
  },

  async open(scope: Scope, input: { openingBalanceMinor: number }) {
    const clinic = await Clinic.findOne({ _id: scope.clinicId, tenantId: scope.tenantId, status: 'active' }).select('preferences.currency');
    if (!clinic) throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'Clinic not found in the selected tenant.' };
    try {
      return await ClinicCashSession.create({
        ...scopeFilter(scope), currency: clinic.preferences?.currency ?? 'EGP',
        status: 'open', openedAt: new Date(), openedBy: scope.userId,
        openingBalanceMinor: input.openingBalanceMinor,
        events: [{ type: 'cash_session.opened', actorUserId: scope.userId, occurredAt: new Date() }],
      });
    } catch (error: any) {
      if (error?.code === 11000) throw { status: 409, code: 'CASH_SESSION_ALREADY_OPEN', message: 'A cash session is already open for this clinic/branch.' };
      throw error;
    }
  },

  async addMovement(scope: Scope, sessionId: string, input: any) {
    const session = await ClinicCashSession.findOne({ _id: sessionId, ...scopeFilter(scope) });
    if (!session) return null;
    const existing = session.movements.find((item: any) => item.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (existing.direction !== input.direction || existing.amountMinor !== input.amountMinor || existing.reason !== input.reason) throw { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with different cash movement details.' };
      return session;
    }
    if (session.status !== 'open') throw { status: 409, code: 'CASH_SESSION_LOCKED', message: 'Cash movements can only be recorded in an open session.' };
    const updated = await ClinicCashSession.findOneAndUpdate(
      { _id: sessionId, ...scopeFilter(scope), status: 'open', version: session.version },
      { $push: { movements: { ...input, recordedAt: new Date(), recordedBy: scope.userId }, events: { type: 'cash_movement.recorded', actorUserId: scope.userId, occurredAt: new Date(), metadata: { direction: input.direction, amountMinor: input.amountMinor } } }, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'CASH_SESSION_CHANGED', message: 'Cash session changed. Reload and retry.' };
    return updated;
  },

  async close(scope: Scope, sessionId: string, input: { countedBalanceMinor: number; varianceReason?: string }) {
    const session = await ClinicCashSession.findOne({ _id: sessionId, ...scopeFilter(scope) });
    if (!session) throw { status: 404, code: 'OPEN_CASH_SESSION_NOT_FOUND', message: 'Cash session not found.' };
    if (session.status !== 'open') {
      if (['pending_review', 'approved'].includes(session.status) && String(session.closedBy) === scope.userId && session.countedBalanceMinor === input.countedBalanceMinor && session.varianceReason === (input.varianceReason ?? '')) return session;
      throw { status: 409, code: 'CASH_SESSION_NOT_OPEN', message: 'Cash session is already closed or locked.' };
    }
    const expectedBalanceMinor = await calculateExpected(session, scope);
    const varianceMinor = input.countedBalanceMinor - expectedBalanceMinor;
    if (varianceMinor !== 0 && !input.varianceReason?.trim()) throw { status: 400, code: 'CASH_VARIANCE_REASON_REQUIRED', message: 'A reason is required when counted cash differs from expected cash.' };
    const now = new Date();
    const updated = await ClinicCashSession.findOneAndUpdate(
      { _id: sessionId, ...scopeFilter(scope), status: 'open', version: session.version },
      { $set: { status: 'pending_review', expectedBalanceMinor, countedBalanceMinor: input.countedBalanceMinor, varianceMinor, varianceReason: input.varianceReason ?? '', closedAt: now, closedBy: scope.userId },
        $push: { events: { type: 'cash_session.closed', actorUserId: scope.userId, occurredAt: now, metadata: { expectedBalanceMinor, countedBalanceMinor: input.countedBalanceMinor, varianceMinor } } }, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'CASH_SESSION_CHANGED', message: 'Cash session changed while closing. Reload and retry.' };
    return updated;
  },

  async approve(scope: Scope, sessionId: string) {
    const session = await ClinicCashSession.findOne({ _id: sessionId, ...scopeFilter(scope) });
    if (!session) throw { status: 404, code: 'CASH_SESSION_REVIEW_NOT_FOUND', message: 'Cash session not found.' };
    if (session.status === 'approved' && String(session.reviewedBy) === scope.userId) return session;
    if (session.status !== 'pending_review') throw { status: 409, code: 'CASH_SESSION_NOT_REVIEWABLE', message: 'Cash session is not awaiting review.' };
    if (String(session.openedBy) === scope.userId || String(session.closedBy) === scope.userId) {
      throw { status: 403, code: 'CASH_SESSION_SEPARATION_OF_DUTIES', message: 'The user who opened or closed a cash session cannot approve it.' };
    }
    const now = new Date();
    const updated = await ClinicCashSession.findOneAndUpdate(
      { _id: sessionId, ...scopeFilter(scope), status: 'pending_review', version: session.version },
      { $set: { status: 'approved', reviewedAt: now, reviewedBy: scope.userId },
        $push: { events: { type: 'cash_session.approved', actorUserId: scope.userId, occurredAt: now } }, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'CASH_SESSION_CHANGED', message: 'Cash session changed while approving. Reload and retry.' };
    return updated;
  },
};
