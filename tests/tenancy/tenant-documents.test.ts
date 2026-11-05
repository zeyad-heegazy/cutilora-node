import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    createTenantDocument: vi.fn(),
    listTenantDocuments: vi.fn(),
    findTenantDocument: vi.fn(),
    findTenantDocumentMetadata: vi.fn(),
    archiveTenantDocument: vi.fn(),
  },
}));
vi.mock('../../src/modules/geo/services/geo.service.js', () => ({
  geoService: { listForClinic: vi.fn(), validateClinicLocation: vi.fn(), validateCity: vi.fn() },
}));
vi.mock('../../src/shared/storage/branding-image.storage.js', () => ({
  storeBrandingLogo: vi.fn(),
  storeBrandingCover: vi.fn(),
  removeBrandingImage: vi.fn(),
}));
vi.mock('../../src/shared/storage/private-tenant-document.storage.js', () => ({
  storePrivateTenantDocument: vi.fn(),
  readPrivateTenantDocument: vi.fn(),
  removePrivateTenantDocument: vi.fn(),
}));

import { tenancyService } from '../../src/modules/tenancy/services/tenancy.service.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';
import { storePrivateTenantDocument, readPrivateTenantDocument, removePrivateTenantDocument } from '../../src/shared/storage/private-tenant-document.storage.js';

const tenantId = '64b000000000000000000001';
const userId = '64b000000000000000000002';
const documentId = '64b000000000000000000003';
const pdfBase64 = Buffer.from('%PDF-1.7\nprivate document').toString('base64');

describe('tenant document service', () => {
  beforeEach(() => vi.resetAllMocks());

  it('stores validated document bytes privately and persists tenant ownership metadata', async () => {
    vi.mocked(storePrivateTenantDocument).mockResolvedValue(\`\${tenantId}/file.pdf\`);
    vi.mocked(tenancyRepository.createTenantDocument).mockImplementation(async (data: any) => data as any);

    const result = await tenancyService.createTenantDocument(tenantId, userId, {
      name: 'Commercial Registration.pdf',
      category: 'registration',
      fileBase64: pdfBase64,
    });

    expect(storePrivateTenantDocument).toHaveBeenCalledWith(tenantId, 'pdf', expect.any(Buffer));
    expect(tenancyRepository.createTenantDocument).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      uploadedBy: userId,
      category: 'registration',
      mimeType: 'application/pdf',
      storageKey: \`\${tenantId}/file.pdf\`,
    }));
    expect(result).toMatchObject({ tenantId, mimeType: 'application/pdf' });
  });

  it('rejects content that is not a supported file before writing it', async () => {
    await expect(tenancyService.createTenantDocument(tenantId, userId, {
      name: 'fake.pdf',
      category: 'registration',
      fileBase64: Buffer.from('not a pdf').toString('base64'),
    })).rejects.toThrow('Only valid PDF');
    expect(storePrivateTenantDocument).not.toHaveBeenCalled();
    expect(tenancyRepository.createTenantDocument).not.toHaveBeenCalled();
  });

  it('removes the stored file if document metadata persistence fails', async () => {
    vi.mocked(storePrivateTenantDocument).mockResolvedValue(\`\${tenantId}/orphan.pdf\`);
    vi.mocked(tenancyRepository.createTenantDocument).mockRejectedValue(new Error('database unavailable'));

    await expect(tenancyService.createTenantDocument(tenantId, userId, {
      name: 'Registration',
      category: 'registration',
      fileBase64: pdfBase64,
    })).rejects.toThrow('database unavailable');

    expect(removePrivateTenantDocument).toHaveBeenCalledWith(\`\${tenantId}/orphan.pdf\`);
  });

  it('downloads only a document found under the requested tenant', async () => {
    vi.mocked(tenancyRepository.findTenantDocument).mockResolvedValue({
      storageKey: \`\${tenantId}/document.pdf\`,
      tenantId,
      mimeType: 'application/pdf',
    } as any);
    vi.mocked(readPrivateTenantDocument).mockResolvedValue(Buffer.from('%PDF-1.7'));

    const result = await tenancyService.getTenantDocument(tenantId, documentId);
    expect(tenancyRepository.findTenantDocument).toHaveBeenCalledWith(tenantId, documentId);
    expect(result?.content.toString()).toBe('%PDF-1.7');
  });

  it('does not read a document when the tenant-scoped lookup misses', async () => {
    vi.mocked(tenancyRepository.findTenantDocument).mockResolvedValue(null as any);
    await expect(tenancyService.getTenantDocument(tenantId, documentId)).resolves.toBeNull();
    expect(readPrivateTenantDocument).not.toHaveBeenCalled();
  });
});
