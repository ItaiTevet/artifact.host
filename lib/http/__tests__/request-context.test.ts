import { describe, it, expect } from 'vitest';
import { getIpHash } from '@/lib/http/request-context';

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://x/api/deploy', { headers });
}

describe('getIpHash', () => {
  it('hashes the first x-forwarded-for IP (not reversible to the raw IP)', () => {
    const h = getIpHash(reqWith({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('203.0.113.7');
  });
  it('is stable for the same IP and differs across IPs', () => {
    const a = getIpHash(reqWith({ 'x-forwarded-for': '203.0.113.7' }));
    const b = getIpHash(reqWith({ 'x-forwarded-for': '203.0.113.7' }));
    const c = getIpHash(reqWith({ 'x-forwarded-for': '198.51.100.2' }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it('falls back to a constant bucket when no IP header is present', () => {
    expect(getIpHash(reqWith({}))).toMatch(/^[0-9a-f]{64}$/);
  });
});
