import type { ArtifactRecord, ArtifactSummary, Visibility } from '@/lib/artifacts/types';

export interface NewArtifact {
  slug: string;
  content: string;
  title: string | null;
  visibility: Visibility;
  passwordHash: string | null;
  ownerId: string | null;
  editTokenHash: string;
  deployIpHash: string | null;
  expiresAt: Date;
}

export interface ArtifactRepository {
  insert(rec: NewArtifact): Promise<ArtifactRecord>;
  findBySlug(slug: string): Promise<ArtifactRecord | null>;
  slugExists(slug: string): Promise<boolean>;
  updateContent(slug: string, content: string, title: string | null): Promise<ArtifactRecord>;
  updateVisibility(slug: string, visibility: Visibility, passwordHash: string | null): Promise<ArtifactRecord>;
  incrementViews(slug: string): Promise<void>;
  listByOwner(ownerId: string, now: Date): Promise<ArtifactSummary[]>;
  deleteOwned(slug: string, ownerId: string): Promise<boolean>;
  countLiveByOwner(ownerId: string, now: Date): Promise<number>;
  countLiveByIp(ipHash: string, now: Date): Promise<number>;
  countRecentDeploysByIp(ipHash: string, since: Date): Promise<number>;
  deleteExpired(now: Date): Promise<number>;
}
