import { User } from '../models/user.model.js';
import { TenantMembership } from '../../tenancy/models/tenant-membership.model.js';
import { InvitationRateLimit } from '../models/invitation-rate-limit.model.js';
import '../../tenancy/models/tenant.model.js';
import '../../tenancy/models/clinic.model.js';
import '../../tenancy/models/branch.model.js';

export const authRepository = {
  findUserByEmail(email: string) { return User.findOne({ email }).select('+passwordHash name email platformRole isActive'); },
  async consumeInvitationAttempt(key: string, now: Date, windowMs: number) {
    const expiresAt = new Date(now.getTime() + windowMs);
    return InvitationRateLimit.findOneAndUpdate(
      { key },
      [{ $set: {
        count: { $cond: [{ $gt: ['$expiresAt', now] }, { $add: [{ $ifNull: ['$count', 0] }, 1] }, 1] },
        windowStartedAt: { $cond: [{ $gt: ['$expiresAt', now] }, '$windowStartedAt', now] },
        expiresAt: { $cond: [{ $gt: ['$expiresAt', now] }, '$expiresAt', expiresAt] },
      } }] as any,
      { upsert: true, new: true },
    ).select('count expiresAt').lean();
  },
  findUserById(id: string) { return User.findById(id).select('name email platformRole isActive lastLoginAt'); },
  updateLastLogin(id: string, at: Date) { return User.updateOne({ _id: id }, { $set: { lastLoginAt: at } }); },
  findActiveUserById(id: string) { return User.findById(id).select('platformRole isActive'); },
  createUser(data: Record<string, unknown>) { return User.create(data); },
  deleteUserById(id: string) { return User.deleteOne({ _id: id }); },
  hasPlatformAdmin() { return User.exists({ platformRole: 'platform_admin' }); },
  findActiveMemberships(userId: string) {
    return TenantMembership.find({ userId, status: 'active' })
      .populate({ path: 'tenantId', match: { status: 'active' }, select: 'name slug status' })
      .populate({ path: 'clinicId', match: { status: 'active' }, select: 'name slug status' })
      .select('tenantId clinicId branchIds scope role');
  },
};