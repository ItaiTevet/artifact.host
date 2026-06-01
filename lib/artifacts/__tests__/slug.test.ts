import { describe, it, expect } from 'vitest';
import { generateSlug, SLUG_ALPHABET } from '@/lib/artifacts/slug';

describe('generateSlug', () => {
  it('returns a 7-char slug from the safe alphabet', () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(7);
    for (const ch of slug) expect(SLUG_ALPHABET).toContain(ch);
  });

  it('excludes ambiguous characters 0 1 o l i', () => {
    for (const ch of '01oli') expect(SLUG_ALPHABET).not.toContain(ch);
  });

  it('is highly unlikely to collide across 1000 generations', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateSlug());
    expect(seen.size).toBe(1000);
  });
});
