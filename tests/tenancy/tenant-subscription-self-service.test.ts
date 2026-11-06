import { describe, expect, it } from 'vitest';
import {
  tenantBillingProfileSchema,
  tenantSubscriptionChangeRequestSchema,
} from '../../src/modules/tenancy/validations/tenancy.validation.js';

describe('tenant subscription self-service validation', () => {
  it('accepts partial billing profile updates and normalizes contact values', () => {
    expect(tenantBillingProfileSchema.parse({
      email: ' BILLING@EXAMPLE.COM ',
      countryCode: 'eg',
    })).toEqual({
      email: 'billing@example.com',
      countryCode: 'EG',
    });
  });

  it('rejects an empty billing profile update', () => {
    expect(tenantBillingProfileSchema.safeParse({}).success).toBe(false);
  });

  it('requires a target plan for upgrades and downgrades', () => {
    expect(tenantSubscriptionChangeRequestSchema.safeParse({ type: 'upgrade' }).success).toBe(false);
    expect(tenantSubscriptionChangeRequestSchema.parse({
      type: 'downgrade',
      targetPlanCode: ' BASIC ',
    })).toMatchObject({ type: 'downgrade', targetPlanCode: 'basic', effectiveAt: 'period_end' });
  });

  it('does not accept plan details for cancellation or reactivation requests', () => {
    expect(tenantSubscriptionChangeRequestSchema.safeParse({
      type: 'cancel',
      targetPlanCode: 'basic',
    }).success).toBe(false);
    expect(tenantSubscriptionChangeRequestSchema.parse({ type: 'cancel' })).toMatchObject({
      type: 'cancel',
      effectiveAt: 'period_end',
    });
  });

  it('rejects unsupported billing cycles and malformed email addresses', () => {
    expect(tenantBillingProfileSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(tenantSubscriptionChangeRequestSchema.safeParse({
      type: 'upgrade',
      targetPlanCode: 'pro',
      targetBillingCycle: 'weekly',
    }).success).toBe(false);
  });
});
