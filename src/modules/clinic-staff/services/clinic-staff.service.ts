import { Types } from 'mongoose';
import { Employee } from '../models/employee.model.js';
import { Provider } from '../models/provider.model.js';
import { Specialty } from '../models/specialty.model.js';
import { User } from '../../auth/models/user.model.js';
import { Branch } from '../../tenancy/models/branch.model.js';
import { TenantAuditEvent } from '../../tenancy/models/tenant-audit-event.model.js';

type Scope = { tenantId: string; clinicId: string; branchId?: string | null; accessScope: 'tenant' | 'clinic' | 'branch'; userId: string };
const objectIds = (values: string[]) => [...new Set(values)].map((value) => new Types.ObjectId(value));
const audit = async (scope: Scope, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) => {
  try {
    await TenantAuditEvent.create({ tenantId: scope.tenantId, clinicId: scope.clinicId, branchId: scope.branchId ?? null, actorUserId: scope.userId, action, targetType, targetId, metadata });
  } catch { /* Audit persistence failure is handled by the platform audit pipeline. */ }
};
const validateBranches = async (scope: Scope, ids: string[]) => {
  const unique = [...new Set(ids)];
  if (scope.accessScope === 'branch' && scope.branchId && unique.some((id) => id !== scope.branchId)) throw { status: 403, code: 'BRANCH_SCOPE_VIOLATION', message: 'A branch-scoped user can only assign the active branch.' };
  if (!unique.length) return [];
  const found = await Branch.find({ _id: { $in: objectIds(unique) }, tenantId: scope.tenantId, clinicId: scope.clinicId, status: 'active' }).select('_id').lean();
  if (found.length !== unique.length) throw { status: 400, code: 'INVALID_BRANCH_ASSIGNMENT', message: 'Every assigned branch must be active and belong to the selected clinic.' };
  return unique;
};
const validateProviderBranches = async (scope: Scope, employeeId: unknown, branchIds: string[]) => {
  const branches = await validateBranches(scope, branchIds);
  const employee = await Employee.findOne({ _id: employeeId, tenantId: scope.tenantId, clinicId: scope.clinicId }).select('branchIds').lean() as any;
  if (!employee) throw { status: 400, code: 'EMPLOYEE_NOT_FOUND', message: 'Provider employee does not belong to this clinic.' };
  const employeeBranches = (employee.branchIds ?? []).map((id: unknown) => String(id));
  if (employeeBranches.length && branches.some((branchId) => !employeeBranches.includes(branchId))) {
    throw { status: 400, code: 'EMPLOYEE_BRANCH_MISMATCH', message: 'Provider branches must be included in the employee branch assignments.' };
  }
  return branches;
};
const validateSpecialties = async (scope: Scope, ids: string[]) => {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const found = await Specialty.countDocuments({ _id: { $in: objectIds(unique) }, tenantId: scope.tenantId, clinicId: scope.clinicId, status: 'active' });
  if (found !== unique.length) throw { status: 400, code: 'INVALID_SPECIALTY_ASSIGNMENT', message: 'Every specialty must be active and belong to the selected clinic.' };
  return unique;
};
const validateSchedule = (hours: any[] = []) => {
  const days = new Set<number>();
  for (const day of hours) {
    if (days.has(day.dayOfWeek)) throw { status: 400, code: 'DUPLICATE_WORKING_DAY', message: 'Working hours can contain only one entry per weekday.' };
    days.add(day.dayOfWeek);
    if (!day.isAvailable) continue;
    if (!day.startTime || !day.endTime || day.startTime >= day.endTime) throw { status: 400, code: 'INVALID_WORKING_HOURS', message: 'Available days require a valid same-day start and end time.' };
    const intervals = (day.breaks ?? []).map((b: any) => [b.startTime, b.endTime] as [string, string]).sort((a,b) => a[0].localeCompare(b[0]));
    let previousEnd = day.startTime;
    for (const [start, end] of intervals) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end || start < previousEnd || end > day.endTime) {
        throw { status: 400, code: 'INVALID_WORKING_BREAK', message: 'Breaks must be valid, ordered and contained within working hours.' };
      }
      previousEnd = end;
    }
  }
};
const page = async (query: any, filter: Record<string, unknown>) => {
  const { page = 1, perPage = 25 } = query;
  const [items, total] = await Promise.all([
    filter ? null : null,
    Promise.resolve(0),
  ]);
  return { items, pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) } };
};

