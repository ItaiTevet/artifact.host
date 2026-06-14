import { randomUUID } from 'node:crypto';
import type {
  NewToken, TokenRecord, TokenRepository, TokenSummary,
} from '@/lib/auth/token-repository';

export class InMemoryTokenRepository implements TokenRepository {
  private rows = new Map<string, TokenRecord>();

  async create(rec: NewToken): Promise<TokenRecord> {
    const row: TokenRecord = {
      id: randomUUID(), ownerId: rec.ownerId, name: rec.name,
      createdAt: new Date(), lastUsedAt: null, expiresAt: rec.expiresAt,
    };
    // token_hash uniqueness mirrors the DB constraint.
    if ([...this.rows.values()].some((r) => r.id === row.id)) throw new Error('dup');
    this.rows.set(rec.tokenHash, row);
    return row;
  }

  async resolveOwner(tokenHash: string, now: Date): Promise<string | null> {
    const row = this.rows.get(tokenHash);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt <= now) return null;
    row.lastUsedAt = now;
    return row.ownerId;
  }

  async listByOwner(ownerId: string): Promise<TokenSummary[]> {
    return [...this.rows.values()]
      .filter((r) => r.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        id: r.id, name: r.name, createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt, expiresAt: r.expiresAt,
      }));
  }

  async revoke(id: string, ownerId: string): Promise<boolean> {
    for (const [hash, row] of this.rows) {
      if (row.id === id && row.ownerId === ownerId) { this.rows.delete(hash); return true; }
    }
    return false;
  }
}
