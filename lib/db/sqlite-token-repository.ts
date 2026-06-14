import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  NewToken, TokenRecord, TokenRepository, TokenSummary,
} from '@/lib/auth/token-repository';

interface Row {
  id: string; owner_id: string; name: string; token_hash: string;
  created_at: string; last_used_at: string | null; expires_at: string | null;
}

function toRecord(r: Row): TokenRecord {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name,
    createdAt: new Date(r.created_at),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
  };
}

export class SqliteTokenRepository implements TokenRepository {
  constructor(private db: Database.Database) {}

  async create(rec: NewToken): Promise<TokenRecord> {
    const row: Row = {
      id: randomUUID(), owner_id: rec.ownerId, name: rec.name, token_hash: rec.tokenHash,
      created_at: new Date().toISOString(), last_used_at: null,
      expires_at: rec.expiresAt ? rec.expiresAt.toISOString() : null,
    };
    this.db.prepare(
      `insert into api_tokens (id, owner_id, name, token_hash, created_at, last_used_at, expires_at)
       values (@id, @owner_id, @name, @token_hash, @created_at, @last_used_at, @expires_at)`,
    ).run(row);
    return toRecord(row);
  }

  async resolveOwner(tokenHash: string, now: Date): Promise<string | null> {
    const r = this.db.prepare('select id, owner_id, expires_at from api_tokens where token_hash = ?')
      .get(tokenHash) as { id: string; owner_id: string; expires_at: string | null } | undefined;
    if (!r) return null;
    if (r.expires_at && new Date(r.expires_at) <= now) return null;
    this.db.prepare('update api_tokens set last_used_at = ? where id = ?').run(now.toISOString(), r.id);
    return r.owner_id;
  }

  async listByOwner(ownerId: string): Promise<TokenSummary[]> {
    const rows = this.db.prepare(
      'select * from api_tokens where owner_id = ? order by created_at desc',
    ).all(ownerId) as Row[];
    return rows.map((r) => ({
      id: r.id, name: r.name, createdAt: new Date(r.created_at),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
      expiresAt: r.expires_at ? new Date(r.expires_at) : null,
    }));
  }

  async revoke(id: string, ownerId: string): Promise<boolean> {
    const info = this.db.prepare('delete from api_tokens where id = ? and owner_id = ?').run(id, ownerId);
    return info.changes > 0;
  }
}
