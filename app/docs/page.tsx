import { Header } from '@/components/site/Header';
import styles from './docs.module.css';

export const metadata = { title: 'Docs — artifact.host' };

const MCP_URL = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/mcp`;

export default function DocsPage() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <h1 className={styles.h1}>Docs</h1>
        <p className={styles.lede}>
          Deploy HTML over MCP (from your AI assistant) or directly over the REST API. Anonymous use is
          fully supported via a one-time edit token; no account required.
        </p>

        <h2 className={styles.h2}>Connect over MCP</h2>
        <p className={styles.p}>
          artifact.host exposes a streamable-HTTP MCP endpoint at <span className={styles.tag}>{MCP_URL}</span>.
          Add it as a remote MCP server; stdio-only clients can bridge with <span className={styles.tag}>npx mcp-remote {MCP_URL}</span>.
        </p>
        <table className={styles.table}>
          <thead><tr><th>Tool</th><th>Purpose</th><th>Key inputs</th></tr></thead>
          <tbody>
            <tr><td>deploy_html</td><td>Host an HTML string at a live URL</td><td>html, ttl (1h/1d/7d/30d), visibility (public/password), password?</td></tr>
            <tr><td>update_html</td><td>Replace an artifact&rsquo;s HTML (same URL, expiry unchanged)</td><td>slug, html, edit_token</td></tr>
            <tr><td>set_visibility</td><td>Make an artifact public or password-protected</td><td>slug, visibility, password?, edit_token</td></tr>
          </tbody>
        </table>

        <h2 className={styles.h2}>REST API</h2>
        <p className={styles.p}><strong>POST /api/deploy</strong> — create an artifact. Body:</p>
        <code className={styles.code}>{`{
  "content": "<!doctype html>…",   // required, ≤ 5 MB
  "ttl": "7d",                      // 1h | 1d | 7d | 30d (default 7d)
  "visibility": "public",           // public | password
  "password": "…"                   // required when visibility = password
}

→ 201 { "slug", "url", "edit_token", "expires_at" }`}</code>
        <p className={styles.p}>
          <strong>PATCH /api/artifacts/&#123;slug&#125;</strong> — update content or visibility. Authorize with the
          edit token via the <span className={styles.tag}>x-edit-token</span> header (or <span className={styles.tag}>edit_token</span> in the body).
        </p>
        <code className={styles.code}>{`// Update content
PATCH /api/artifacts/x7k2
x-edit-token: <token>
{ "content": "<!doctype html>…" }
→ { "slug", "url", "expires_at" }

// Change visibility
PATCH /api/artifacts/x7k2
x-edit-token: <token>
{ "visibility": "password", "password": "…" }
→ { "ok": true }`}</code>
        <p className={styles.p}>
          Limits: 5 MB per artifact; up to 5 live artifacts per anonymous user (bucketed by IP); expiry is set
          once at deploy and never extended by updates.
        </p>
      </main>
    </>
  );
}
