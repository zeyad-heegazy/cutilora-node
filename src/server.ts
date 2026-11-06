import { app } from './app/app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';
import { startTenantWebhookWorker } from './modules/tenancy/services/tenant-webhook.worker.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const stopWebhookWorker = startTenantWebhookWorker();
  const server = app.listen(env.PORT, () => {
    console.info(`Cutilora API listening on port ${env.PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`${signal} received. Shutting down...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start API:', error);
  process.exit(1);
});
