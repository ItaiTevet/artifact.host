import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'artifact.host — Share what your AI built';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Static branded card used for the homepage and any route without its own
// opengraph-image (artifact pages override this with their per-title card).
export default function Image() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: '#fefdfb', padding: 80,
      }}>
        <div style={{ display: 'flex', fontSize: 30, color: '#a09890' }}>
          artifact<span style={{ color: '#0e0c09' }}>.host</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 72, color: '#0e0c09', lineHeight: 1.05 }}>
            Share what your AI built.
          </div>
          <div style={{ display: 'flex', fontSize: 29, color: '#5a5449', maxWidth: 900 }}>
            One tool call from your agent. Renders live at a short URL.
          </div>
        </div>
        <div style={{ display: 'flex', height: 8, width: 120, background: '#b36b20' }} />
      </div>
    ),
    size,
  );
}
