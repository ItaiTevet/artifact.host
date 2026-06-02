import { describe, it, expect } from 'vitest';
import { buildConnectSnippets, PLATFORM_IDS } from '@/lib/web/connect';

const URL = 'https://artifact.host/mcp';

describe('buildConnectSnippets', () => {
  it('returns one entry per known platform', () => {
    const snippets = buildConnectSnippets(URL);
    expect(snippets.map((s) => s.id)).toEqual([...PLATFORM_IDS]);
  });
  it('injects the given MCP URL into every snippet', () => {
    for (const s of buildConnectSnippets(URL)) {
      expect(s.code).toContain(URL);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.step.length).toBeGreaterThan(0);
    }
  });
  it('never contains the dropped stdio shim package', () => {
    for (const s of buildConnectSnippets(URL)) {
      expect(s.code).not.toContain('artifact-host-mcp');
    }
  });
});
