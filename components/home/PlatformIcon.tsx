import type { PlatformId } from '@/lib/web/connect';

/** Real brand favicons, fetched from Google's favicon service (as in the mockup). */
const DOMAIN: Record<PlatformId, string> = {
  claude: 'claude.ai',
  openai: 'openai.com',
  cursor: 'cursor.com',
  vscode: 'code.visualstudio.com',
  windsurf: 'windsurf.com',
};

export function PlatformIcon({ id, name }: { id: PlatformId; name: string }) {
  return (
    <span
      style={{
        width: 36, height: 36, borderRadius: 8, background: '#fff',
        border: '1px solid var(--rule)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${DOMAIN[id]}&sz=64`}
        alt={name}
        width={24}
        height={24}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    </span>
  );
}
