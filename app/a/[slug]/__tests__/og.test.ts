import { describe, it, expect, vi } from 'vitest';

// Stub the data layer so the OG handler doesn't touch a real database.
const findBySlug = vi.fn();
vi.mock('@/lib/db/factory', () => ({
  getArtifactRepository: async () => ({ findBySlug }),
}));

import Image from '@/app/a/[slug]/opengraph-image';

const live = (over: Record<string, unknown> = {}) => ({
  title: 'My Chart',
  content: '<html><head><title>My Chart</title></head></html>',
  visibility: 'public',
  expiresAt: new Date(Date.now() + 3_600_000),
  ...over,
});

describe('opengraph-image', () => {
  it('returns an image response for a public artifact', async () => {
    findBySlug.mockResolvedValueOnce(live());
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

  it('returns a branded fallback for a non-public artifact (no title leak)', async () => {
    findBySlug.mockResolvedValueOnce(live({ visibility: 'password' }));
    const res = await Image({ params: Promise.resolve({ slug: 'secret' }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get('content-type')).toContain('image/');
  });
});
