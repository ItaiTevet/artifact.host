import { describe, it, expect } from 'vitest';
import { isTtl, resolveExpiry } from '@/lib/artifacts/ttl';

describe('isTtl', () => {
  it('accepts the four allowed values', () => {
    for (const v of ['1h', '1d', '7d', '30d']) expect(isTtl(v)).toBe(true);
  });
  it('rejects anything else', () => {
    for (const v of ['', '2h', 'permanent', '60d']) expect(isTtl(v)).toBe(false);
  });
});

describe('resolveExpiry', () => {
  const base = new Date('2026-01-01T00:00:00.000Z');
  it('adds the right number of seconds', () => {
    expect(resolveExpiry('1h', base).toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(resolveExpiry('1d', base).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(resolveExpiry('7d', base).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(resolveExpiry('30d', base).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
