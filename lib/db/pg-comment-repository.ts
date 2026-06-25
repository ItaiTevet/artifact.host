import type { Pool } from 'pg';
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import { serializeAnchor, parseAnchor } from '@/lib/artifacts/comment-types';

interface Row {
  id: string; artifact_slug: string; author_id: string; author_email: string | null;
  body: string; anchor: string; resolved: boolean; created_at: Date;
}

function toRecord(r: Row): CommentRecord {
  return {
    id: r.id, artifactSlug: r.artifact_slug, authorId: r.author_id, authorEmail: r.author_email,
    body: r.body, anchor: parseAnchor(r.anchor), resolved: !!r.resolved, createdAt: new Date(r.created_at),
  };
}

export class PgCommentRepository implements CommentRepository {
  constructor(private pool: Pool) {}

  async insert(rec: NewComment): Promise<CommentRecord> {
    const { rows } = await this.pool.query<Row>(
      `insert into comments (artifact_slug, author_id, author_email, body, anchor)
       values ($1,$2,$3,$4,$5) returning *`,
      [rec.artifactSlug, rec.authorId, rec.authorEmail, rec.body, serializeAnchor(rec.anchor)],
    );
    return toRecord(rows[0]);
  }

  async listBySlug(slug: string): Promise<CommentRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'select * from comments where artifact_slug = $1 order by created_at asc', [slug],
    );
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<CommentRecord | null> {
    const { rows } = await this.pool.query<Row>('select * from comments where id = $1', [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async updateBody(id: string, body: string): Promise<CommentRecord> {
    const { rows } = await this.pool.query<Row>(
      'update comments set body = $2 where id = $1 returning *', [id, body],
    );
    return toRecord(rows[0]);
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentRecord> {
    const { rows } = await this.pool.query<Row>(
      'update comments set resolved = $2 where id = $1 returning *', [id, resolved],
    );
    return toRecord(rows[0]);
  }

  async deleteById(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from comments where id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  async deleteBySlug(slug: string): Promise<number> {
    const { rowCount } = await this.pool.query('delete from comments where artifact_slug = $1', [slug]);
    return rowCount ?? 0;
  }
}
