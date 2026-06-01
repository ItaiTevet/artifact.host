import { randomUUID } from 'node:crypto';
import type { ArtifactRecord, Visibility } from '@/lib/artifacts/types';
import type { ArtifactRepository, NewArtifact } from '@/lib/artifacts/repository';

export class InMemoryRepository implements ArtifactRepository {
  private rows = new Map<string, ArtifactRecord>();
  /** Deploy timestamps per ipHash, for rate-limit tests. */
  deployLog: { ipHash: string; at: Date }[] = [];

  async insert(rec: NewArtifact): Promise<ArtifactRecord> {
    const row: ArtifactRecord = {
      id: randomUUID(),
      createdAt: new Date(),
      viewCount: 0,
      ...rec,
    };
    this.rows.set(rec.slug, row);
    if (rec.deployIpHash) this.deployLog.push({ ipHash: rec.deployIpHash, at: row.createdAt });
    return row;
  }

  async findBySlug(slug: string): Promise<ArtifactRecord | null> {
    return this.rows.get(slug) ?? null;
  }

  async slugExists(slug: string): Promise<boolean> {
    return this.rows.has(slug);
  }

  async updateContent(slug: string, content: string, title: string | null): Promise<ArtifactRecord> {
    const row = this.rows.get(slug);
    if (!row) throw new Error('not found');
    row.content = content;
    row.title = title;
    return row;
  }

  async updateVisibility(slug: string, visibility: Visibility, passwordHash: string | null): Promise<ArtifactRecord> {
    const row = this.rows.get(slug);
    if (!row) throw new Error('not found');
    row.visibility = visibility;
    row.passwordHash = passwordHash;
    return row;
  }

  async incrementViews(slug: string): Promise<void> {
    const row = this.rows.get(slug);
    if (row) row.viewCount += 1;
  }

  async countLiveByOwner(ownerId: string, now: Date): Promise<number> {
    return [...this.rows.values()].filter(r => r.ownerId === ownerId && r.expiresAt > now).length;
  }

  async countLiveByIp(ipHash: string, now: Date): Promise<number> {
    return [...this.rows.values()].filter(r => r.deployIpHash === ipHash && r.ownerId === null && r.expiresAt > now).length;
  }

  async countRecentDeploysByIp(ipHash: string, since: Date): Promise<number> {
    return this.deployLog.filter(d => d.ipHash === ipHash && d.at >= since).length;
  }

  async deleteExpired(now: Date): Promise<number> {
    let n = 0;
    for (const [slug, row] of this.rows) {
      if (row.expiresAt <= now) { this.rows.delete(slug); n++; }
    }
    return n;
  }
}
