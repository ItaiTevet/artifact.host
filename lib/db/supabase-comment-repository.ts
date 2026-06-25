import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import { serializeAnchor, parseAnchor } from '@/lib/artifacts/comment-types';

interface Row {
  id: string; artifact_slug: string; author_id: string; author_email: string | null;
  body: string; anchor: string; resolved: boolean; created_at: string;
}

function toRecord(r: Row): CommentRecord {
  return {
    id: r.id, artifactSlug: r.artifact_slug, authorId: r.author_id, authorEmail: r.author_email,
    body: r.body, anchor: parseAnchor(r.anchor), resolved: !!r.resolved, createdAt: new Date(r.created_at),
  };
}

export class SupabaseCommentRepository implements CommentRepository {
  constructor(private db: SupabaseClient) {}

  async insert(rec: NewComment): Promise<CommentRecord> {
    const { data, error } = await this.db.from('comments').insert({
      artifact_slug: rec.artifactSlug, author_id: rec.authorId, author_email: rec.authorEmail,
      body: rec.body, anchor: serializeAnchor(rec.anchor),
    }).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async listBySlug(slug: string): Promise<CommentRecord[]> {
    const { data, error } = await this.db.from('comments')
      .select().eq('artifact_slug', slug).order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => toRecord(r as Row));
  }

  async findById(id: string): Promise<CommentRecord | null> {
    const { data, error } = await this.db.from('comments').select().eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toRecord(data as Row) : null;
  }

  async updateBody(id: string, body: string): Promise<CommentRecord> {
    const { data, error } = await this.db.from('comments').update({ body }).eq('id', id).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentRecord> {
    const { data, error } = await this.db.from('comments').update({ resolved }).eq('id', id).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async deleteById(id: string): Promise<boolean> {
    const { data, error } = await this.db.from('comments').delete().eq('id', id).select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async deleteBySlug(slug: string): Promise<number> {
    const { data, error } = await this.db.from('comments').delete().eq('artifact_slug', slug).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }
}
