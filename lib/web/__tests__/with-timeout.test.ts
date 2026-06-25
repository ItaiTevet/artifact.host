import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout } from '../with-timeout';

afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('resolves with the value when the promise settles before the timeout', async () => {
    expect(await withTimeout(Promise.resolve('ok'), 1000, 'fallback')).toBe('ok');
  });

  it('resolves with the fallback when the promise exceeds the timeout', async () => {
    vi.useFakeTimers();
    // A promise that would only settle long after the deadline — the guard must not hang on it.
    const slow = new Promise<string>((res) => setTimeout(() => res('late'), 5000));
    const guarded = withTimeout(slow, 1000, 'fallback');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await guarded).toBe('fallback');
  });

  it('propagates a rejection that happens before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'fb')).rejects.toThrow('boom');
  });
});
