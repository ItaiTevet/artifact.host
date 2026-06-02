import { ImageResponse } from 'next/og';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';

export const runtime = 'nodejs';
export const alt = 'artifact.host';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function titleFor(slug: string): Promise<string | null> {
  try {
    const repo = new SupabaseArtifactRepository(getServiceClient());
    const rec = await repo.findBySlug(slug);
    if (!rec || rec.expiresAt <= new Date()) return null;
    return rec.title ?? null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = await titleFor(slug);
  const heading = title ?? 'Shared on artifact.host';

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: '#fefdfb', padding: 80,
      }}>
        <div style={{ display: 'flex', fontSize: 30, color: '#a09890' }}>
          artifact<span style={{ color: '#0e0c09' }}>.host</span>
        </div>
        <div style={{ display: 'flex', fontSize: 64, color: '#0e0c09', lineHeight: 1.1, maxWidth: 1000 }}>
          {heading}
        </div>
        <div style={{ display: 'flex', height: 8, width: 120, background: '#b36b20' }} />
      </div>
    ),
    size,
  );
}
