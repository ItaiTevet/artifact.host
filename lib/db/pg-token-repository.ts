import type { Pool } from 'pg';
import type {
  NewToken, TokenRecord, TokenRepository, TokenSummary,
} from '@/lib/auth/token-repository';

interface Row {
  id: string; owner_id: string; name: string; token_hash: string;
  created_at: Date; last_used_at: Date | null; expires_at: Date | null;
}

function toRecord(r: Row): TokenRecord {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name,
    createdAt: new Date(r.created_at),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
  };
}

export class PgTokenRepository implements TokenRepository {
  constructor(private pool: Pool) {}

  async create(rec: NewToken): Promise<TokenRecord> {
    const { rows } = await this.pool.query<Row>(
      `insert into api_tokens (owner_id, name, token_hash, expires_at)
       values ($1,$2,$3,$4) returning *`,
      [rec.ownerId, rec.name, rec.tokenHash, rec.expiresAt],
    );
    return toRecord(rows[0]);
  }

  async resolveOwner(tokenHash: string, now: Date): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string; owner_id: string; expires_at: Date | null }>(
      'select id, owner_id, expires_at from api_tokens where token_hash = $1', [tokenHash],
    );
    const r = rows[0];
    if (!r) return null;
    if (r.expires_at && new Date(r.expires_at) <= now) return null;
    // Best-effort recency stamp; never block auth on it.
    void this.pool.query('update api_tokens set last_used_at = $2 where id = $1', [r.id, now])
      .catch(() => {});
    return r.owner_id;
  }

  async listByOwner(ownerId: string): Promise<TokenSummary[]> {
    const { rows } = await this.pool.query<Row>(
      'select * from api_tokens where owner_id = $1 order by created_at desc', [ownerId],
    );
    return rows.map((r) => ({
      id: r.id, name: r.name, createdAt: new Date(r.created_at),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
      expiresAt: r.expires_at ? new Date(r.expires_at) : null,
    }));
  }

  async revoke(id: string, ownerId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from api_tokens where id = $1 and owner_id = $2', [id, ownerId],
    );
    return (rowCount ?? 0) > 0;
  }
}
