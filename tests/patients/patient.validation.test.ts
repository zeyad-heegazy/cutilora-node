import { describe, it, expect } from 'vitest';
import { createPatientSchema, updatePatientSchema, listPatientsSchema, contactsSchema, patientIdSchema, tagsSchema } from '../../src/modules/patients/validation/patient.validation.js';

describe('patient request validation', () => {
  it('requires a first and last name and preserves contact input for service normalization', () => {
    const parsed = createPatientSchema.parse({ firstName: '  Sara ', lastName: 'Ali', gender: 'female', contacts: [{ type: 'email', value: 'SARA@example.com' }] });
    expect(parsed.firstName).toBe('Sara');
    expect(parsed.contacts?.[0].value).toBe('SARA@example.com');
  });
  it('accepts valid ObjectIds and rejects malformed ObjectIds consistently', () => {
    const valid = '507f1f77bcf86cd799439011';
    expect(patientIdSchema.parse(valid)).toBe(valid);
    expect(() => patientIdSchema.parse('507f1f77bcf86cd79943901z')).toThrow();
    expect(() => patientIdSchema.parse('not-an-object-id')).toThrow();
    expect(() => tagsSchema.parse({ tags: ['not-an-object-id'] })).toThrow();
  });
  it('rejects unsupported patient lifecycle values on create', () => {
    expect(() => createPatientSchema.parse({ firstName: 'A', lastName: 'B', status: 'deleted' })).toThrow();
  });
  it('allows partial profile updates but not contact, branch, or lifecycle mutation through profile patch', () => {
    expect(updatePatientSchema.parse({ firstName: 'Updated' })).toEqual({ firstName: 'Updated' });
    expect(() => updatePatientSchema.parse({ contacts: [] })).toThrow();
    expect(() => updatePatientSchema.parse({ branchIds: [] })).toThrow();
    expect(() => updatePatientSchema.parse({ status: 'archived' })).toThrow();
    expect(() => updatePatientSchema.parse({})).toThrow();
  });
  it('limits pagination and contact payload size', () => {
    expect(() => listPatientsSchema.parse({ perPage: 500 })).toThrow();
    expect(() => contactsSchema.parse({ contacts: Array.from({ length: 21 }, () => ({ type: 'mobile', value: '12345' })) })).toThrow();
  });
  it('rejects future dates of birth', () => {
    expect(() => createPatientSchema.parse({ firstName: 'A', lastName: 'B', dateOfBirth: '2999-01-01' })).toThrow();
  });
});
