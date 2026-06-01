import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArtifactRecord, Visibility } from '@/lib/artifacts/types';
import type { ArtifactRepository, NewArtifact } from '@/lib/artifacts/repository';

interface Row {
  id: string; slug: string; content: string; title: string | null;
  visibility: Visibility; password_hash: string | null;
  owner_id: string | null; edit_token_hash: string; deploy_ip_hash: string | null;
  created_at: string; expires_at: string; view_count: number;
}

function toRecord(r: Row): ArtifactRecord {
  return {
    id: r.id, slug: r.slug, content: r.content, title: r.title,
    visibility: r.visibility, passwordHash: r.password_hash,
    ownerId: r.owner_id, editTokenHash: r.edit_token_hash, deployIpHash: r.deploy_ip_hash,
    createdAt: new Date(r.created_at), expiresAt: new Date(r.expires_at), viewCount: Number(r.view_count),
  };
}

export class SupabaseArtifactRepository implements ArtifactRepository {
  constructor(private db: SupabaseClient) {}

  async insert(rec: NewArtifact): Promise<ArtifactRecord> {
    const { data, error } = await this.db.from('artifacts').insert({
      slug: rec.slug, content: rec.content, title: rec.title,
      visibility: rec.visibility, password_hash: rec.passwordHash,
      owner_id: rec.ownerId, edit_token_hash: rec.editTokenHash,
      deploy_ip_hash: rec.deployIpHash, expires_at: rec.expiresAt.toISOString(),
    }).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async findBySlug(slug: string): Promise<ArtifactRecord | null> {
    const { data, error } = await this.db.from('artifacts').select().eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data ? toRecord(data as Row) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const { count, error } = await this.db.from('artifacts')
      .select('slug', { count: 'exact', head: true }).eq('slug', slug);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async updateContent(slug: string, content: string, title: string | null): Promise<ArtifactRecord> {
    const { data, error } = await this.db.from('artifacts')
      .update({ content, title }).eq('slug', slug).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async updateVisibility(slug: string, visibility: Visibility, passwordHash: string | null): Promise<ArtifactRecord> {
    const { data, error } = await this.db.from('artifacts')
      .update({ visibility, password_hash: passwordHash }).eq('slug', slug).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async incrementViews(slug: string): Promise<void> {
    const { error } = await this.db.rpc('increment_view_count', { p_slug: slug });
    if (error) throw error;
  }

  async countLiveByOwner(ownerId: string, now: Date): Promise<number> {
    const { count, error } = await this.db.from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId).gt('expires_at', now.toISOString());
    if (error) throw error;
    return count ?? 0;
  }

  async countLiveByIp(ipHash: string, now: Date): Promise<number> {
    const { count, error } = await this.db.from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('deploy_ip_hash', ipHash).is('owner_id', null).gt('expires_at', now.toISOString());
    if (error) throw error;
    return count ?? 0;
  }

  async countRecentDeploysByIp(ipHash: string, since: Date): Promise<number> {
    const { count, error } = await this.db.from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('deploy_ip_hash', ipHash).gt('created_at', since.toISOString());
    if (error) throw error;
    return count ?? 0;
  }

  async deleteExpired(now: Date): Promise<number> {
    const { data, error } = await this.db.from('artifacts')
      .delete().lt('expires_at', now.toISOString()).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }
}
