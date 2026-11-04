import { logRepository } from '../../../../shared/observability/log.repository.js';
import { logger } from '../../../../shared/logger/logger.js';
type AuditInput = { level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal'; category: 'auth' | 'authorization' | 'database' | 'business' | 'security' | 'system' | 'application'; message: string; module: string; userId?: string; tenantId?: string; metadata?: Record<string, unknown> };
export async function recordSystemLog(input: AuditInput): Promise<void> {
  const safe = { ...input, level: input.level ?? 'info' };
  logger[safe.level](safe.message, { category: safe.category, module: safe.module });
  try { await logRepository.create(safe); } catch (error) { logger.error('Failed to persist system log', { error: error instanceof Error ? error.message : 'unknown' }); }
}
