import { describe, it, expect } from 'vitest';
import { buildConnectSnippets, highlightSnippet, PLATFORM_IDS } from '@/lib/web/connect';

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

describe('highlightSnippet', () => {
  it('marks a whole comment line', () => {
    expect(highlightSnippet('# Claude Code')).toEqual([[{ text: '# Claude Code', kind: 'comment' }]]);
    expect(highlightSnippet('// note')).toEqual([[{ text: '// note', kind: 'comment' }]]);
  });

  it('colors JSON keys (before colon) and string values', () => {
    const [line] = highlightSnippet('    "url": "x"');
    const kinds = line.map((t) => t.kind);
    expect(kinds).toContain('key');
    expect(kinds).toContain('value');
  });

  it('colors a bare URL as a value and keeps blank lines', () => {
    const lines = highlightSnippet('claude mcp add http://localhost:3000/mcp\n\ndone');
    expect(lines).toHaveLength(3);
    expect(lines[0].some((t) => t.kind === 'value' && t.text === 'http://localhost:3000/mcp')).toBe(true);
    expect(lines[1]).toEqual([{ text: '', kind: 'plain' }]);
  });

  it('reassembles exactly to the original code (copy stays the source of truth)', () => {
    for (const s of buildConnectSnippets(URL)) {
      const rebuilt = highlightSnippet(s.code)
        .map((line) => line.map((t) => t.text).join(''))
        .join('\n');
      expect(rebuilt).toBe(s.code);
    }
  });
});
