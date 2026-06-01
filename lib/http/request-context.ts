import { createHash } from 'node:crypto';

export function getIpHash(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]?.trim() || 'unknown';
  return createHash('sha256').update(ip).digest('hex');
}
