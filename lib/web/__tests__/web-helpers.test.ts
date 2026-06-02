import { describe, it, expect } from 'vitest';
import { deployErrorMessage } from '@/lib/web/errors';
import { humanizeExpiry } from '@/lib/web/format';
import { validateDeployInput, buildDeployPayload } from '@/lib/web/deploy';

describe('deployErrorMessage', () => {
  it('maps known codes to friendly copy', () => {
    expect(deployErrorMessage('too_large')).toMatch(/5 MB/);
    expect(deployErrorMessage('live_cap_reached')).toMatch(/5 live/);
    expect(deployErrorMessage('rate_limited')).toMatch(/too many/i);
    expect(deployErrorMessage('password_required')).toMatch(/password/i);
  });
  it('falls back for unknown / missing codes', () => {
    expect(deployErrorMessage('internal')).toMatch(/something went wrong/i);
    expect(deployErrorMessage(undefined)).toMatch(/something went wrong/i);
  });
});

describe('humanizeExpiry', () => {
  const now = new Date('2026-06-02T00:00:00Z');
  it('renders hours under 24h', () => {
    expect(humanizeExpiry('2026-06-02T01:00:00Z', now)).toBe('Expires in 1 hour');
    expect(humanizeExpiry('2026-06-02T05:00:00Z', now)).toBe('Expires in 5 hours');
  });
  it('renders days at/over 24h', () => {
    expect(humanizeExpiry('2026-06-09T00:00:00Z', now)).toBe('Expires in 7 days');
    expect(humanizeExpiry('2026-06-03T00:00:00Z', now)).toBe('Expires in 1 day');
  });
  it('handles already-expired', () => {
    expect(humanizeExpiry('2026-06-01T00:00:00Z', now)).toBe('Expired');
  });
});

describe('validateDeployInput', () => {
  it('rejects empty html', () => {
    expect(validateDeployInput({ content: '   ', visibility: 'public', password: '' }))
      .toEqual({ ok: false, error: 'Paste some HTML first.' });
  });
  it('rejects password visibility without a password', () => {
    expect(validateDeployInput({ content: '<h1>x</h1>', visibility: 'password', password: '' }))
      .toEqual({ ok: false, error: 'Enter a password, or switch to public.' });
  });
  it('accepts valid input', () => {
    expect(validateDeployInput({ content: '<h1>x</h1>', visibility: 'public', password: '' }))
      .toEqual({ ok: true });
  });
});

describe('buildDeployPayload', () => {
  it('omits password for public', () => {
    expect(buildDeployPayload({ content: '<h1>x</h1>', ttl: '7d', visibility: 'public', password: '' }))
      .toEqual({ content: '<h1>x</h1>', ttl: '7d', visibility: 'public' });
  });
  it('includes password for password visibility', () => {
    expect(buildDeployPayload({ content: '<h1>x</h1>', ttl: '1h', visibility: 'password', password: 'pw' }))
      .toEqual({ content: '<h1>x</h1>', ttl: '1h', visibility: 'password', password: 'pw' });
  });
});
