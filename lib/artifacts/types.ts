export type Visibility = 'public' | 'password';
export type Ttl = '1h' | '1d' | '7d' | '30d';

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
