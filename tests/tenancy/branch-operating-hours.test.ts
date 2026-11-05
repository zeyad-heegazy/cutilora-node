import { describe, expect, it } from 'vitest';
import { updateBranchOperatingHoursSchema } from '../../src/modules/tenancy/validations/tenancy.validation.js';

describe('branch business-hours validation', () => {
  it('accepts a complete weekly schedule with breaks', () => {
    const result = updateBranchOperatingHoursSchema.parse({
      operatingHours: [
        {
          dayOfWeek: 0,
          isClosed: false,
          openTime: '09:00',
          closeTime: '18:00',
          breakTimes: [{ startTime: '13:00', endTime: '14:00' }],
        },
        { dayOfWeek: 1, isClosed: true },
      ],
    });

    expect(result.operatingHours).toHaveLength(2);
  });

  it('rejects duplicate weekday entries', () => {
    expect(() =>
      updateBranchOperatingHoursSchema.parse({
        operatingHours: [
          { dayOfWeek: 0, isClosed: true },
          { dayOfWeek: 0, isClosed: false, openTime: '09:00', closeTime: '17:00' },
        ],
      }),
    ).toThrow('Operating hours must contain at most one entry per day.');
  });

  it('rejects overlapping or out-of-hours breaks', () => {
    expect(() =>
      updateBranchOperatingHoursSchema.parse({
        operatingHours: [{
          dayOfWeek: 2,
          openTime: '09:00',
          closeTime: '18:00',
          breakTimes: [
            { startTime: '12:00', endTime: '14:00' },
            { startTime: '13:30', endTime: '15:00' },
          ],
        }],
      }),
    ).toThrow('Breaks must be inside operating hours and must not overlap.');
  });

  it('rejects overnight schedules until cross-midnight scheduling is explicitly supported', () => {
    expect(() =>
      updateBranchOperatingHoursSchema.parse({
        operatingHours: [{
          dayOfWeek: 3,
          openTime: '20:00',
          closeTime: '02:00',
        }],
      }),
    ).toThrow('Open days require openTime before closeTime; overnight hours are not supported.');
  });
});
