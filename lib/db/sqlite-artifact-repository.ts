import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ArtifactRecord, ArtifactSummary, SharePrincipal, Visibility } from '@/lib/artifacts/types';
import type { ArtifactRepository, NewArtifact } from '@/lib/artifacts/repository';
import { deserializeAllowlist, serializeAllowlist } from '@/lib/artifacts/sharing';

interface Row {
  id: string; slug: string; content: string; title: string | null;
  visibility: string; password_hash: string | null; owner_id: string | null;
  edit_token_hash: string; deploy_ip: string | null; share_allowlist: string | null;
  created_at: string; expires_at: string; view_count: number; comments_enabled: number;
}

function toRecord(r: Row): ArtifactRecord {
  return {
    id: r.id, slug: r.slug, content: r.content, title: r.title,
    visibility: r.visibility as Visibility, passwordHash: r.password_hash,
    ownerId: r.owner_id, editTokenHash: r.edit_token_hash, deployIp: r.deploy_ip,
    shareAllowlist: deserializeAllowlist(r.share_allowlist),
    commentsEnabled: r.comments_enabled === 1,
    createdAt: new Date(r.created_at), expiresAt: new Date(r.expires_at), viewCount: Number(r.view_count),
  };
}

export class SqliteArtifactRepository implements ArtifactRepository {
  constructor(private db: Database.Database) {}

  async insert(rec: NewArtifact): Promise<ArtifactRecord> {
    const row: Row = {
      id: randomUUID(), slug: rec.slug, content: rec.content, title: rec.title,
      visibility: rec.visibility, password_hash: rec.passwordHash, owner_id: rec.ownerId,
      edit_token_hash: rec.editTokenHash, deploy_ip: rec.deployIp, share_allowlist: null,
      created_at: new Date().toISOString(), expires_at: rec.expiresAt.toISOString(), view_count: 0,
      // Satisfies the Row type; the insert SQL below omits this column, so the schema default (0) applies.
      comments_enabled: 0,
    };
    this.db.prepare(
      `insert into artifacts (id, slug, content, title, visibility, password_hash, owner_id,
        edit_token_hash, deploy_ip, share_allowlist, created_at, expires_at, view_count)
       values (@id, @slug, @content, @title, @visibility, @password_hash, @owner_id,
        @edit_token_hash, @deploy_ip, @share_allowlist, @created_at, @expires_at, @view_count)`,
    ).run(row);
    return toRecord(row);
  }

  async findBySlug(slug: string): Promise<ArtifactRecord | null> {
    const r = this.db.prepare('select * from artifacts where slug = ?').get(slug) as Row | undefined;
    return r ? toRecord(r) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const r = this.db.prepare('select 1 from artifacts where slug = ?').get(slug);
    return !!r;
  }

  async updateContent(slug: string, content: string, title: string | null): Promise<ArtifactRecord> {
    this.db.prepare('update artifacts set content = ?, title = ? where slug = ?').run(content, title, slug);
    return (await this.findBySlug(slug))!;
  }

  async updateVisibility(
    slug: string, visibility: Visibility, passwordHash: string | null, shareAllowlist: SharePrincipal[],
  ): Promise<ArtifactRecord> {
    this.db.prepare('update artifacts set visibility = ?, password_hash = ?, share_allowlist = ? where slug = ?')
      .run(visibility, passwordHash, serializeAllowlist(shareAllowlist), slug);
    return (await this.findBySlug(slug))!;
  }

  async setCommentsEnabled(slug: string, enabled: boolean): Promise<ArtifactRecord> {
    this.db.prepare('update artifacts set comments_enabled = ? where slug = ?').run(enabled ? 1 : 0, slug);
    return (await this.findBySlug(slug))!;
  }

  async incrementViews(slug: string): Promise<void> {
    this.db.prepare('update artifacts set view_count = view_count + 1 where slug = ?').run(slug);
  }

  async listByOwner(ownerId: string, now: Date): Promise<ArtifactSummary[]> {
    const rows = this.db.prepare(
      'select * from artifacts where owner_id = ? and expires_at > ? order by created_at desc',
    ).all(ownerId, now.toISOString()) as Row[];
    return rows.map((r) => ({
      slug: r.slug, title: r.title, visibility: r.visibility as Visibility,
      createdAt: new Date(r.created_at), expiresAt: new Date(r.expires_at), viewCount: Number(r.view_count),
    }));
  }

  async deleteOwned(slug: string, ownerId: string): Promise<boolean> {
    const info = this.db.prepare('delete from artifacts where slug = ? and owner_id = ?').run(slug, ownerId);
    return info.changes > 0;
  }

  async countLiveByOwner(ownerId: string, now: Date): Promise<number> {
    const r = this.db.prepare('select count(*) as n from artifacts where owner_id = ? and expires_at > ?')
      .get(ownerId, now.toISOString()) as { n: number };
    return Number(r.n);
  }

  async countLiveByIp(ip: string, now: Date): Promise<number> {
    const r = this.db.prepare(
      'select count(*) as n from artifacts where deploy_ip = ? and owner_id is null and expires_at > ?',
    ).get(ip, now.toISOString()) as { n: number };
    return Number(r.n);
  }

  async countRecentDeploysByIp(ip: string, since: Date): Promise<number> {
    const r = this.db.prepare('select count(*) as n from artifacts where deploy_ip = ? and created_at > ?')
      .get(ip, since.toISOString()) as { n: number };
    return Number(r.n);
  }

  async deleteExpired(now: Date): Promise<number> {
    const info = this.db.prepare('delete from artifacts where expires_at < ?').run(now.toISOString());
    return info.changes;
  }
}
