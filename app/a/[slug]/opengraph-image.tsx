import { ImageResponse } from 'next/og';
import { publicOgInfo } from '@/lib/artifacts/og-meta';

export const runtime = 'nodejs';
export const alt = 'artifact.host';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Only public artifacts expose their real title; everything else gets the
  // generic brand card so private titles never leak (see publicOgInfo).
  const og = await publicOgInfo(slug);
  const heading = og?.title ?? 'Shared on artifact.host';

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: '#fefdfb', padding: 80,
      }}>
        <div style={{ display: 'flex', fontSize: 30, color: '#a09890' }}>
          artifact<span style={{ color: '#0e0c09' }}>.host</span>
        </div>
        <div style={{ display: 'flex', fontSize: 64, color: '#0e0c09', lineHeight: 1.1, maxWidth: 1040 }}>
          {heading}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', height: 8, width: 120, background: '#b36b20' }} />
          <div style={{ display: 'flex', fontSize: 24, color: '#a09890' }}>Live HTML artifact</div>
        </div>
      </div>
    ),
    size,
  );
}
