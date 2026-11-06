import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const optionalText = (max = 255) => z.string().trim().max(max).optional();
const phone = z.string().trim().max(40).optional();
const contactSchema = z.object({
  email: z.string().trim().email().optional(),
  phone,
  alternatePhone: phone,
  whatsapp: phone,
  website: z.string().trim().url().optional(),
});
const addressSchema = z.object({
  countryId: z.string().optional(),
  governorateId: z.string().optional(),
  cityId: z.string().optional(),
  districtId: z.string().optional(),
  addressLine1: optionalText(255),
  addressLine2: optionalText(255),
  building: optionalText(100),
  floor: optionalText(50),
  unit: optionalText(50),
  landmark: optionalText(255),
  postalCode: optionalText(30),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});
const brandingSchema = z.object({
  logoBase64: z.string().max(2_800_000).optional(),
  coverImageBase64: z.string().max(2_800_000).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
const timezoneSchema = z.string().trim().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; }
  catch { return false; }
}, 'Timezone must be a valid IANA timezone.');

const preferencesSchema = z.object({
  timezone: timezoneSchema.optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  dateFormat: z.string().trim().min(1).max(30).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  supportedLanguages: z
    .array(z.string().trim().min(2).max(10))
    .max(10)
    .optional(),
});

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format');

const breakTimesSchema = z.array(z.object({
  startTime: timeString,
  endTime: timeString,
})).max(5);

const operatingShiftSchema = z.object({
  startTime: timeString,
  endTime: timeString,
  breakTimes: breakTimesSchema.optional(),
});

const operatingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isClosed: z.boolean().optional(),
  // Legacy single-window fields remain supported for existing records and clients.
  openTime: timeString.optional(),
  closeTime: timeString.optional(),
  breakTimes: breakTimesSchema.optional(),
  // New split-shift schedule; intervals are local to the branch timezone.
  shifts: z.array(operatingShiftSchema).min(1).max(3).optional(),
}).refine((hour) => {
  if (hour.isClosed) return !(hour.shifts?.length || hour.openTime || hour.closeTime || hour.breakTimes?.length);
  if (hour.shifts?.length) return !hour.openTime && !hour.closeTime && !hour.breakTimes?.length;
  return Boolean(hour.openTime && hour.closeTime && hour.openTime < hour.closeTime);
}, {
  message: 'Open days require either one valid open/close window or one to three split shifts; overnight hours are not supported.',
  path: ['shifts'],
}).refine((hour) => {
  if (hour.isClosed) return true;
  const validateBreaks = (breaks: Array<{ startTime: string; endTime: string }>, start: string, end: string) => {
    const sorted = [...breaks].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return sorted.every((item, index) =>
      item.startTime < item.endTime &&
      item.startTime >= start &&
      item.endTime <= end &&
      (index === 0 || sorted[index - 1]!.endTime <= item.startTime)
    );
  };
  if (hour.shifts?.length) {
    const shifts = [...hour.shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return shifts.every((shift, index) =>
      shift.startTime < shift.endTime &&
      (index === 0 || shifts[index - 1]!.endTime <= shift.startTime) &&
      validateBreaks(shift.breakTimes ?? [], shift.startTime, shift.endTime)
    );
  }
  if (!hour.openTime || !hour.closeTime) return true;
  return validateBreaks(hour.breakTimes ?? [], hour.openTime, hour.closeTime);
}, {
  message: 'Shifts and breaks must be ordered, non-overlapping, and breaks must be inside their shift.',
  path: ['shifts'],
});

const operatingHoursArraySchema = z.array(operatingHourSchema).max(7).refine(
  (hours) => new Set(hours.map((hour) => hour.dayOfWeek)).size === hours.length,
  'Operating hours must contain at most one entry per day.',
);

const clinicFields = {
  name: z.string().trim().min(2).max(160),
  code: optionalText(30),
  clinicType: z
    .enum(['dermatology', 'aesthetic', 'beauty', 'medical_center', 'other'])
    .optional(),
  description: optionalText(2000),
  specialties: z.array(z.string().trim().min(2).max(80)).max(50).optional(),
  contact: contactSchema.optional(),
  address: addressSchema.optional(),
  timezone: timezoneSchema.default('Africa/Cairo'),
  preferences: preferencesSchema.optional(),
  settings: z.record(z.unknown()).refine((settings) => !['organizationDefaults', 'organizationDefaultsVersion', 'organizationOverrides', 'platformDefaults', 'effectiveValues', 'sources'].some((key) => key in settings), 'Reserved organization configuration keys cannot be changed through clinic settings.').optional(),
  operatingHours: operatingHoursArraySchema.optional(),
  branding: brandingSchema.optional(),
  bookingSettings: z
    .object({
      allowOnlineBooking: z.boolean().optional(),
      requireAppointmentConfirmation: z.boolean().optional(),
      defaultAppointmentDurationMinutes: z
        .number()
        .int()
        .min(5)
        .max(480)
        .optional(),
      bufferMinutes: z.number().int().min(0).max(240).optional(),
      cancellationWindowHours: z.number().int().min(0).max(720).optional(),
    })
    .optional(),
  openingDate: z.coerce.date().nullable().optional(),
};

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  displayName: optionalText(160),
  legalName: optionalText(200),
  businessType: z
    .enum(['single_clinic', 'clinic_group', 'medical_center'])
    .default('single_clinic'),
  description: optionalText(2000),
  industry: optionalText(100),
  contact: contactSchema.optional(),
  address: addressSchema.optional(),
  legal: z
    .object({
      taxNumber: optionalText(100),
      vatNumber: optionalText(100),
      commercialRegistrationNumber: optionalText(100),
    })
    .optional(),
  branding: brandingSchema.optional(),
  preferences: preferencesSchema.optional(),
  owner: z.object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().email(),
    password: z.string().min(12).max(128),
  }),
  initialClinic: z.object(clinicFields).optional(),
});

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    displayName: optionalText(160),
    legalName: optionalText(200),
    businessType: z
      .enum(['single_clinic', 'clinic_group', 'medical_center'])
      .optional(),
    description: optionalText(2000),
    industry: optionalText(100),
    contact: contactSchema.partial().optional(),
    address: addressSchema.partial().optional(),
    legal: z
      .object({
        taxNumber: optionalText(100),
        vatNumber: optionalText(100),
        commercialRegistrationNumber: optionalText(100),
      })
      .partial()
      .optional(),
    branding: brandingSchema.partial().optional(),
    preferences: preferencesSchema.partial().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

