import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function imageSignature(buffer: Buffer, mime: string): boolean {
  if (mime === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export async function storeBrandingLogo(base64Image: string, entity: 'tenants' | 'clinics', entityId: string): Promise<string> {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(base64Image);
  if (!match) throw Object.assign(new Error('Logo must be a Base64 data URL for PNG, JPEG, or WebP.'), { status: 422, code: 'INVALID_LOGO_FORMAT' });
  const mime = match[1]!;
  const data = Buffer.from(match[2]!, 'base64');
  if (!data.length || data.length > MAX_LOGO_BYTES || !imageSignature(data, mime)) {
    throw Object.assign(new Error('Logo is invalid or exceeds the 2 MB limit.'), { status: 422, code: 'INVALID_LOGO_IMAGE' });
  }
  const safeId = entityId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('Invalid branding entity identifier.');
  const directory = path.resolve(process.cwd(), 'public', 'uploads', 'branding', entity, safeId);
  await mkdir(directory, { recursive: true });
  const filename = `${randomUUID()}.${MIME_EXTENSIONS[mime]}`;
  await writeFile(path.join(directory, filename), data, { flag: 'wx' });
  return `/uploads/branding/${entity}/${safeId}/${filename}`;
}

export async function removeBrandingLogo(url?: string | null): Promise<void> {
  if (!url?.startsWith('/uploads/branding/')) return;
  const relative = url.replace(/^\/uploads\//, '');
  const root = path.resolve(process.cwd(), 'public', 'uploads');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) return;
  try { await unlink(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
