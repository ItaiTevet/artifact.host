import type { Visibility } from '@/lib/web/deploy';

export const MAX_CONTENT_BYTES = 5 * 1024 * 1024; // 5 MB, mirrors the server cap

/** One row of the dashboard list, as returned by GET /api/artifacts. */
export interface ArtifactListItem {
  slug: string;
  title: string | null;
  visibility: Visibility;
  created_at: string;
  expires_at: string;
  view_count: number;
}

export type EditValidation = { ok: true } | { ok: false; error: string };

export function validateEditInput(s: { content: string; visibility: Visibility; password: string }): EditValidation {
  if (!s.content.trim()) return { ok: false, error: 'The artifact can’t be empty.' };
  if (s.visibility === 'password' && !s.password) return { ok: false, error: 'Enter a password, or switch to public.' };
  if (new TextEncoder().encode(s.content).length > MAX_CONTENT_BYTES) {
    return { ok: false, error: 'That’s over the 5 MB limit.' };
  }
  return { ok: true };
}

const MESSAGES: Record<string, string> = {
  too_large: 'That’s over the 5 MB limit.',
  forbidden: 'This artifact isn’t yours.',
  not_found: 'This artifact is gone or has expired.',
  unauthorized: 'Please sign in again.',
  password_required: 'Enter a password, or switch to public.',
  invalid_visibility: 'Pick a valid visibility.',
};

export function editErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || 'Something went wrong — try again.';
}
