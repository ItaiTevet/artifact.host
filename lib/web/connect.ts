export const PLATFORM_IDS = ['claude', 'openai', 'cursor', 'vscode', 'windsurf'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export type SnippetTokenKind = 'plain' | 'comment' | 'key' | 'value';
export interface SnippetToken {
  text: string;
  kind: SnippetTokenKind;
}

/**
 * Lightweight highlighter for the dark connect-snippet box (mirrors the mockup's
 * coding-style colors): whole comment lines (`#`/`//`) are dimmed, JSON keys are
 * amber, and quoted strings / bare URLs are green. Returns one token array per
 * line; concatenating every token's text (joined by "\n") reproduces the input
 * exactly, so the raw `code` stays the source of truth for copy.
 */
export function highlightSnippet(code: string): SnippetToken[][] {
  return code.split('\n').map(highlightLine);
}

function highlightLine(line: string): SnippetToken[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return [{ text: line, kind: 'comment' }];
  }
  const tokens: SnippetToken[] = [];
  const re = /"[^"]*"|https?:\/\/[^\s"]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) tokens.push({ text: line.slice(last, m.index), kind: 'plain' });
    const match = m[0];
    if (match.startsWith('"')) {
      const rest = line.slice(m.index + match.length);
      tokens.push({ text: match, kind: /^\s*:/.test(rest) ? 'key' : 'value' });
    } else {
      tokens.push({ text: match, kind: 'value' });
    }
    last = m.index + match.length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), kind: 'plain' });
  if (tokens.length === 0) tokens.push({ text: line, kind: 'plain' });
  return tokens;
}

export interface ConnectSnippet {
  id: PlatformId;
  name: string;
  step: string;
  code: string;
}

/**
 * Per-client setup for the REMOTE streamable-HTTP MCP endpoint. OAuth-capable
 * clients take the URL directly; stdio-only clients use `npx mcp-remote <url>`.
 * Mirrors docs/mcp-connect.md. `url` is the live endpoint (…/mcp).
 */
export function buildConnectSnippets(url: string): ConnectSnippet[] {
  return [
    {
      id: 'claude',
      name: 'Claude',
      step: 'Claude Code (terminal) — or add a remote MCP server in Claude Desktop',
      code: [
        `# Claude Code`,
        `claude mcp add --transport http artifact-host ${url}`,
        ``,
        `# Claude Desktop → Settings → Connectors → Add custom (remote) → URL:`,
        `${url}`,
      ].join('\n'),
    },
    {
      id: 'openai',
      name: 'GPT / Codex',
      step: 'Codex CLI (via mcp-remote) or ChatGPT Desktop connectors',
      code: [
        `# Codex CLI`,
        `codex mcp add artifact-host -- npx -y mcp-remote ${url}`,
        ``,
        `# ChatGPT Desktop → Settings → Connectors → Add → URL:`,
        `${url}`,
      ].join('\n'),
    },
    {
      id: 'cursor',
      name: 'Cursor',
      step: 'Add to .cursor/mcp.json',
      code: [
        `{`,
        `  "mcpServers": {`,
        `    "artifact-host": { "url": "${url}" }`,
        `  }`,
        `}`,
      ].join('\n'),
    },
    {
      id: 'vscode',
      name: 'VS Code',
      step: 'Add to .vscode/mcp.json (agent mode)',
      code: [
        `{`,
        `  "servers": {`,
        `    "artifact-host": { "type": "http", "url": "${url}" }`,
        `  }`,
        `}`,
      ].join('\n'),
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      step: 'Add to ~/.codeium/windsurf/mcp_config.json (via mcp-remote)',
      code: [
        `{`,
        `  "mcpServers": {`,
        `    "artifact-host": { "command": "npx", "args": ["-y", "mcp-remote", "${url}"] }`,
        `  }`,
        `}`,
      ].join('\n'),
    },
  ];
}
