# Connecting to the artifact.host MCP server

artifact.host exposes a **streamable-HTTP** MCP endpoint.

- **Production:** `https://artifact.host/mcp`
- **Local dev:** `http://localhost:3000/mcp`

## Tools

| Tool | Purpose | Key inputs |
|------|---------|-----------|
| `deploy_html` | Host an HTML string at a live URL | `html`, `ttl` (1h/1d/7d/30d), `visibility` (public/password), `password?` |
| `update_html` | Replace an artifact's HTML (same URL, expiry unchanged) | `slug`, `html`, `edit_token` |
| `set_visibility` | Make an artifact public or password-protected | `slug`, `visibility`, `password?`, `edit_token` |

`deploy_html` returns `{ url, slug, edit_token, expires_at }`. **Save `edit_token`** — it is shown once and is required to update or change visibility later. Anonymous (no-login) usage is fully supported via this token.

## Sign in (optional)

The endpoint is **dual-mode**. Anonymous use works with no account (edit-token model above). If your MCP client supports remote OAuth (e.g. Claude), connecting to `https://artifact.host/mcp` will trigger a browser sign-in: the client auto-discovers the authorization server from the endpoint's protected-resource metadata, you sign in with **Google or GitHub** on the artifact.host consent page, approve, and the client connects. Artifacts you deploy while signed in are owned by your account, so you can manage them in the web dashboard at `https://artifact.host/dashboard`. Signing in is never required — anonymous deploys keep working.

## Clients that speak streamable-HTTP MCP directly

Add a remote MCP server pointing at the endpoint URL. Example config block:

```json
{
  "mcpServers": {
    "artifact-host": {
      "type": "streamable-http",
      "url": "https://artifact.host/mcp"
    }
  }
}
```

(The exact config key/shape varies by client; use the client's "remote/HTTP MCP server" option with the URL above.)

## Manual testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP**, enter the endpoint URL, connect, and use **List Tools** / **Call Tool**.
