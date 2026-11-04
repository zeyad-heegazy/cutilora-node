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
  logoUrl: z.string().trim().url().or(z.literal('')).optional(),
  coverImageUrl: z.string().trim().url().or(z.literal('')).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
const preferencesSchema = z.object({
  timezone: z.string().trim().min(1).max(100).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  dateFormat: z.string().trim().min(1).max(30).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  supportedLanguages: z.array(z.string().trim().min(2).max(10)).max(10).optional(),
});
const clinicFields = {
  name: z.string().trim().min(2).max(160),
  code: optionalText(30),
  clinicType: z.enum(['dermatology', 'aesthetic', 'beauty', 'medical_center', 'other']).optional(),
  description: optionalText(2000),
  specialties: z.array(z.string().trim().min(2).max(80)).max(50).optional(),
  contact: contactSchema.optional(),
  address: addressSchema.optional(),
  timezone: z.string().trim().min(1).max(100).default('Africa/Cairo'),
  countryId: z.string().optional(),
  governorateId: z.string().optional(),
  cityId: z.string().optional(),
  districtId: z.string().optional(),
  operatingHours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    isClosed: z.boolean().optional(),
    openTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).optional(),
    closeTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).optional(),
    breakTimes: z.array(z.object({
      startTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
      endTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
    })).max(5).optional(),
  })).max(7).optional(),
  branding: brandingSchema.optional(),
  bookingSettings: z.object({
    allowOnlineBooking: z.boolean().optional(),
    requireAppointmentConfirmation: z.boolean().optional(),
    defaultAppointmentDurationMinutes: z.number().int().min(5).max(480).optional(),
    bufferMinutes: z.number().int().min(0).max(240).optional(),
    cancellationWindowHours: z.number().int().min(0).max(720).optional(),
  }).optional(),
  openingDate: z.coerce.date().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
};

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  displayName: optionalText(160),
  legalName: optionalText(200),
  businessType: z.enum(['single_clinic', 'clinic_group', 'medical_center']).default('single_clinic'),
  description: optionalText(2000),
  industry: optionalText(100),
  contact: contactSchema.optional(),
  address: addressSchema.optional(),
  legal: z.object({
    taxNumber: optionalText(100),
    vatNumber: optionalText(100),
    commercialRegistrationNumber: optionalText(100),
  }).optional(),
  branding: brandingSchema.optional(),
  preferences: preferencesSchema.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  owner: z.object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().email(),
    password: z.string().min(12).max(128),
  }),
  initialClinic: z.object(clinicFields).omit({ timezone: true }).extend({
    timezone: z.string().trim().min(1).max(100).default('Africa/Cairo'),
  }).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  displayName: optionalText(160),
  legalName: optionalText(200),
  businessType: z.enum(['single_clinic', 'clinic_group', 'medical_center']).optional(),
  description: optionalText(2000),
  industry: optionalText(100),
  contact: contactSchema.partial().optional(),
  address: addressSchema.partial().optional(),
  legal: z.object({
    taxNumber: optionalText(100),
    vatNumber: optionalText(100),
    commercialRegistrationNumber: optionalText(100),
  }).partial().optional(),
  branding: brandingSchema.partial().optional(),
  preferences: preferencesSchema.partial().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

export const tenantStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });

export const createClinicSchema = z.object(clinicFields);
export const updateClinicSchema = z.object({
  name: clinicFields.name.optional(),
  status: z.enum(['active', 'suspended']).optional(),
  code: clinicFields.code,
  clinicType: clinicFields.clinicType,
  description: clinicFields.description,
  specialties: clinicFields.specialties,
  contact: contactSchema.partial().optional(),
  address: addressSchema.partial().optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  countryId: z.string().optional(),
  governorateId: z.string().optional(),
  cityId: z.string().optional(),
  districtId: z.string().optional(),
  operatingHours: clinicFields.operatingHours,
  branding: brandingSchema.partial().optional(),
  bookingSettings: z.object({
    allowOnlineBooking: z.boolean().optional(),
    requireAppointmentConfirmation: z.boolean().optional(),
    defaultAppointmentDurationMinutes: z.number().int().min(5).max(480).optional(),
    bufferMinutes: z.number().int().min(0).max(240).optional(),
    cancellationWindowHours: z.number().int().min(0).max(720).optional(),
  }).optional(),
  openingDate: z.coerce.date().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

export const createBranchSchema = z.object({
  name: z.string().trim().min(2),
  slug,
  address: z.string().optional(),
  cityId: z.string().optional(),
  timezone: z.string().default('Africa/Cairo'),
});

export const upsertSubscriptionSchema = z.object({
  plan: z.object({
    code: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(120),
    amount: z.number().min(0).default(0),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('EGP'),
  }),
  billingCycle: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
  status: z.enum(['pending', 'trialing', 'active', 'past_due', 'canceled', 'expired']).default('pending'),
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
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  status: z.enum(['pending', 'paid', 'failed', 'refunded']),
  method: optionalText(80),
  provider: optionalText(80),
  providerReference: optionalText(160),
  invoiceNumber: optionalText(100),
  invoiceUrl: z.string().trim().url().or(z.literal('')).optional(),
  paidAt: z.coerce.date().nullable().optional(),
  failureReason: optionalText(1000),
});
