/** "Expires in 7 days" / "Expires in 1 hour" / "Expired" from an ISO timestamp. */
export function humanizeExpiry(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) {
    const h = Math.max(1, hours);
    return `Expires in ${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(hours / 24);
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}
