import { MAX_BYTES } from '@/lib/artifacts/validate';

export type UploadFileMeta = { name: string; size: number; type: string };
export type UploadValidation = { ok: true } | { ok: false; error: string };

const HTML_EXT = /\.html?$/i;

/** Pure, DOM-free validation for a dropped/browsed file before we read it.
 *  Accepts HTML by extension (.html/.htm) or MIME (text/html); enforces the byte cap. */
export function validateUploadFile(file: UploadFileMeta): UploadValidation {
  const isHtml = HTML_EXT.test(file.name) || file.type === 'text/html';
  if (!isHtml) return { ok: false, error: "That doesn’t look like an HTML file." };
  if (file.size > MAX_BYTES) return { ok: false, error: 'That file is too large (4.5 MB max).' };
  return { ok: true };
}
