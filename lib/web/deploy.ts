export type Ttl = '1h' | '1d' | '7d' | '30d';
export type Visibility = 'public' | 'password' | 'restricted';

export interface DeployFormState {
  content: string;
  ttl: Ttl;
  visibility: Visibility;
  password: string;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateDeployInput(s: Pick<DeployFormState, 'content' | 'visibility' | 'password'>): ValidationResult {
  if (!s.content.trim()) return { ok: false, error: 'Paste some HTML first.' };
  if (s.visibility === 'password' && !s.password) return { ok: false, error: 'Enter a password, or switch to public.' };
  return { ok: true };
}

export interface DeployPayload {
  content: string;
  ttl: Ttl;
  visibility: Visibility;
  password?: string;
}

export function buildDeployPayload(s: DeployFormState): DeployPayload {
  const payload: DeployPayload = { content: s.content, ttl: s.ttl, visibility: s.visibility };
  if (s.visibility === 'password' && s.password) payload.password = s.password;
  return payload;
}
