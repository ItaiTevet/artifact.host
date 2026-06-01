import { describe, it, expect } from 'vitest';
import { validateSize, MAX_BYTES } from '@/lib/artifacts/validate';

describe('validateSize', () => {
  it('accepts content within the 5MB cap', () => {
    expect(validateSize('<html></html>').ok).toBe(true);
  });
  it('rejects content over 5MB', () => {
    const big = 'a'.repeat(MAX_BYTES + 1);
    const r = validateSize(big);
    expect(r.ok).toBe(false);
  });
  it('counts UTF-8 bytes, not characters', () => {
    // each emoji is 4 bytes; fill just over the cap with multibyte chars
    const justOver = '😀'.repeat(Math.ceil((MAX_BYTES + 1) / 4));
    expect(validateSize(justOver).ok).toBe(false);
  });
});
