import type { ArtifactRepository } from '@/lib/artifacts/repository';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import type { TokenRepository } from '@/lib/auth/token-repository';
import type { UserRepository } from '@/lib/auth/user-repository';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { SupabaseTokenRepository } from '@/lib/db/token-repository';

type Driver = 'supabase' | 'sqlite' | 'postgres';

/** 'supabase' (cloud, default), or 'sqlite' / 'postgres' (self-host). */
function driver(): Driver {
  return (process.env.DB_DRIVER as Driver) ?? 'supabase';
}

let artifactRepo: ArtifactRepository | null = null;
let commentRepo: CommentRepository | null = null;
let tokenRepo: TokenRepository | null = null;
let userRepo: UserRepository | null = null;

// SQL driver modules (and the native better-sqlite3 / pg deps) are imported lazily and only
// when selected, so the Supabase/cloud deployment never loads them.
export async function getArtifactRepository(): Promise<ArtifactRepository> {
  if (artifactRepo) return artifactRepo;
  if (driver() === 'sqlite') {
    const { getSqliteDb } = await import('./sqlite');
    const { SqliteArtifactRepository } = await import('./sqlite-artifact-repository');
    artifactRepo = new SqliteArtifactRepository(getSqliteDb());
  } else if (driver() === 'postgres') {
    const { ensurePgSchema } = await import('./postgres');
    const { PgArtifactRepository } = await import('./pg-artifact-repository');
    artifactRepo = new PgArtifactRepository(await ensurePgSchema());
  } else {
    artifactRepo = new SupabaseArtifactRepository(getServiceClient());
  }
  return artifactRepo;
}

export async function getCommentRepository(): Promise<CommentRepository> {
  if (commentRepo) return commentRepo;
  if (driver() === 'sqlite') {
    const { getSqliteDb } = await import('./sqlite');
    const { SqliteCommentRepository } = await import('./sqlite-comment-repository');
    commentRepo = new SqliteCommentRepository(getSqliteDb());
  } else if (driver() === 'postgres') {
    const { ensurePgSchema } = await import('./postgres');
    const { PgCommentRepository } = await import('./pg-comment-repository');
    commentRepo = new PgCommentRepository(await ensurePgSchema());
  } else {
    const { SupabaseCommentRepository } = await import('./supabase-comment-repository');
    commentRepo = new SupabaseCommentRepository(getServiceClient());
  }
  return commentRepo;
}

export async function getTokenRepository(): Promise<TokenRepository> {
  if (tokenRepo) return tokenRepo;
  if (driver() === 'sqlite') {
    const { getSqliteDb } = await import('./sqlite');
    const { SqliteTokenRepository } = await import('./sqlite-token-repository');
    tokenRepo = new SqliteTokenRepository(getSqliteDb());
  } else if (driver() === 'postgres') {
    const { ensurePgSchema } = await import('./postgres');
    const { PgTokenRepository } = await import('./pg-token-repository');
    tokenRepo = new PgTokenRepository(await ensurePgSchema());
  } else {
    tokenRepo = new SupabaseTokenRepository(getServiceClient());
  }
  return tokenRepo;
}

/** Local username/password accounts — only available on a SQL driver (self-host). */
export async function getUserRepository(): Promise<UserRepository> {
  if (userRepo) return userRepo;
  if (driver() === 'sqlite') {
    const { getSqliteDb } = await import('./sqlite');
    const { SqliteUserRepository } = await import('./sqlite-user-repository');
    userRepo = new SqliteUserRepository(getSqliteDb());
  } else if (driver() === 'postgres') {
    const { ensurePgSchema } = await import('./postgres');
    const { PgUserRepository } = await import('./pg-user-repository');
    userRepo = new PgUserRepository(await ensurePgSchema());
  } else {
    throw new Error('Local user accounts require DB_DRIVER=sqlite or postgres');
  }
  return userRepo;
}
