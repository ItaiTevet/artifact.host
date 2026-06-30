import { describe, it, expect, afterEach, vi } from 'vitest';
import { anonymousDeployDisabled } from '@/lib/config/deploy';

afterEach(() => { vi.unstubAllEnvs(); });

describe('anonymousDeployDisabled', () => {
  it('defaults to false when unset (anonymous deploys allowed)', () => {
    vi.stubEnv('DISABLE_ANONYMOUS_DEPLOY', '');
    expect(anonymousDeployDisabled()).toBe(false);
  });

  it('is true for "true" and "1"', () => {
    vi.stubEnv('DISABLE_ANONYMOUS_DEPLOY', 'true');
    expect(anonymousDeployDisabled()).toBe(true);
    vi.stubEnv('DISABLE_ANONYMOUS_DEPLOY', '1');
    expect(anonymousDeployDisabled()).toBe(true);
  });

  it('is false for any other value', () => {
    vi.stubEnv('DISABLE_ANONYMOUS_DEPLOY', 'yes');
    expect(anonymousDeployDisabled()).toBe(false);
  });
});
