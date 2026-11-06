import { describe, expect, it } from 'vitest';
import {
  createBranchSchema,
  createClinicSchema,
  updateBranchSchema,
  branchLifecycleReasonSchema,
} from '../../src/modules/tenancy/validations/tenancy.validation.js';

describe('tenancy request validation', () => {
  it('accepts clinic custom settings', () => {
    const result = createClinicSchema.parse({
      name: 'Cutilora Clinic',
      settings: { intake: { requireConsent: true }, customFlag: 'enabled' },
    });
    expect(result.settings).toEqual({
      intake: { requireConsent: true },
      customFlag: 'enabled',
    });
  });

  it('allows a branch slug to be generated from its name', () => {
    const result = createBranchSchema.parse({ name: 'Riyadh Branch' });
    expect(result.slug).toBeUndefined();
  });

  it('allows creating a draft branch without operational details', () => {
    const result = createBranchSchema.parse({ name: 'New Clinic Location', status: 'draft' });
    expect(result.status).toBe('draft');
  });

  it('rejects invalid IANA timezones for branches', () => {
    expect(createBranchSchema.safeParse({
      name: 'Riyadh Branch',
      timezone: 'Not/A_Timezone',
    }).success).toBe(false);
  });

  it('accepts branch operating hours but keeps lifecycle changes out of the general update schema', () => {
    const result = updateBranchSchema.parse({
      status: 'suspended',
      operatingHours: [
        { dayOfWeek: 0, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      ],
    });
    expect(result.status).toBeUndefined();
    expect(result.operatingHours).toHaveLength(1);
  });

  it('requires a reason for branch lifecycle transitions', () => {
    expect(branchLifecycleReasonSchema.safeParse({ reason: 'Renovation' }).success).toBe(true);
    expect(branchLifecycleReasonSchema.safeParse({ reason: ' ' }).success).toBe(false);
    expect(branchLifecycleReasonSchema.safeParse({}).success).toBe(false);
  });

  it('rejects duplicate operating-hour days', () => {
    expect(updateBranchSchema.safeParse({
      operatingHours: [
        { dayOfWeek: 0, isClosed: true },
        { dayOfWeek: 0, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      ],
    }).success).toBe(false);
  });

  it('rejects an invalid clinic timezone', () => {
    expect(createClinicSchema.safeParse({
      name: 'Cutilora Clinic',
      timezone: 'Not/A_Timezone',
    }).success).toBe(false);
  });

  it('rejects an empty branch update', () => {
    expect(updateBranchSchema.safeParse({}).success).toBe(false);
  });
});