export const tenantStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export const createClinicSchema = z.object(clinicFields);

export const updateClinicSchema = z
  .object({
    name: clinicFields.name.optional(),
    status: z.enum(['active', 'suspended']).optional(),
    code: clinicFields.code,
    clinicType: clinicFields.clinicType,
    description: clinicFields.description,
    specialties: clinicFields.specialties,
    contact: contactSchema.partial().optional(),
    address: addressSchema.partial().optional(),
    timezone: timezoneSchema.optional(),
    preferences: preferencesSchema.partial().optional(),
    settings: z.record(z.unknown()).refine((settings) => !['organizationDefaults', 'organizationDefaultsVersion', 'organizationOverrides', 'platformDefaults', 'effectiveValues', 'sources'].some((key) => key in settings), 'Reserved organization configuration keys cannot be changed through clinic settings.').optional(),
    countryId: z.string().optional(),
    governorateId: z.string().optional(),
    cityId: z.string().optional(),
    districtId: z.string().optional(),
    operatingHours: clinicFields.operatingHours,
    branding: brandingSchema.partial().optional(),
    bookingSettings: z
      .object({
        allowOnlineBooking: z.boolean().optional(),
        requireAppointmentConfirmation: z.boolean().optional(),
        defaultAppointmentDurationMinutes: z
          .number()
          .int()
          .min(5)
          .max(480)
          .optional(),
        bufferMinutes: z.number().int().min(0).max(240).optional(),
        cancellationWindowHours: z.number().int().min(0).max(720).optional(),
      })
      .optional(),
    openingDate: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const branchFields = {
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().max(30).transform((value) => value.toUpperCase()).optional(),
  slug: slug.optional(),
  address: z.string().trim().max(500).optional(),
  addressDetails: addressSchema.partial().optional(),
  contact: contactSchema.partial().optional(),
  contactPerson: z.object({
    name: optionalText(160),
    email: z.string().trim().email().optional(),
    phone,
  }).partial().optional(),
  cityId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  postalCode: optionalText(30),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  timezone: timezoneSchema,
  operatingHours: operatingHoursArraySchema,
  settings: z.record(z.unknown()).refine((settings) => !('organizationOverrides' in settings), 'Use the branch settings endpoint to update organization overrides.').optional(),
  openingDate: z.coerce.date().nullable().optional(),
};

export const createBranchSchema = z.object({
  name: branchFields.name,
  code: branchFields.code,
  slug: branchFields.slug,
  address: branchFields.address,
  addressDetails: branchFields.addressDetails,
  contact: branchFields.contact,
  contactPerson: branchFields.contactPerson,
  cityId: branchFields.cityId,
  postalCode: branchFields.postalCode,
  latitude: branchFields.latitude,
  longitude: branchFields.longitude,
  timezone: timezoneSchema.optional(),
  operatingHours: branchFields.operatingHours.optional(),
  settings: branchFields.settings,
  openingDate: branchFields.openingDate,
  status: z.enum(['draft', 'active']).optional(),
});

const branchWeeklyOperatingHoursSchema = operatingHoursArraySchema.refine(
  (hours) => hours.length === 7,
  'A complete weekly schedule must include exactly one entry for every weekday.',
);

export const updateBranchOperatingHoursSchema = z.object({
  operatingHours: branchWeeklyOperatingHoursSchema,
});

export const branchLifecycleReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const updateBranchSchema = z.object({
  name: branchFields.name.optional(),
  code: branchFields.code,
  slug: branchFields.slug,
  address: branchFields.address,
  addressDetails: branchFields.addressDetails,
  contact: branchFields.contact,
  contactPerson: branchFields.contactPerson,
  cityId: branchFields.cityId,
  postalCode: branchFields.postalCode,
  latitude: branchFields.latitude,
  longitude: branchFields.longitude,
  timezone: timezoneSchema.optional(),
  operatingHours: branchFields.operatingHours.optional(),
  settings: branchFields.settings,
  openingDate: branchFields.openingDate,
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided.',
});

export const upsertSubscriptionSchema = z.object({
  plan: z.object({
    code: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(120),
    amount: z.number().min(0).default(0),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .default('EGP'),
    limits: z.object({
      maxClinics: z.number().int().min(0).nullable().optional(),
      maxBranches: z.number().int().min(0).nullable().optional(),
      maxUsers: z.number().int().min(0).nullable().optional(),
      maxStorageBytes: z.number().int().min(0).nullable().optional(),
    }).optional(),
    features: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  }),
  billingCycle: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
  status: z
    .enum(['pending', 'trialing', 'active', 'past_due', 'canceled', 'expired'])
    .default('pending'),
  trialStartsAt: z.coerce.date().nullable().optional(),
  trialEndsAt: z.coerce.date().nullable().optional(),
  currentPeriodStartsAt: z.coerce.date().nullable().optional(),
  currentPeriodEndsAt: z.coerce.date().nullable().optional(),
  nextBillingAt: z.coerce.date().nullable().optional(),
  cancelAtPeriodEnd: z.boolean().default(false),
  canceledAt: z.coerce.date().nullable().optional(),
  notes: optionalText(2000),
});

export const createPaymentSchema = z.object({
  amount: z.number().min(0),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  status: z.enum(['pending', 'paid', 'failed', 'refunded']),
  method: optionalText(80),
  provider: optionalText(80),
  providerReference: optionalText(160),
  invoiceNumber: optionalText(100),
  invoiceUrl: z.string().trim().url().or(z.literal('')).optional(),
  paidAt: z.coerce.date().nullable().optional(),
  failureReason: optionalText(1000),
});

export const updateTenantPreferencesSchema = z.object({ preferences: preferencesSchema.partial() });

export const createTenantDocumentSchema = z.object({
  name: z.string().trim().min(1).max(180),
  category: z.enum(['registration', 'tax', 'license', 'insurance', 'contract', 'other']),
  fileBase64: z.string().min(1).max(4_200_000),
  expiresAt: z.coerce.date().nullable().optional(),
});

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.').refine((value) => { const date = new Date(value + 'T00:00:00.000Z'); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }, 'Date must be a real calendar date.');
export const createBranchHolidaySchema = z.object({
  title: z.string().trim().min(1).max(160),
  type: z.enum(['closure', 'modified_hours']),
  startDate: dateOnly,
  endDate: dateOnly,
  isAllDay: z.boolean().default(true),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  reason: optionalText(500),
}).refine((data) => data.startDate <= data.endDate, {
  message: 'endDate must be on or after startDate.',
  path: ['endDate'],
}).refine((data) => data.isAllDay || Boolean(data.startTime && data.endTime && data.startTime < data.endTime), {
  message: 'Partial-day closures require a valid startTime before endTime.',
  path: ['startTime'],
}).refine((data) => data.type !== 'modified_hours' || !data.isAllDay, {
  message: 'Modified hours must set isAllDay=false.',
  path: ['isAllDay'],
});

export const tenantAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  actorId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  action: z.string().trim().min(2).max(120).optional(),
  targetType: z.string().trim().min(2).max(80).optional(),
  module: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,79}$/i).optional(),
  result: z.enum(['success', 'failure']).optional(),
  requestId: z.string().trim().min(1).max(120).optional(),
  clinicId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  branchId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: 'from must be before or equal to to.',
  path: ['to'],
});

