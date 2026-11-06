import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  action: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  targetType: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  targetId: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null, immutable: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, immutable: true },
  result: { type: String, enum: ['success', 'failure'], default: 'success', immutable: true },
  requestId: { type: String, trim: true, maxlength: 120, default: '', immutable: true },
  metadata: { type: Schema.Types.Mixed, default: {}, immutable: true },
  changes: { type: Schema.Types.Mixed, default: null, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, minimize: false });

schema.pre('save', function () {\n  const redact = (value: any, depth = 0): any => {\n    if (depth > 5) return '[TRUNCATED]';\n    if (Array.isArray(value)) return value.slice(0, 100).map(item => redact(item, depth + 1));\n    if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 2000) : value;\n    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, /password|secret|token|credential|authorization|api.?key|card|cvv/i.test(key) ? '[REDACTED]' : redact(item, depth + 1)]));\n  };\n  this.metadata = redact(this.metadata ?? {});\n  if (this.changes) this.changes = redact(this.changes);\n});\n\nfor (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {\n  schema.pre(operation as any, function () { throw new Error('Tenant audit events are append-only.'); });\n}\n\nschema.post('save', (doc) => {\n  void import('../services/tenant-webhook.service.js')\n    .then(({ tenantWebhookService }) => tenantWebhookService.queueAuditEvent(doc.toObject()))\n    .catch(() => undefined);\n});\n\nschema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, actorUserId: 1, createdAt: -1 });
schema.index({ tenantId: 1, action: 1, createdAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, createdAt: -1 });
export const TenantAuditEvent = (models.TenantAuditEvent || model('TenantAuditEvent', schema)) as Model<any>;
