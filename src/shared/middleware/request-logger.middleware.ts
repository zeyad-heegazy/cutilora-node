import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger/logger.js';
import { logRepository } from '../../modules/monitoring/repositories/log.repository.js';
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  const requestId = req.header('x-request-id') || randomUUID();
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    const durationMs = Date.now() - started;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const entry = { level, category: 'http', message: `${req.method} ${req.path} ${res.statusCode}`, module: 'http', method: req.method, path: req.path, statusCode: res.statusCode, durationMs, requestId, userId: req.auth?.userId, occurredAt: new Date() };
    logger[level](entry.message, { requestId, statusCode: res.statusCode, durationMs });
    void logRepository.create(entry).catch((error: unknown) => logger.error('Failed to persist HTTP log', { error: error instanceof Error ? error.message : 'unknown' }));
  });
  next();
}