const configurationValuesSchema = z.record(z.unknown()).refine((values) =>
  !['organizationDefaults', 'organizationDefaultsVersion', 'organizationOverrides', 'platformDefaults', 'effectiveValues', 'sources'].some((key) => key in values),
  'Reserved configuration keys cannot be supplied.',
);
export const updateTenantConfigurationSchema = z.object({
  values: configurationValuesSchema.refine((values) => Object.keys(values).length > 0, 'At least one configuration value is required.'),
});
const configurationApplyFields = {
  applyTo: z.enum(['all', 'selected']),
  clinicIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, 'clinicIds must be unique.').optional(),
};
const tenantConfigurationApplyBaseSchema = z.object(configurationApplyFields);
export const previewTenantConfigurationApplySchema = tenantConfigurationApplyBaseSchema.refine((value) => value.applyTo !== 'selected' || Boolean(value.clinicIds?.length), {
  message: 'clinicIds are required when applyTo=selected.',
  path: ['clinicIds'],
});
export const applyTenantConfigurationSchema = tenantConfigurationApplyBaseSchema.extend({
  confirm: z.boolean(),
}).refine((value) => value.applyTo !== 'selected' || Boolean(value.clinicIds?.length), {
  message: 'clinicIds are required when applyTo=selected.',
  path: ['clinicIds'],
});