export const clinicStaffService = {
  async listEmployees(scope: Scope, query: any) {
    const filter: any = { tenantId: scope.tenantId, clinicId: scope.clinicId };
    if (scope.branchId || query.branchId) filter.branchIds = scope.branchId ?? query.branchId;
    if (query.status) filter.status = query.status;
    if (query.search) { const term = [...query.search].map((char) => '.^$*+?()[]{}|\\'.includes(char) ? '\\' + char : char).join(''); filter.$or = [{ firstName: new RegExp(term, 'i') }, { lastName: new RegExp(term, 'i') }, { employeeCode: new RegExp(term, 'i') }, { email: new RegExp(term, 'i') }]; }
    const [items, total] = await Promise.all([Employee.find(filter).sort({ lastName: 1, firstName: 1 }).skip((query.page - 1) * query.perPage).limit(query.perPage).lean(), Employee.countDocuments(filter)]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) } };
  },
  async createEmployee(scope: Scope, input: any) {
    const branches = await validateBranches(scope, input.branchIds?.length ? input.branchIds : (scope.accessScope === 'branch' && scope.branchId ? [scope.branchId] : []));
    if (input.userId && !await User.exists({ _id: input.userId, isActive: true })) throw { status: 400, code: 'LINKED_USER_NOT_FOUND', message: 'The linked login account must exist and be active.' };
    const item = await Employee.create({ ...input, branchIds: objectIds(branches), tenantId: scope.tenantId, clinicId: scope.clinicId, createdBy: scope.userId });
    await audit(scope, 'employee.created', 'employee', String(item._id), { status: item.status });
    return item;
  },
  async getEmployee(scope: Scope, id: string) {
    const filter: any = { _id: id, tenantId: scope.tenantId, clinicId: scope.clinicId };
    if (scope.branchId) filter.branchIds = scope.branchId;
    return Employee.findOne(filter).lean();
  },
  async updateEmployee(scope: Scope, id: string, input: any) {
    const current = await this.getEmployee(scope, id);
    if (!current) return null;
    if (input.branchIds) input.branchIds = objectIds(await validateBranches(scope, input.branchIds.length ? input.branchIds : (scope.accessScope === 'branch' && scope.branchId ? [scope.branchId] : [])));
    const item = await Employee.findOneAndUpdate({ _id: id, tenantId: scope.tenantId, clinicId: scope.clinicId, ...(scope.branchId ? { branchIds: scope.branchId } : {}) }, { $set: { ...input, updatedBy: scope.userId } }, { new: true, runValidators: true }).lean();
    if (item) await audit(scope, 'employee.updated', 'employee', id, { changedFields: Object.keys(input) });
    return item;
  },
  async listProviders(scope: Scope, query: any) {
    const filter: any = { tenantId: scope.tenantId, clinicId: scope.clinicId };
    if (scope.branchId || query.branchId) filter.branchIds = scope.branchId ?? query.branchId;
    if (query.status) filter.status = query.status;
    if (query.specialtyId) filter.specialtyIds = query.specialtyId;
    if (query.search) { const term = [...query.search].map((char) => '.^$*+?()[]{}|\\\\'.includes(char) ? '\\\\' + char : char).join(''); const employeeIds = await Employee.find({ tenantId: scope.tenantId, clinicId: scope.clinicId, $or: [{ firstName: new RegExp(term, 'i') }, { lastName: new RegExp(term, 'i') }, { employeeCode: new RegExp(term, 'i') }] }).distinct('_id'); filter.employeeId = { $in: employeeIds }; }
    if (query.expiringWithinDays) filter.licenseExpiresAt = { $gte: new Date(), $lte: new Date(Date.now() + query.expiringWithinDays * 86400000) };
    const [items, total] = await Promise.all([Provider.find(filter).populate({ path: 'employeeId', select: 'firstName lastName displayName employeeCode jobTitle status' }).sort({ createdAt: -1 }).skip((query.page - 1) * query.perPage).limit(query.perPage).lean(), Provider.countDocuments(filter)]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) } };
  },
  async createProvider(scope: Scope, input: any) {
    const employee = await Employee.findOne({ _id: input.employeeId, tenantId: scope.tenantId, clinicId: scope.clinicId, status: 'active' });
    if (!employee) throw { status: 400, code: 'EMPLOYEE_NOT_ELIGIBLE', message: 'Provider must reference an active employee in this clinic.' };
    if (await Provider.exists({ tenantId: scope.tenantId, clinicId: scope.clinicId, employeeId: input.employeeId })) throw { status: 409, code: 'PROVIDER_ALREADY_EXISTS', message: 'This employee already has a provider profile.' };
    const branches = await validateProviderBranches(scope, employee._id, input.branchIds);
    if (input.status === 'active' && input.licenseExpiresAt && new Date(input.licenseExpiresAt).getTime() < Date.now()) throw { status: 409, code: 'PROVIDER_LICENSE_EXPIRED', message: 'An expired license cannot be activated.' };
    const specialties = await validateSpecialties(scope, input.specialtyIds ?? []);
    validateSchedule(input.workingHours ?? []);
    const item = await Provider.create({ ...input, branchIds: objectIds(branches), specialtyIds: objectIds(specialties), serviceIds: objectIds(input.serviceIds ?? []), tenantId: scope.tenantId, clinicId: scope.clinicId, createdBy: scope.userId });
    await audit(scope, 'provider.created', 'provider', String(item._id), { status: item.status, branchCount: branches.length });
    return item;
  },
  async getProvider(scope: Scope, id: string) {
    const filter: any = { _id: id, tenantId: scope.tenantId, clinicId: scope.clinicId };
    if (scope.branchId) filter.branchIds = scope.branchId;
    return Provider.findOne(filter).populate({ path: 'employeeId', select: 'firstName lastName displayName employeeCode jobTitle status' }).lean();
  },
  async updateProvider(scope: Scope, id: string, input: any) {
    const current = await this.getProvider(scope, id);
    if (!current) return null;
    if (input.branchIds) input.branchIds = objectIds(await validateProviderBranches(scope, current.employeeId?._id ?? current.employeeId, input.branchIds));
    if (input.specialtyIds) input.specialtyIds = objectIds(await validateSpecialties(scope, input.specialtyIds));
    if (input.serviceIds) input.serviceIds = objectIds(input.serviceIds);
    if (input.workingHours) validateSchedule(input.workingHours);
    if (input.status === 'active') {
      const employee = await Employee.findOne({ _id: current.employeeId?._id ?? current.employeeId, tenantId: scope.tenantId, clinicId: scope.clinicId, status: 'active' }).lean();
      if (!employee) throw { status: 409, code: 'PROVIDER_EMPLOYEE_INACTIVE', message: 'An inactive employee cannot have an active provider profile.' };
      const effectiveExpiry = Object.prototype.hasOwnProperty.call(input, 'licenseExpiresAt') ? input.licenseExpiresAt : current.licenseExpiresAt;
      if (effectiveExpiry && new Date(effectiveExpiry).getTime() < Date.now()) throw { status: 409, code: 'PROVIDER_LICENSE_EXPIRED', message: 'An expired license cannot be activated.' };
    }
    const item = await Provider.findOneAndUpdate({ _id: id, tenantId: scope.tenantId, clinicId: scope.clinicId, ...(scope.branchId ? { branchIds: scope.branchId } : {}) }, { $set: { ...input, updatedBy: scope.userId } }, { new: true, runValidators: true }).populate({ path: 'employeeId', select: 'firstName lastName displayName employeeCode jobTitle status' }).lean();
    if (item) await audit(scope, 'provider.updated', 'provider', id, { changedFields: Object.keys(input) });
    return item;
  },
  async replaceProviderBranches(scope: Scope, id: string, branchIds: string[]) {
    const current = await this.getProvider(scope, id);
    if (!current) return null;
    const branches = await validateProviderBranches(scope, current.employeeId?._id ?? current.employeeId, branchIds);
    const item = await Provider.findOneAndUpdate({ _id: id, tenantId: scope.tenantId, clinicId: scope.clinicId }, { $set: { branchIds: objectIds(branches), updatedBy: scope.userId } }, { new: true, runValidators: true }).lean();
    if (item) await audit(scope, 'provider.branches.updated', 'provider', id, { branchCount: branches.length });
    return item;
  },
  async replaceProviderServices(scope: Scope, id: string, serviceIds: string[]) {
    const current = await this.getProvider(scope, id);
    if (!current) return null;
    const item = await Provider.findOneAndUpdate({ _id: id, tenantId: scope.tenantId, clinicId: scope.clinicId }, { $set: { serviceIds: objectIds(serviceIds), updatedBy: scope.userId } }, { new: true, runValidators: true }).lean();
    if (item) await audit(scope, 'provider.services.updated', 'provider', id, { serviceCount: serviceIds.length });
    return item;
  },
  async getProviderWorkingHours(scope: Scope, id: string) {
    const provider = await this.getProvider(scope, id);
    return provider ? provider.workingHours ?? [] : null;
  },
  async setProviderWorkingHours(scope: Scope, id: string, workingHours: any[]) {
    const current = await this.getProvider(scope, id);
    if (!current) return null;
    validateSchedule(workingHours);
    const item = await Provider.findOneAndUpdate({ _id: id, tenantId: scope.tenantId, clinicId: scope.clinicId }, { $set: { workingHours, updatedBy: scope.userId } }, { new: true, runValidators: true }).lean();
    if (item) await audit(scope, 'provider.working_hours.updated', 'provider', id, { daysConfigured: workingHours.length });
    return item;
  },
  async listSpecialties(scope: Scope) {
    return Specialty.find({ tenantId: scope.tenantId, clinicId: scope.clinicId, status: 'active' }).sort({ name: 1 }).lean();
  },
  async createSpecialty(scope: Scope, input: any) {
    const item = await Specialty.create({ ...input, tenantId: scope.tenantId, clinicId: scope.clinicId, createdBy: scope.userId });
    await audit(scope, 'specialty.created', 'specialty', String(item._id));
    return item;
  },
  async assertProviderBookable(scope: { tenantId: string; clinicId: string }, providerId: string, branchId: string, serviceId: string) {
    const provider = await Provider.findOne({ _id: providerId, tenantId: scope.tenantId, clinicId: scope.clinicId, branchIds: branchId, serviceIds: serviceId, status: 'active' }).lean();
    if (!provider) throw { status: 409, code: 'PROVIDER_NOT_ELIGIBLE', message: 'Provider is inactive or not assigned to this branch and service.' };
    if (provider.licenseExpiresAt && new Date(provider.licenseExpiresAt).getTime() < Date.now()) throw { status: 409, code: 'PROVIDER_LICENSE_EXPIRED', message: 'Provider license has expired.' };
    const employee = await Employee.findOne({ _id: provider.employeeId, tenantId: scope.tenantId, clinicId: scope.clinicId, status: 'active' }).lean();
    if (!employee) throw { status: 409, code: 'PROVIDER_EMPLOYEE_INACTIVE', message: 'Provider employee record is inactive.' };
    return provider;
  },
};
