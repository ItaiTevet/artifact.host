// 4.5 MB — matches Vercel's hard request-body limit so the app and platform agree.
export const MAX_BYTES = Math.floor(4.5 * 1024 * 1024);

// Whole-request cap (artifact content + JSON envelope: visibility, password, allowlist…).
// A little headroom over MAX_BYTES so a max-size artifact isn't rejected by the envelope.
export const REQUEST_MAX_BYTES = MAX_BYTES + 256 * 1024;

export type SizeResult = { ok: true } | { ok: false; error: string };

export function validateSize(content: string): SizeResult {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_BYTES) {
    return { ok: false, error: `Content exceeds 4.5MB limit (${bytes} bytes)` };
  }
  return { ok: true };
}
