import { createHash } from 'node:crypto';

function firstForwardedIp(xff: string | null | undefined): string {
  return (xff ?? '').split(',')[0]?.trim() || 'unknown';
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip || 'unknown').digest('hex');
}

export function getIpHash(req: Request): string {
  return hashIp(firstForwardedIp(req.headers.get('x-forwarded-for')));
}

/** Same hashing as getIpHash, but from a plain headers object (e.g. MCP requestInfo.headers). */
export function getIpHashFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string {
  const v = headers['x-forwarded-for'];
  const xff = Array.isArray(v) ? v[0] : v ?? null;
  return hashIp(firstForwardedIp(xff));
}
