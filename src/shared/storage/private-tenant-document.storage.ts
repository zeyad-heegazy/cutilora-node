import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PRIVATE_ROOT = path.resolve(process.cwd(), 'storage', 'private', 'tenant-documents');

function resolveStorageKey(key: string): string {
  const target = path.resolve(PRIVATE_ROOT, key);
  if (!target.startsWith(PRIVATE_ROOT + path.sep)) throw new Error('Invalid private document storage key.');
  return target;
}

export async function storePrivateTenantDocument(tenantId: string, extension: string, content: Buffer): Promise<string> {
  const directory = path.join(PRIVATE_ROOT, tenantId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const key = path.posix.join(tenantId, `${randomUUID()}.${extension}`);
  await writeFile(resolveStorageKey(key), content, { flag: 'wx', mode: 0o600 });
  return key;
}

export function readPrivateTenantDocument(key: string): Promise<Buffer> {
  return readFile(resolveStorageKey(key));
}

export async function removePrivateTenantDocument(key: string): Promise<void> {
  try { await unlink(resolveStorageKey(key)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
