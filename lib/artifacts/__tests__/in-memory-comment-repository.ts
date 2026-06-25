import { randomUUID } from 'node:crypto';
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';

export class InMemoryCommentRepository implements CommentRepository {
  private rows: CommentRecord[] = [];
  private seq = 0;

  async insert(rec: NewComment): Promise<CommentRecord> {
    // monotonic createdAt so oldest-first ordering is deterministic in tests
    const row: CommentRecord = {
      id: randomUUID(), ...rec, resolved: false, createdAt: new Date(Date.now() + this.seq++),
    };
    this.rows.push(row);
    return row;
  }

  async listBySlug(slug: string): Promise<CommentRecord[]> {
    return this.rows.filter((c) => c.artifactSlug === slug)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findById(id: string): Promise<CommentRecord | null> {
    return this.rows.find((c) => c.id === id) ?? null;
  }

  async updateBody(id: string, body: string): Promise<CommentRecord> {
    const row = this.rows.find((c) => c.id === id);
    if (!row) throw new Error('not found');
    row.body = body;
    return row;
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentRecord> {
    const row = this.rows.find((c) => c.id === id);
    if (!row) throw new Error('not found');
    row.resolved = resolved;
    return row;
  }

  async deleteById(id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((c) => c.id !== id);
    return this.rows.length < before;
  }

  async deleteBySlug(slug: string): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((c) => c.artifactSlug !== slug);
    return before - this.rows.length;
  }
}
