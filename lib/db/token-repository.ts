import type { SupabaseClient } from '@supabase/supabase-js';
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

export class SupabaseTokenRepository implements TokenRepository {
  constructor(private db: SupabaseClient) {}

  async create(rec: NewToken): Promise<TokenRecord> {
    const { data, error } = await this.db.from('api_tokens').insert({
      owner_id: rec.ownerId, name: rec.name, token_hash: rec.tokenHash,
      expires_at: rec.expiresAt ? rec.expiresAt.toISOString() : null,
    }).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async resolveOwner(tokenHash: string, now: Date): Promise<string | null> {
    const { data, error } = await this.db.from('api_tokens')
      .select('id, owner_id, expires_at').eq('token_hash', tokenHash).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const expiresAt = data.expires_at ? new Date(data.expires_at as string) : null;
    if (expiresAt && expiresAt <= now) return null;
    // Best-effort recency stamp; never block auth on this write.
    void this.db.from('api_tokens')
      .update({ last_used_at: now.toISOString() }).eq('id', data.id as string)
      .then(undefined, () => {});
    return data.owner_id as string;
  }

  async listByOwner(ownerId: string): Promise<TokenSummary[]> {
    const { data, error } = await this.db.from('api_tokens')
      .select('id, name, created_at, last_used_at, expires_at')
      .eq('owner_id', ownerId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      createdAt: new Date(r.created_at as string),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at as string) : null,
      expiresAt: r.expires_at ? new Date(r.expires_at as string) : null,
    }));
  }

  async revoke(id: string, ownerId: string): Promise<boolean> {
    const { data, error } = await this.db.from('api_tokens')
      .delete().eq('id', id).eq('owner_id', ownerId).select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }
}
