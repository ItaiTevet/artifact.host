import type { Pool } from 'pg';
import type { ArtifactRecord, ArtifactSummary, Visibility } from '@/lib/artifacts/types';
import type { ArtifactRepository, NewArtifact } from '@/lib/artifacts/repository';

interface Row {
  id: string; slug: string; content: string; title: string | null;
  visibility: string; password_hash: string | null; owner_id: string | null;
  edit_token_hash: string; deploy_ip_hash: string | null;
  created_at: Date; expires_at: Date; view_count: string; // bigint comes back as string
}

function toRecord(r: Row): ArtifactRecord {
  return {
    id: r.id, slug: r.slug, content: r.content, title: r.title,
    visibility: r.visibility as Visibility, passwordHash: r.password_hash,
    ownerId: r.owner_id, editTokenHash: r.edit_token_hash, deployIpHash: r.deploy_ip_hash,
    createdAt: new Date(r.created_at), expiresAt: new Date(r.expires_at), viewCount: Number(r.view_count),
  };
}

export class PgArtifactRepository implements ArtifactRepository {
  constructor(private pool: Pool) {}

  async insert(rec: NewArtifact): Promise<ArtifactRecord> {
    const { rows } = await this.pool.query<Row>(
      `insert into artifacts (slug, content, title, visibility, password_hash, owner_id,
         edit_token_hash, deploy_ip_hash, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [rec.slug, rec.content, rec.title, rec.visibility, rec.passwordHash, rec.ownerId,
        rec.editTokenHash, rec.deployIpHash, rec.expiresAt],
    );
    return toRecord(rows[0]);
  }

  async findBySlug(slug: string): Promise<ArtifactRecord | null> {
    const { rows } = await this.pool.query<Row>('select * from artifacts where slug = $1', [slug]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('select 1 from artifacts where slug = $1', [slug]);
    return (rowCount ?? 0) > 0;
  }

  async updateContent(slug: string, content: string, title: string | null): Promise<ArtifactRecord> {
    const { rows } = await this.pool.query<Row>(
      'update artifacts set content = $2, title = $3 where slug = $1 returning *', [slug, content, title],
    );
    return toRecord(rows[0]);
  }

  async updateVisibility(slug: string, visibility: Visibility, passwordHash: string | null): Promise<ArtifactRecord> {
    const { rows } = await this.pool.query<Row>(
      'update artifacts set visibility = $2, password_hash = $3 where slug = $1 returning *',
      [slug, visibility, passwordHash],
    );
    return toRecord(rows[0]);
  }

  async incrementViews(slug: string): Promise<void> {
    await this.pool.query('update artifacts set view_count = view_count + 1 where slug = $1', [slug]);
  }

  async listByOwner(ownerId: string, now: Date): Promise<ArtifactSummary[]> {
    const { rows } = await this.pool.query<Row>(
      'select * from artifacts where owner_id = $1 and expires_at > $2 order by created_at desc', [ownerId, now],
    );
    return rows.map((r) => ({
      slug: r.slug, title: r.title, visibility: r.visibility as Visibility,
      createdAt: new Date(r.created_at), expiresAt: new Date(r.expires_at), viewCount: Number(r.view_count),
    }));
  }

  async deleteOwned(slug: string, ownerId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from artifacts where slug = $1 and owner_id = $2', [slug, ownerId],
    );
    return (rowCount ?? 0) > 0;
  }

  async countLiveByOwner(ownerId: string, now: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      'select count(*) as n from artifacts where owner_id = $1 and expires_at > $2', [ownerId, now],
    );
    return Number(rows[0].n);
  }

  async countLiveByIp(ipHash: string, now: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      'select count(*) as n from artifacts where deploy_ip_hash = $1 and owner_id is null and expires_at > $2',
      [ipHash, now],
    );
    return Number(rows[0].n);
  }

  async countRecentDeploysByIp(ipHash: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      'select count(*) as n from artifacts where deploy_ip_hash = $1 and created_at > $2', [ipHash, since],
    );
    return Number(rows[0].n);
  }

  async deleteExpired(now: Date): Promise<number> {
    const { rowCount } = await this.pool.query('delete from artifacts where expires_at < $1', [now]);
    return rowCount ?? 0;
  }
}
