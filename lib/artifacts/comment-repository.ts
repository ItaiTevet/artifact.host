import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';

export interface CommentRepository {
  insert(rec: NewComment): Promise<CommentRecord>;
  listBySlug(slug: string): Promise<CommentRecord[]>;     // oldest-first
  findById(id: string): Promise<CommentRecord | null>;
  updateBody(id: string, body: string): Promise<CommentRecord>;
  setResolved(id: string, resolved: boolean): Promise<CommentRecord>;
  deleteById(id: string): Promise<boolean>;
  deleteBySlug(slug: string): Promise<number>;
}
