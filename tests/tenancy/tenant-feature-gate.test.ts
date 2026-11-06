import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscriptionMock = vi.hoisted(() => ({ findOne: vi.fn() }));
vi.mock('../../src/modules/tenancy/models/subscription.model.js', () => ({ Subscription: subscriptionMock }));

import { requireTenantFeature } from '../../src/modules/tenancy/middleware/tenant-permissions.js';

const tenantId = '64b000000000000000000001';
function invoke(features: string[] | null) {
  const query = { select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(features ? { plan: { features } } : null) };
  subscriptionMock.findOne.mockReturnValue(query);
  const req = { tenantContext: { tenantId } } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  return { run: requireTenantFeature('integrations')(req, res, next), res, next };
}

describe('tenant subscription feature gates', () => {
  beforeEach(() => vi.resetAllMocks());

  it('allows access when the active subscription includes the requested feature', async () => {
    const result = invoke(['integrations', 'webhooks']);
    await result.run;
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.res.status).not.toHaveBeenCalled();
  });

  it('denies access when the plan does not include the requested feature', async () => {
    const result = invoke(['webhooks']);
    await result.run;
    expect(result.res.status).toHaveBeenCalledWith(403);
    expect(result.res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'SUBSCRIPTION_FEATURE_REQUIRED' }),
    }));
    expect(result.next).not.toHaveBeenCalled();
  });

  it('denies access when the tenant has no subscription', async () => {
    const result = invoke(null);
    await result.run;
    expect(result.res.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();
  });
});
