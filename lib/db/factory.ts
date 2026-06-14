import type { ArtifactRepository } from '@/lib/artifacts/repository';
import type { TokenRepository } from '@/lib/auth/token-repository';
import type { UserRepository } from '@/lib/auth/user-repository';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { SupabaseTokenRepository } from '@/lib/db/token-repository';

/** 'supabase' (cloud, default) or 'sqlite' (self-host). */
function isSqlite(): boolean {
  return (process.env.DB_DRIVER ?? 'supabase') === 'sqlite';
}

let artifactRepo: ArtifactRepository | null = null;
let tokenRepo: TokenRepository | null = null;

// The SQLite modules (and the native better-sqlite3 addon) are imported lazily and only
// when selected, so the Supabase/cloud deployment never loads the native binary.
export async function getArtifactRepository(): Promise<ArtifactRepository> {
  if (artifactRepo) return artifactRepo;
  if (isSqlite()) {
    const { getSqliteDb } = await import('./sqlite');
    const { SqliteArtifactRepository } = await import('./sqlite-artifact-repository');
    artifactRepo = new SqliteArtifactRepository(getSqliteDb());
  } else {
    artifactRepo = new SupabaseArtifactRepository(getServiceClient());
  }
  return artifactRepo;
}

export async function getTokenRepository(): Promise<TokenRepository> {
  if (tokenRepo) return tokenRepo;
  if (isSqlite()) {
    const { getSqliteDb } = await import('./sqlite');
    const { SqliteTokenRepository } = await import('./sqlite-token-repository');
    tokenRepo = new SqliteTokenRepository(getSqliteDb());
  } else {
    tokenRepo = new SupabaseTokenRepository(getServiceClient());
  }
  return tokenRepo;
}

let userRepo: UserRepository | null = null;

/** Local username/password accounts — only available on a SQL driver (self-host). */
export async function getUserRepository(): Promise<UserRepository> {
  if (userRepo) return userRepo;
  if (isSqlite()) {
    const { getSqliteDb } = await import('./sqlite');
    const { SqliteUserRepository } = await import('./sqlite-user-repository');
    userRepo = new SqliteUserRepository(getSqliteDb());
    return userRepo;
  }
  throw new Error('Local user accounts require DB_DRIVER=sqlite (or another SQL driver)');
}
