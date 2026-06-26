import type { SharePrincipal } from '@/lib/artifacts/types';

/**
 * Parse an owner-entered allowlist (comma/newline/space separated) into principals.
 * An entry containing '@' (e.g. alice@example.com) is an email; a bare domain (example.com)
 * or a leading-'@' domain (@example.com) is a domain. Values are lowercased + de-duplicated.
 */
export function parsePrincipals(input: string): SharePrincipal[] {
  const seen = new Set<string>();
  const out: SharePrincipal[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    let type: SharePrincipal['type'];
    let value: string;
    if (token.startsWith('@')) { type = 'domain'; value = token.slice(1); }
    else if (token.includes('@')) { type = 'email'; value = token; }
    else { type = 'domain'; value = token; }
    if (!value || value.includes(' ')) continue;
    const key = `${type}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value, type, role: 'view' });
  }
  return out;
}

/** Render an allowlist back to a human-editable string (one per line). */
export function formatPrincipals(principals: SharePrincipal[]): string {
  return principals.map((p) => (p.type === 'domain' ? `@${p.value}` : p.value)).join('\n');
}

/** Serialize an allowlist for a text/JSON column (null when empty, to keep rows tidy). */
export function serializeAllowlist(list: SharePrincipal[]): string | null {
  return list.length ? JSON.stringify(list) : null;
}

/** Parse a stored allowlist column back into principals (tolerant of null/garbage). */
export function deserializeAllowlist(raw: string | null | undefined): SharePrincipal[] {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(v)) return [];
    return (v as Partial<SharePrincipal>[])
      .filter((p): p is SharePrincipal => typeof p?.value === 'string' && (p.type === 'email' || p.type === 'domain'))
      .map((p) => ({ value: p.value, type: p.type, role: p.role === 'comment' ? 'comment' : 'view' }));
  } catch {
    return [];
  }
}

/** True if a verified email matches the allowlist by exact email or by domain. */
export function emailAllowed(email: string | null | undefined, allowlist: SharePrincipal[]): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const domain = e.split('@')[1];
  return allowlist.some((p) =>
    p.type === 'email' ? p.value === e : !!domain && p.value === domain,
  );
}

/** True if a verified email matches an allowlist principal that has the 'comment' role. */
export function commentAllowed(email: string | null | undefined, allowlist: SharePrincipal[]): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const domain = e.split('@')[1];
  return allowlist.some((p) =>
    p.role === 'comment' && (p.type === 'email' ? p.value === e : !!domain && p.value === domain),
  );
}
