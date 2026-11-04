import { logRepository } from '../repositories/log.repository.js';
const allowedLevels = ['debug', 'info', 'warn', 'error', 'fatal'];
const allowedCategories = ['http', 'auth', 'authorization', 'database', 'business', 'security', 'system', 'application'];
export const logService = {
  async list(query: Record<string, unknown>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const filter: Record<string, unknown> = {};
    if (typeof query.level === 'string' && allowedLevels.includes(query.level)) filter.level = query.level;
    if (typeof query.category === 'string' && allowedCategories.includes(query.category)) filter.category = query.category;
    if (typeof query.module === 'string') filter.module = query.module;
    if (typeof query.statusCode === 'string' && /^\d{3}$/.test(query.statusCode)) filter.statusCode = Number(query.statusCode);
    if (typeof query.search === 'string' && query.search.trim()) filter.message = { $regex: query.search.trim().slice(0, 100), $options: 'i' };
    const from = typeof query.from === 'string' ? new Date(query.from) : undefined;
    const to = typeof query.to === 'string' ? new Date(query.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw Object.assign(new Error('Invalid date filter.'), { status: 400, code: 'INVALID_DATE' });
    if (from || to) filter.occurredAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    return logRepository.list(filter, page, limit);
  },
  get(id: string) { return logRepository.findById(id); },
  async stats(query: Record<string, unknown>) {
    const to = typeof query.to === 'string' ? new Date(query.to) : new Date();
    const from = typeof query.from === 'string' ? new Date(query.from) : new Date(to.getTime() - 7 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw Object.assign(new Error('Invalid date range.'), { status: 400, code: 'INVALID_DATE_RANGE' });
    return logRepository.stats(from, to);
  },
  async timeline(query: Record<string, unknown>) { return this.stats(query); },
};
