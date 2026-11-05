import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
    findClinicById: vi.fn(),
    createTenantDocument: vi.fn(),
    listTenantDocuments: vi.fn(),
    findTenantDocument: vi.fn(),
    findTenantDocumentMetadata: vi.fn(),
    listTenantDocumentVersions: vi.fn(),
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
    vi.mocked(storePrivateTenantDocument).mockResolvedValue(tenantId + '/file.pdf');
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
      storageKey: tenantId + '/file.pdf',
    }));
    expect(result).toMatchObject({ tenantId, mimeType: 'application/pdf' });
  });

  it('stores clinic documents with both tenant and clinic ownership', async () => {
    const clinicId = '64b000000000000000000005';
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue({ _id: clinicId } as any);
    vi.mocked(storePrivateTenantDocument).mockResolvedValue(tenantId + '/clinic-file.pdf');
    vi.mocked(tenancyRepository.createTenantDocument).mockImplementation(async (data: any) => data as any);

    const result = await tenancyService.createTenantDocument(tenantId, userId, {
      name: 'Clinic License.pdf',
      category: 'license',
      fileBase64: pdfBase64,
    }, clinicId);

    expect(tenancyRepository.findClinicById).toHaveBeenCalledWith(clinicId, tenantId);
    expect(tenancyRepository.createTenantDocument).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      clinicId,
      category: 'license',
      uploadedBy: userId,
    }));
    expect(result).toMatchObject({ tenantId, clinicId });
  });

  it('does not store a clinic document when the clinic is outside the tenant', async () => {
    const clinicId = '64b000000000000000000005';
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue(null as any);

    await expect(tenancyService.createTenantDocument(tenantId, userId, {
      name: 'Clinic License.pdf',
      category: 'license',
      fileBase64: pdfBase64,
    }, clinicId)).resolves.toBeNull();

    expect(storePrivateTenantDocument).not.toHaveBeenCalled();
    expect(tenancyRepository.createTenantDocument).not.toHaveBeenCalled();
  });

  it('uses clinic scope for document downloads to prevent cross-clinic access', async () => {
    const clinicId = '64b000000000000000000005';
    vi.mocked(tenancyRepository.findTenantDocument).mockResolvedValue(null as any);

    await expect(tenancyService.getTenantDocument(tenantId, documentId, clinicId)).resolves.toBeNull();

    expect(tenancyRepository.findTenantDocument).toHaveBeenCalledWith(tenantId, documentId, clinicId);
    expect(readPrivateTenantDocument).not.toHaveBeenCalled();
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
    vi.mocked(storePrivateTenantDocument).mockResolvedValue(tenantId + '/orphan.pdf');
    vi.mocked(removePrivateTenantDocument).mockResolvedValue(undefined);
    vi.mocked(tenancyRepository.createTenantDocument).mockRejectedValue(new Error('database unavailable'));

    await expect(tenancyService.createTenantDocument(tenantId, userId, {
      name: 'Registration',
      category: 'registration',
      fileBase64: pdfBase64,
    })).rejects.toThrow('database unavailable');

    expect(removePrivateTenantDocument).toHaveBeenCalledWith(tenantId + '/orphan.pdf');
  });

  it('downloads only a document found under the requested tenant', async () => {
    vi.mocked(tenancyRepository.findTenantDocument).mockResolvedValue({
      storageKey: tenantId + '/document.pdf',
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
  it('replaces a document with a new version and archives the previous version', async () => {
    vi.mocked(tenancyRepository.findTenantDocument).mockResolvedValue({
      _id: documentId,
      tenantId,
      name: 'Registration.pdf',
      category: 'registration',
      version: 3,
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    } as any);
    vi.mocked(storePrivateTenantDocument).mockResolvedValue(tenantId + '/registration-v4.pdf');
    vi.mocked(tenancyRepository.createTenantDocument).mockResolvedValue({
      _id: '64b000000000000000000004',
      version: 4,
      category: 'registration',
      storageKey: tenantId + '/registration-v4.pdf',
    } as any);
    vi.mocked(tenancyRepository.archiveTenantDocument).mockResolvedValue({ _id: documentId } as any);

    const result = await tenancyService.replaceTenantDocument(tenantId, documentId, userId, {
      fileBase64: pdfBase64,
      expiresAt: null,
    });

    expect(tenancyRepository.createTenantDocument).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      uploadedBy: userId,
      category: 'registration',
      version: 4,
      replacesDocumentId: documentId,
      expiresAt: null,
      storageKey: tenantId + '/registration-v4.pdf',
    }));
    expect(tenancyRepository.archiveTenantDocument).toHaveBeenCalledWith(tenantId, documentId, userId);
    expect(result).toMatchObject({ version: 4, category: 'registration' });
    expect(removePrivateTenantDocument).not.toHaveBeenCalled();
  });

  it('cleans up the replacement file if the original document can no longer be archived', async () => {
    vi.mocked(tenancyRepository.findTenantDocument).mockResolvedValue({
      _id: documentId,
      tenantId,
      name: 'Registration.pdf',
      category: 'registration',
      version: 1,
    } as any);
    vi.mocked(storePrivateTenantDocument).mockResolvedValue(tenantId + '/replacement.pdf');
    vi.mocked(removePrivateTenantDocument).mockResolvedValue(undefined);
    vi.mocked(tenancyRepository.createTenantDocument).mockResolvedValue({
      _id: '64b000000000000000000004',
      version: 2,
    } as any);
    vi.mocked(tenancyRepository.archiveTenantDocument)
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce({ _id: '64b000000000000000000004' } as any);

    await expect(tenancyService.replaceTenantDocument(tenantId, documentId, userId, {
      fileBase64: pdfBase64,
    })).rejects.toMatchObject({ code: 'DOCUMENT_REPLACEMENT_CONFLICT', status: 409 });

    expect(removePrivateTenantDocument).toHaveBeenCalledWith(tenantId + '/replacement.pdf');
  });

  it('returns tenant-scoped document version history without storage keys', async () => {
    vi.mocked(tenancyRepository.listTenantDocumentVersions).mockResolvedValue([
      { _id: 'version-1', version: 1, status: 'archived' },
      { _id: documentId, version: 2, status: 'active' },
    ] as any);

    const result = await tenancyService.getTenantDocumentVersionHistory(tenantId, documentId);

    expect(tenancyRepository.listTenantDocumentVersions).toHaveBeenCalledWith(tenantId, documentId);
    expect(result).toHaveLength(2);
    expect(result?.[0]).toMatchObject({ version: 1, status: 'archived' });
  });

});
