import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import { serializeAnchor, parseAnchor } from '@/lib/artifacts/comment-types';

interface Row {
  id: string; artifact_slug: string; author_id: string; author_email: string | null;
  body: string; anchor: string; resolved: number; created_at: string;
}

function toRecord(r: Row): CommentRecord {
  return {
    id: r.id, artifactSlug: r.artifact_slug, authorId: r.author_id, authorEmail: r.author_email,
    body: r.body, anchor: parseAnchor(r.anchor), resolved: r.resolved === 1, createdAt: new Date(r.created_at),
  };
}

export class SqliteCommentRepository implements CommentRepository {
  constructor(private db: Database.Database) {}

  async insert(rec: NewComment): Promise<CommentRecord> {
    const row: Row = {
      id: randomUUID(), artifact_slug: rec.artifactSlug, author_id: rec.authorId,
      author_email: rec.authorEmail, body: rec.body, anchor: serializeAnchor(rec.anchor),
      resolved: 0, created_at: new Date().toISOString(),
    };
    this.db.prepare(
      `insert into comments (id, artifact_slug, author_id, author_email, body, anchor, resolved, created_at)
       values (@id, @artifact_slug, @author_id, @author_email, @body, @anchor, @resolved, @created_at)`,
    ).run(row);
    return toRecord(row);
  }

  async listBySlug(slug: string): Promise<CommentRecord[]> {
    const rows = this.db.prepare('select * from comments where artifact_slug = ? order by created_at asc').all(slug) as Row[];
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<CommentRecord | null> {
    const r = this.db.prepare('select * from comments where id = ?').get(id) as Row | undefined;
    return r ? toRecord(r) : null;
  }

  async updateBody(id: string, body: string): Promise<CommentRecord> {
    this.db.prepare('update comments set body = ? where id = ?').run(body, id);
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Comment not found: ${id}`);
    return updated;
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentRecord> {
    this.db.prepare('update comments set resolved = ? where id = ?').run(resolved ? 1 : 0, id);
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Comment not found: ${id}`);
    return updated;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.db.prepare('delete from comments where id = ?').run(id).changes > 0;
  }

  async deleteBySlug(slug: string): Promise<number> {
    return this.db.prepare('delete from comments where artifact_slug = ?').run(slug).changes;
  }
}
