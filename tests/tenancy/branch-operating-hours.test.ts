import { describe, expect, it } from 'vitest';
import { updateBranchOperatingHoursSchema } from '../../src/modules/tenancy/validations/tenancy.validation.js';

const weeklySchedule = [
  { dayOfWeek: 0, isClosed: false, openTime: '09:00', closeTime: '18:00', breakTimes: [{ startTime: '13:00', endTime: '14:00' }] },
  { dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '18:00' },
  { dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '18:00' },
  { dayOfWeek: 3, isClosed: false, openTime: '09:00', closeTime: '18:00' },
  { dayOfWeek: 4, isClosed: false, openTime: '09:00', closeTime: '18:00' },
  { dayOfWeek: 5, isClosed: true },
  { dayOfWeek: 6, isClosed: true },
];

describe('branch business-hours validation', () => {
  it('accepts a complete seven-day schedule with breaks and closed days', () => {
    const result = updateBranchOperatingHoursSchema.parse({ operatingHours: weeklySchedule });
    expect(result.operatingHours).toHaveLength(7);
  });

  it('rejects schedules that omit a weekday', () => {
    expect(() =>
      updateBranchOperatingHoursSchema.parse({
        operatingHours: weeklySchedule.slice(0, 6),
      }),
    ).toThrow('A complete weekly schedule must include exactly one entry for every weekday.');
  });

  it('rejects duplicate weekday entries', () => {
    const duplicate = [...weeklySchedule];
    duplicate[6] = { dayOfWeek: 0, isClosed: true } as (typeof weeklySchedule)[number];

    expect(() =>
      updateBranchOperatingHoursSchema.parse({ operatingHours: duplicate }),
    ).toThrow('Operating hours must contain at most one entry per day.');
  });

  it('rejects overlapping or out-of-hours breaks', () => {
    const invalid = weeklySchedule.map((day) => day.dayOfWeek === 2
      ? { ...day, breakTimes: [
          { startTime: '12:00', endTime: '14:00' },
          { startTime: '13:30', endTime: '15:00' },
        ] }
      : day);

    expect(() =>
      updateBranchOperatingHoursSchema.parse({ operatingHours: invalid }),
    ).toThrow('Shifts and breaks must be ordered, non-overlapping, and breaks must be inside their shift.');
  });

  it('accepts multiple split shifts with breaks contained in each shift', () => {
    const split = weeklySchedule.map((day) => day.dayOfWeek === 0
      ? {
          dayOfWeek: 0,
          shifts: [
            { startTime: '08:00', endTime: '12:00', breakTimes: [{ startTime: '10:00', endTime: '10:15' }] },
            { startTime: '14:00', endTime: '18:00' },
          ],
        }
      : day);

    expect(updateBranchOperatingHoursSchema.parse({ operatingHours: split }).operatingHours[0]).toMatchObject({
      shifts: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '14:00', endTime: '18:00' }],
    });
  });

  it('rejects overlapping split shifts', () => {
    const split = weeklySchedule.map((day) => day.dayOfWeek === 1
      ? {
          dayOfWeek: 1,
          shifts: [
            { startTime: '08:00', endTime: '13:00' },
            { startTime: '12:30', endTime: '17:00' },
          ],
        }
      : day);

    expect(() =>
      updateBranchOperatingHoursSchema.parse({ operatingHours: split }),
    ).toThrow('Shifts and breaks must be ordered, non-overlapping, and breaks must be inside their shift.');
  });

  it('rejects breaks outside their split shift', () => {
    const split = weeklySchedule.map((day) => day.dayOfWeek === 2
      ? {
          dayOfWeek: 2,
          shifts: [{
            startTime: '08:00',
            endTime: '12:00',
            breakTimes: [{ startTime: '12:00', endTime: '12:30' }],
          }],
        }
      : day);

    expect(() =>
      updateBranchOperatingHoursSchema.parse({ operatingHours: split }),
    ).toThrow('Shifts and breaks must be ordered, non-overlapping, and breaks must be inside their shift.');
  });

  it('rejects overnight schedules until cross-midnight scheduling is explicitly supported', () => {
    const invalid = weeklySchedule.map((day) => day.dayOfWeek === 3
      ? { ...day, openTime: '20:00', closeTime: '02:00' }
      : day);

    expect(() =>
      updateBranchOperatingHoursSchema.parse({ operatingHours: invalid }),
    ).toThrow('Open days require either one valid open/close window or one to three split shifts; overnight hours are not supported.');
  });
});
