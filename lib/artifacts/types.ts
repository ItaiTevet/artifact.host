export type Visibility = 'public' | 'password' | 'restricted';
export type Ttl = '1h' | '1d' | '7d' | '30d';

/** A principal on a 'restricted' artifact's allowlist: a specific email or a whole domain. */
export interface SharePrincipal {
  value: string;            // 'alice@intezer.com' or 'intezer.com'
  type: 'email' | 'domain';
  role: 'view' | 'comment'; // 'view' = read-only; 'comment' = may also post comments
}

export interface ArtifactRecord {
  id: string;
  slug: string;
  content: string;
  title: string | null;
  visibility: Visibility;
  passwordHash: string | null;
  ownerId: string | null;
  editTokenHash: string;
  deployIpHash: string | null;
  shareAllowlist: SharePrincipal[];  // only meaningful when visibility === 'restricted'
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
}

/** Lightweight projection for the dashboard list (no content blob). */
export interface ArtifactSummary {
  slug: string;
  title: string | null;
  visibility: Visibility;
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
}

/** Caller auth presented on update/visibility changes. */
export interface AuthContext {
  ownerId?: string | null;
  editToken?: string | null;
}
