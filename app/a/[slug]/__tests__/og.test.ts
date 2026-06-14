import { describe, it, expect, vi } from 'vitest';

// Stub the data layer so the OG handler doesn't touch a real database.
const findBySlug = vi.fn();
vi.mock('@/lib/db/factory', () => ({
  getArtifactRepository: async () => ({ findBySlug }),
}));

import Image from '@/app/a/[slug]/opengraph-image';

describe('opengraph-image', () => {
  it('returns an image response for an existing artifact', async () => {
    findBySlug.mockResolvedValueOnce({ title: 'My Chart', expiresAt: new Date(Date.now() + 3_600_000) });
    const res = await Image({ params: Promise.resolve({ slug: 'x7k2' }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get('content-type')).toContain('image/');
  });

  it('returns a branded fallback for a missing/expired artifact', async () => {
    findBySlug.mockResolvedValueOnce(null);
    const res = await Image({ params: Promise.resolve({ slug: 'nope' }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get('content-type')).toContain('image/');
  });
});
