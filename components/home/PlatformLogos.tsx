// The platforms shown on the homepage compatibility strip, with the real brand favicons
// (via Google's favicon service) — the same set/source used before the MCP removal.
export const PLATFORMS: { name: string; domain: string }[] = [
  { name: 'Claude', domain: 'claude.ai' },
  { name: 'GPT / Codex', domain: 'openai.com' },
  { name: 'Cursor', domain: 'cursor.com' },
  { name: 'VS Code', domain: 'code.visualstudio.com' },
  { name: 'Windsurf', domain: 'windsurf.com' },
];

export function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}
