import {describe,it,expect} from 'vitest';
import {createPatientSchema,updatePatientSchema,listPatientsSchema,contactsSchema} from '../../src/modules/patients/validation/patient.validation.js';
describe('patient request validation',()=>{
 it('requires a first and last name and normalizes optional demographics',()=>{
  const parsed=createPatientSchema.parse({firstName:'  Sara ',lastName:'Ali',gender:'female',contacts:[{type:'email',value:'SARA@example.com'}]});
  expect(parsed.firstName).toBe('Sara');expect(parsed.contacts?.[0].value).toBe('SARA@example.com');
 });
 it('rejects unsupported patient lifecycle values on create',()=>{expect(()=>createPatientSchema.parse({firstName:'A',lastName:'B',status:'deleted'})).toThrow();});
 it('allows partial profile updates but not contact replacement through profile patch',()=>{
  expect(updatePatientSchema.parse({firstName:'Updated'})).toEqual({firstName:'Updated'});
  expect(()=>updatePatientSchema.parse({contacts:[]})).toThrow();
 });
 it('limits pagination and contact payload size',()=>{
  expect(()=>listPatientsSchema.parse({perPage:500})).toThrow();
  expect(()=>contactsSchema.parse({contacts:Array.from({length:21},()=>({type:'mobile',value:'12345'}))})).toThrow();
 });
});
