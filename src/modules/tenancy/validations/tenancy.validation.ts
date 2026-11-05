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

const operatingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isClosed: z.boolean().optional(),
  openTime: timeString.optional(),
  closeTime: timeString.optional(),
  breakTimes: z
    .array(
      z.object({
        startTime: timeString,
        endTime: timeString,
      }),
    )
    .max(5)
    .optional(),
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
  settings: z.record(z.unknown()).optional(),
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
    settings: z.record(z.unknown()).optional(),
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
  slug: slug.optional(),
  status: z.enum(['active', 'suspended']),
  address: z.string().trim().max(500).optional(),
  cityId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  timezone: timezoneSchema,
  operatingHours: operatingHoursArraySchema,
};

export const createBranchSchema = z.object({
  name: branchFields.name,
  slug: branchFields.slug,
  address: branchFields.address,
  cityId: branchFields.cityId,
  timezone: timezoneSchema.optional(),
  operatingHours: branchFields.operatingHours.optional(),
});

export const updateBranchSchema = z.object({
  name: branchFields.name.optional(),
  slug: branchFields.slug,
  status: branchFields.status.optional(),
  address: branchFields.address,
  cityId: branchFields.cityId,
  timezone: timezoneSchema.optional(),
  operatingHours: branchFields.operatingHours.optional(),
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
