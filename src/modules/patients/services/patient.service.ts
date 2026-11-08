import { Types } from 'mongoose';
import { Patient } from '../models/patient.model.js';
import { PatientNumberCounter } from '../models/patient-number-counter.model.js';
import { PatientTag } from '../models/patient-tag.model.js';
import { TenantAuditEvent } from '../../tenancy/models/tenant-audit-event.model.js';
import { Branch } from '../../tenancy/models/branch.model.js';

type Scope = {
  tenantId: string; clinicId: string; branchId?: string | null;
  accessScope: 'tenant' | 'clinic' | 'branch'; userId: string; permissions: string[];
};
const normalized = (value: string) => value.trim().toLocaleLowerCase('en-US');
const audit = async (s: Scope, action: string, id: string, metadata: Record<string, unknown> = {}) =>
  TenantAuditEvent.create({ tenantId: s.tenantId, clinicId: s.clinicId, branchId: s.branchId ?? null, actorUserId: s.userId, action, targetType: 'patient', targetId: id, metadata });
const clinicFilter = (s: Scope) => ({ tenantId: new Types.ObjectId(s.tenantId), clinicId: new Types.ObjectId(s.clinicId) });
const filter = (s: Scope, id?: string) => {
  if (s.accessScope === 'branch' && !s.branchId) throw { status: 403, code: 'BRANCH_CONTEXT_REQUIRED', message: 'A branch context is required.' };
  return {
    tenantId: new Types.ObjectId(s.tenantId),
    clinicId: new Types.ObjectId(s.clinicId),
    ...(id ? { _id: new Types.ObjectId(id) } : {}),
    ...(s.branchId ? { branchIds: new Types.ObjectId(s.branchId) } : {}),
  };
};
const normalizeContacts = (items: any[] = []) => items.map(item => ({
  ...item,
  normalizedValue: normalized(item.value),
  ...(item.type === 'email' ? { value: normalized(item.value) } : {}),
}));
const pageResult = (items: any[], total: number, page: number, perPage: number) => ({
  items, pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
});
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nextPatientNumber = async (tenantId: string, clinicId: string) => {
  const key = { tenantId: new Types.ObjectId(tenantId), clinicId: new Types.ObjectId(clinicId) };
  try {
    const counter = await PatientNumberCounter.findOneAndUpdate(key, { $inc: { value: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    return `P-${String(counter.value).padStart(6, '0')}`;
  } catch (error: any) {
    // Concurrent first-time upserts can race on the unique tenant/clinic key.
    if (error?.code !== 11000) throw error;
    const counter = await PatientNumberCounter.findOneAndUpdate(key, { $inc: { value: 1 } }, { new: true });
    if (!counter) throw error;
    return `P-${String(counter.value).padStart(6, '0')}`;
  }
};
const allowedTransitions: Record<string, string[]> = {
  lead: ['active', 'inactive'],
  active: ['inactive', 'blocked', 'archived'],
  inactive: ['active', 'archived'],
  blocked: ['active', 'archived'],
  archived: [],
};
const clinicalRead = (s: Scope) => s.permissions.includes('*') || s.permissions.includes('patients.notes.clinical.read');
const clinicalManage = (s: Scope) => s.permissions.includes('*') || s.permissions.includes('patients.notes.clinical.manage');

export const patientService = {
  async list(s: Scope, query: any) {
    const f: any = filter(s);
    if (query.status) f.status = query.status;
    if (query.gender) f.gender = query.gender;
    const term = query.q ?? query.search;
    if (term) {
      const safe = escapeRegex(term);
      f.$or = [
        { firstName: { $regex: safe, $options: 'i' } },
        { lastName: { $regex: safe, $options: 'i' } },
        { displayName: { $regex: safe, $options: 'i' } },
        { patientNumber: { $regex: safe, $options: 'i' } },
        { 'contacts.normalizedValue': normalized(term) },
      ];
    }
    const direction = query.order === 'asc' ? 1 : -1;
    const sort: any = query.sort === 'name' ? { lastName: direction, firstName: direction }
      : query.sort === 'patientNumber' ? { patientNumber: direction } : { createdAt: direction };
    const [items, total] = await Promise.all([
      Patient.find(f).select('-notes -statusHistory -contacts.normalizedValue').populate('tags', 'name color').sort(sort).skip((query.page - 1) * query.perPage).limit(query.perPage).lean(),
      Patient.countDocuments(f),
    ]);
    await audit(s, 'patient.listed', 'collection', { resultCount: items.length, filters: { status: query.status ?? null, gender: query.gender ?? null } });
    return pageResult(items, total, query.page, query.perPage);
  },

  async create(s: Scope, input: any) {
    const contacts = normalizeContacts(input.contacts);
    if (s.accessScope === 'branch' && !s.branchId) throw { status: 403, code: 'BRANCH_CONTEXT_REQUIRED', message: 'A branch context is required.' };
    let requestedBranches: string[] = input.branchIds ?? [];
    if (s.branchId) {
      if (requestedBranches.some(id => id !== s.branchId)) throw { status: 403, code: 'BRANCH_ASSIGNMENT_FORBIDDEN', message: 'A patient created in a branch context can only be assigned to that branch.' };
      requestedBranches = [s.branchId];
    }
    if (requestedBranches.length) {
      const unique = [...new Set(requestedBranches)];
      const valid = await Branch.countDocuments({
        _id: { $in: unique.map(id => new Types.ObjectId(id)) },
        tenantId: s.tenantId, clinicId: s.clinicId, status: 'active',
      });
      if (valid !== unique.length) throw { status: 400, code: 'INVALID_BRANCH_ASSIGNMENT', message: 'Patient branches must be active branches in this clinic.' };
      requestedBranches = unique;
    }
    const duplicateConditions = contacts.map(contact => ({
      contacts: { $elemMatch: { type: contact.type, normalizedValue: contact.normalizedValue } },
    }));
    const duplicate: any = duplicateConditions.length
      ? await Patient.findOne({ ...clinicFilter(s), $or: duplicateConditions }).select('_id patientNumber firstName lastName').lean()
      : null;
    const patientNumber = await nextPatientNumber(s.tenantId, s.clinicId);
    try {
      const patient = await Patient.create({
        ...input, contacts, branchIds: requestedBranches.map(id => new Types.ObjectId(id)),
        tenantId: s.tenantId, clinicId: s.clinicId, patientNumber,
        createdBy: s.userId, displayName: input.displayName || [input.firstName, input.lastName].join(' '),
        statusHistory: [{ from: null, to: input.status ?? 'active', changedBy: s.userId }],
      });
      await audit(s, 'patient.created', String(patient._id), { status: patient.status, possibleDuplicateId: duplicate ? String(duplicate._id) : null });
      return { patient, possibleDuplicate: duplicate };
    } catch (error: any) {
      if (error?.code === 11000) throw { status: 409, code: 'PATIENT_NUMBER_CONFLICT', message: 'Patient number conflict; retry the request.' };
      throw error;
    }
  },

  async get(s: Scope, id: string) {
    const patient: any = await Patient.findOne(filter(s, id)).select('-notes -statusHistory -contacts.normalizedValue').populate('tags', 'name color').lean();
    if (patient) await audit(s, 'patient.viewed', id);
    return patient;
  },

  async update(s: Scope, id: string, input: any) {
    const patient: any = await Patient.findOneAndUpdate(filter(s, id), { $set: { ...input, updatedBy: s.userId } }, { new: true, runValidators: true })
      .select('-notes -statusHistory -contacts.normalizedValue').populate('tags', 'name color').lean();
    if (patient) await audit(s, 'patient.updated', id, { changedFields: Object.keys(input) });
    return patient;
  },

  async replaceContacts(s: Scope, id: string, items: any[]) {
    const contacts = normalizeContacts(items);
    const conditions = contacts.map(contact => ({ contacts: { $elemMatch: { type: contact.type, normalizedValue: contact.normalizedValue } } }));
    const duplicate: any = conditions.length
      ? await Patient.findOne({ ...clinicFilter(s), _id: { $ne: new Types.ObjectId(id) }, $or: conditions }).select('_id patientNumber').lean()
      : null;
    const patient: any = await Patient.findOneAndUpdate(filter(s, id), { $set: { contacts, updatedBy: s.userId } }, { new: true, runValidators: true })
      .select('-contacts.normalizedValue').lean();
    if (patient) await audit(s, 'patient.contacts.updated', id, { contactCount: contacts.length, possibleDuplicateId: duplicate ? String(duplicate._id) : null });
    return { patient, possibleDuplicate: duplicate };
  },

  async replaceAddresses(s: Scope, id: string, addresses: any[]) {
    const patient: any = await Patient.findOneAndUpdate(filter(s, id), { $set: { addresses, updatedBy: s.userId } }, { new: true, runValidators: true }).lean();
    if (patient) await audit(s, 'patient.addresses.updated', id, { addressCount: addresses.length });
    return patient;
  },

  async replaceEmergencyContacts(s: Scope, id: string, items: any[]) {
    const patient: any = await Patient.findOneAndUpdate(filter(s, id), { $set: { emergencyContacts: items, updatedBy: s.userId } }, { new: true, runValidators: true }).lean();
    if (patient) await audit(s, 'patient.emergency_contacts.updated', id, { count: items.length });
    return patient;
  },

  async setTags(s: Scope, id: string, tags: string[]) {
    const unique = [...new Set(tags)];
    if (unique.length) {
      const count = await PatientTag.countDocuments({
        _id: { $in: unique.map(tagId => new Types.ObjectId(tagId)) },
        tenantId: s.tenantId, clinicId: s.clinicId,
      });
      if (count !== unique.length) throw { status: 400, code: 'INVALID_PATIENT_TAG', message: 'Every tag must belong to the selected clinic.' };
    }
    const patient: any = await Patient.findOneAndUpdate(filter(s, id), { $set: { tags: unique.map(tagId => new Types.ObjectId(tagId)), updatedBy: s.userId } }, { new: true, runValidators: true })
      .populate('tags', 'name color').select('tags').lean();
    if (patient) await audit(s, 'patient.tags.updated', id, { count: unique.length });
    return patient;
  },

  async getNotes(s: Scope, id: string) {
    const patient: any = await Patient.findOne(filter(s, id)).select('notes').lean();
    if (!patient) return null;
    const notes = (patient.notes ?? []).filter((note: any) => note.visibility !== 'clinical' || clinicalRead(s));
    await audit(s, 'patient.notes.viewed', id, { count: notes.length });
    return notes;
  },

  async addNote(s: Scope, id: string, input: any) {
    if (input.visibility === 'clinical' && !clinicalManage(s)) {
      throw { status: 403, code: 'CLINICAL_NOTE_PERMISSION_REQUIRED', message: 'You are not allowed to create clinical notes.' };
    }
    const patient: any = await Patient.findOneAndUpdate(filter(s, id), {
      $push: { notes: { ...input, createdBy: s.userId } }, $set: { updatedBy: s.userId },
    }, { new: true }).select('notes').lean();
    if (patient) await audit(s, 'patient.note.created', id, { visibility: input.visibility });
    return patient?.notes?.at(-1) ?? null;
  },

  async statusHistory(s: Scope, id: string) {
    const patient: any = await Patient.findOne(filter(s, id)).select('status statusHistory').lean();
    if (patient) await audit(s, 'patient.status_history.viewed', id);
    return patient ? { status: patient.status, history: patient.statusHistory } : null;
  },

  async changeStatus(s: Scope, id: string, status: string, reason: string) {
    const current: any = await Patient.findOne(filter(s, id)).select('status').lean();
    if (!current) return null;
    if (current.status === status) return Patient.findOne(filter(s, id));
    if (!allowedTransitions[current.status]?.includes(status)) {
      throw { status: 409, code: 'INVALID_PATIENT_STATUS_TRANSITION', message: `Cannot change patient status from ${current.status} to ${status}.` };
    }
    const previous = current.status;
    const patient: any = await Patient.findOneAndUpdate(
      { ...filter(s, id), status: previous },
      {
        $set: { status, updatedBy: new Types.ObjectId(s.userId) },
        $push: { statusHistory: { from: previous, to: status, reason, changedBy: new Types.ObjectId(s.userId), changedAt: new Date() } },
      },
      { new: true, runValidators: true },
    );
    if (!patient) throw { status: 409, code: 'PATIENT_STATUS_CONFLICT', message: 'Patient status changed concurrently. Reload and retry.' };
    await audit(s, 'patient.status.changed', id, { from: previous, to: status });
    return patient;
  },
};
