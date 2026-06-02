import type { PlatformId } from '@/lib/web/connect';

const GLYPH: Record<PlatformId, string> = {
  claude: 'C', openai: 'G', cursor: '⌘', vscode: 'V', windsurf: 'W',
};

export function PlatformIcon({ id }: { id: PlatformId }) {
  return (
    <span aria-hidden style={{
      width: 36, height: 36, borderRadius: 8, background: '#fff',
      border: '1px solid var(--rule)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'var(--serif)', fontStyle: 'italic',
      fontSize: 17, color: 'var(--ink)',
    }}>{GLYPH[id]}</span>
  );
}
