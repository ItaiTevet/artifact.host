export const MAX_BYTES = 5 * 1024 * 1024;

export type SizeResult = { ok: true } | { ok: false; error: string };

export function validateSize(content: string): SizeResult {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_BYTES) {
    return { ok: false, error: `Content exceeds 5MB limit (${bytes} bytes)` };
  }
  return { ok: true };
}