export const updateTenantMembershipSchema = z.object({
  role: z.enum(['tenant_owner', 'tenant_admin', 'billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist', 'custom']).optional(),
  customRoleId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  scope: z.enum(['tenant', 'clinic', 'branch']).optional(),
  clinicId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  branchIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(50).optional(),
  status: z.enum(['active', 'suspended']).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one membership field must be supplied.',
}).refine((value) => value.role !== 'custom' || Boolean(value.customRoleId), {
  message: 'customRoleId is required when assigning a custom role.', path: ['customRoleId'],
}).refine((value) => value.customRoleId === undefined || value.role === 'custom', {
  message: 'customRoleId can only be supplied when role=custom.', path: ['customRoleId'],
});

export const updateBranchSettingsSchema = z.object({
  overrides: z.record(z.unknown()).refine((overrides) => Object.keys(overrides).length > 0, 'At least one override is required.'),
});

export const updateClinicSettingsSchema = z.object({
  overrides: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, 'At least one override is required.'),
});

export const clinicListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export const branchListQuerySchema = z.object({
  clinicId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['draft', 'active', 'temporarily_closed', 'suspended', 'closed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export const replaceTenantDocumentSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  fileBase64: z.string().min(1).max(4_200_000),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const createTenantInvitationSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format.').optional(),
  channels: z.array(z.enum(['email', 'sms'])).min(1).max(2).default(['email']).refine((channels) => new Set(channels).size === channels.length, 'Channels must not contain duplicates.'),
  role: z.enum(['tenant_admin', 'billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist']),
  scope: z.enum(['tenant', 'clinic', 'branch']),
  clinicId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  branchIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(100).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
}).refine((input) => !input.channels.includes('sms') || Boolean(input.phone), {
  message: 'A phone number in E.164 format is required when SMS is selected.', path: ['phone'],
});

export const tenantUserListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'invited', 'suspended']).optional(),
  role: z.enum(['tenant_owner', 'tenant_admin', 'billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist', 'custom']).optional(),
  scope: z.enum(['tenant', 'clinic', 'branch']).optional(),
  clinicId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  branchId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  lastLoginFrom: z.coerce.date().optional(),
  lastLoginTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
}).refine((query) => !query.lastLoginFrom || !query.lastLoginTo || query.lastLoginFrom <= query.lastLoginTo, {
  message: 'lastLoginFrom must be before or equal to lastLoginTo.', path: ['lastLoginTo'],
});

export const tenantInvitationListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['pending', 'processing', 'expired', 'accepted', 'revoked']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});


export const createTenantRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  scope: z.enum(['tenant', 'clinic', 'branch']),
  permissions: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
});
export const updateTenantRoleSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  version: z.number().int().min(1),
}).refine((value) => value.name !== undefined || value.description !== undefined || value.permissions !== undefined, {
  message: 'At least one role field must be supplied.',
});
export const tenantRoleListQuerySchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  scope: z.enum(['tenant', 'clinic', 'branch']).optional(),
});


export const cloneTenantRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
});
