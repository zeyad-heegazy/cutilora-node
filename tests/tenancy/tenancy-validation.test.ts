import { describe, expect, it } from 'vitest';
import {
  createBranchSchema,
  createClinicSchema,
  updateBranchSchema,
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

  it('rejects invalid IANA timezones for branches', () => {
    expect(createBranchSchema.safeParse({
      name: 'Riyadh Branch',
      timezone: 'Not/A_Timezone',
    }).success).toBe(false);
  });

  it('accepts branch operating hours and lifecycle status updates', () => {
    const result = updateBranchSchema.parse({
      status: 'suspended',
      operatingHours: [
        { dayOfWeek: 0, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      ],
    });
    expect(result.status).toBe('suspended');
    expect(result.operatingHours).toHaveLength(1);
  });

  it('rejects an empty branch update', () => {
    expect(updateBranchSchema.safeParse({}).success).toBe(false);
  });
});
