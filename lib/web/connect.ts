export const PLATFORM_IDS = ['claude', 'openai', 'cursor', 'vscode', 'windsurf'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

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
