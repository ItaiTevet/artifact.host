import type { Ttl } from '@/lib/artifacts/types';

const TTL_SECONDS: Record<Ttl, number> = {
  '1h': 3600,
  '1d': 86_400,
  '7d': 604_800,
  '30d': 2_592_000,
};

export function isTtl(value: string): value is Ttl {
  return Object.prototype.hasOwnProperty.call(TTL_SECONDS, value);
}

export function resolveExpiry(ttl: Ttl, from: Date = new Date()): Date {
  return new Date(from.getTime() + TTL_SECONDS[ttl] * 1000);
}
