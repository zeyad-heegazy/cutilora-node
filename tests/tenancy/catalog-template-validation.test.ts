import { describe, expect, it } from 'vitest';
import {
  createCatalogTemplateSchema,
  publishCatalogTemplateSchema,
  updateCatalogTemplateSchema,
} from '../../src/modules/tenancy/catalog/tenant-catalog-template.validation.js';

describe('tenant catalog template validation', () => {
  it('accepts service and treatment template payloads with bounded JSON content', () => {
    expect(createCatalogTemplateSchema.parse({
      type: 'service',
      name: 'Laser Hair Removal',
      content: { durationMinutes: 45, bufferMinutes: 10, price: { amount: 0, currency: 'EGP' } },
    })).toMatchObject({ type: 'service', name: 'Laser Hair Removal' });
  });

  it('supports shared service and treatment categories as distinct template types', () => {
    expect(createCatalogTemplateSchema.safeParse({ type: 'service_category', name: 'Laser', content: { label: 'Laser' } }).success).toBe(true);
    expect(createCatalogTemplateSchema.safeParse({ type: 'treatment_category', name: 'Skin', content: { label: 'Skin' } }).success).toBe(true);
  });

  it('rejects unknown template types and content larger than 64 KB', () => {
    expect(createCatalogTemplateSchema.safeParse({
      type: 'unknown', name: 'Bad type', content: {},
    }).success).toBe(false);
    expect(createCatalogTemplateSchema.safeParse({
      type: 'message', name: 'Large message', content: { body: 'x'.repeat(66_000) },
    }).success).toBe(false);
  });

  it('requires an optimistic version and at least one changed field for updates', () => {
    expect(updateCatalogTemplateSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(updateCatalogTemplateSchema.safeParse({ version: 1, content: { body: 'Updated' } }).success).toBe(true);
  });

  it('requires selected clinic IDs and explicit confirmation for publishing', () => {
    expect(publishCatalogTemplateSchema.safeParse({ applyTo: 'selected', confirm: true }).success).toBe(false);
    expect(publishCatalogTemplateSchema.safeParse({
      applyTo: 'selected', clinicIds: ['64b000000000000000000003'], confirm: true,
    }).success).toBe(true);
    expect(publishCatalogTemplateSchema.safeParse({ applyTo: 'all', confirm: false }).success).toBe(false);
    expect(publishCatalogTemplateSchema.safeParse({ applyTo: 'new_clinics', confirm: true }).success).toBe(true);
  });
});
