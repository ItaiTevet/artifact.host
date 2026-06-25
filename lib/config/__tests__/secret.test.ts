import { describe, it, expect, afterEach, vi } from 'vitest';
import { requireSecret } from '@/lib/config/secret';

const KEY = 'TEST_SECRET_XYZ';

afterEach(() => { vi.unstubAllEnvs(); });

describe('requireSecret', () => {
  it('returns the value when present and long enough', () => {
    vi.stubEnv(KEY, 'a'.repeat(32));
    expect(requireSecret(KEY)).toBe('a'.repeat(32));
  });

  it('throws when missing and no dev fallback is given', () => {
    vi.stubEnv(KEY, '');
    expect(() => requireSecret(KEY)).toThrow(/required/);
  });

  it('throws when shorter than the minimum length', () => {
    vi.stubEnv(KEY, 'short');
    expect(() => requireSecret(KEY)).toThrow(/required/);
  });

  it('uses the dev fallback outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv(KEY, '');
    expect(requireSecret(KEY, { devFallback: 'dev' })).toBe('dev');
  });

  it('still throws in production even with a dev fallback', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(KEY, '');
    expect(() => requireSecret(KEY, { devFallback: 'dev' })).toThrow(/required/);
  });
});
