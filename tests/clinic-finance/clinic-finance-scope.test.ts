import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoiceFindOne: vi.fn(),
}));

vi.mock('../../src/modules/tenancy/models/clinic.model.js', () => ({ Clinic: { findOne: vi.fn() } }));
vi.mock('../../src/modules/clinic-finance/models/clinic-invoice.model.js', () => ({
  ClinicInvoice: { findOne: mocks.invoiceFindOne },
  ClinicInvoiceCounter: {},
}));
vi.mock('../../src/modules/clinic-finance/models/clinic-expense.model.js', () => ({ ClinicExpense: {} }));
vi.mock('../../src/modules/clinic-finance/models/clinic-cash-session.model.js', () => ({ ClinicCashSession: {} }));

import { clinicFinanceService } from '../../src/modules/clinic-finance/clinic-finance.service.js';

describe('clinic finance tenant and clinic isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoiceFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it('always scopes invoice reads by tenant and clinic', async () => {
    await clinicFinanceService.getInvoice({
      tenantId: '64b000000000000000000001',
      clinicId: '64b000000000000000000002',
      branchId: null,
      userId: '64b000000000000000000003',
    }, '64b000000000000000000004');

    expect(mocks.invoiceFindOne).toHaveBeenCalledWith({
      _id: '64b000000000000000000004',
      tenantId: '64b000000000000000000001',
      clinicId: '64b000000000000000000002',
    });
  });

  it('adds the authenticated branch to the query for branch-scoped users', async () => {
    await clinicFinanceService.getInvoice({
      tenantId: '64b000000000000000000001',
      clinicId: '64b000000000000000000002',
      branchId: '64b000000000000000000005',
      userId: '64b000000000000000000003',
    }, '64b000000000000000000004');

    expect(mocks.invoiceFindOne).toHaveBeenCalledWith({
      _id: '64b000000000000000000004',
      tenantId: '64b000000000000000000001',
      clinicId: '64b000000000000000000002',
      branchId: '64b000000000000000000005',
    });
  });
});
