import { logger } from '../../../shared/logger/logger.js';
import { tenantWebhookService } from './tenant-webhook.service.js';

export function startTenantWebhookWorker(intervalMs = 10_000) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tenantWebhookService.deliverBatch(20); }
    catch (error) { logger.error('Tenant webhook worker batch failed.', { error: error instanceof Error ? error.message : 'unknown' }); }
    finally { running = false; }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
