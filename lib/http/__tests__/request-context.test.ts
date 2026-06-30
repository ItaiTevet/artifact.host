import { describe, it, expect, afterEach } from 'vitest';
import { getIpHash, getIpHashFromHeaders, hashIp } from '@/lib/http/request-context';

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://x/api/deploy', { headers });
}

afterEach(() => { delete process.env.TRUSTED_PROXY_HOPS; });

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

  it('trusts the leftmost (platform-set) IP by default — Vercel blocks XFF spoofing', () => {
    // Default: a client-supplied prepended IP is ignored only if the platform overwrote XFF;
    // here we assert the default picks the leftmost value.
    expect(getIpHash(reqWith({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })))
      .toBe(hashIp('203.0.113.7'));
  });

  it('with TRUSTED_PROXY_HOPS=1, uses the proxy-appended (rightmost) IP, ignoring a spoofed left value', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    // Attacker prepends a fake IP; the real client is what our single proxy appended.
    expect(getIpHash(reqWith({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' })))
      .toBe(hashIp('203.0.113.7'));
  });

  it('with TRUSTED_PROXY_HOPS=2, picks the IP the outermost trusted proxy appended', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    // [spoofable prefix, real client (appended by outer proxy), inner proxy IP]
    expect(getIpHash(reqWith({ 'x-forwarded-for': '66.66.66.66, 203.0.113.7, 10.0.0.9' })))
      .toBe(hashIp('203.0.113.7'));
  });

  it('clamps when the chain is shorter than the configured hop count', () => {
    process.env.TRUSTED_PROXY_HOPS = '5';
    expect(getIpHash(reqWith({ 'x-forwarded-for': '203.0.113.7' }))).toBe(hashIp('203.0.113.7'));
  });
});

describe('getIpHashFromHeaders', () => {
  it('matches getIpHash for the same forwarded IP', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.7' } });
    expect(getIpHashFromHeaders({ 'x-forwarded-for': '203.0.113.7' })).toBe(getIpHash(req));
  });

  it('uses the first IP when x-forwarded-for is an array', () => {
    const single = getIpHashFromHeaders({ 'x-forwarded-for': '203.0.113.7' });
    expect(getIpHashFromHeaders({ 'x-forwarded-for': ['203.0.113.7', '10.0.0.1'] })).toBe(single);
  });

  it('falls back to the constant bucket when the header is missing', () => {
    const none = new Request('http://x');
    expect(getIpHashFromHeaders({})).toBe(getIpHash(none));
  });
});
