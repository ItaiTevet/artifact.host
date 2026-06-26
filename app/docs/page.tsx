import { Header } from '@/components/site/Header';
import { CodeBlock } from '@/components/ui/CodeBlock';
import styles from './docs.module.css';

export const metadata = { title: 'Docs — artifact.host' };

export default function DocsPage() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <h1 className={styles.h1}>Docs</h1>
        <p className={styles.lede}>
          Deploy HTML from the command line or directly over the REST API. Anonymous use is
          fully supported via a one-time edit token; no account required. Markdown artifacts
          are planned — see the <a href="https://github.com/ItaiTevet/artifact.host/blob/main/docs/ROADMAP.md">roadmap</a>.
        </p>

        <h2 className={styles.h2}>CLI</h2>
        <p className={styles.p}>
          No install required — run it with <span className={styles.tag}>npx</span>. Sign in once (opens your
          browser), then deploy any HTML file:
        </p>
        <CodeBlock lang="bash" code={`npx artifact-host auth login
npx artifact-host deploy ./index.html --ttl 7d

# self-hosted instance:
npx artifact-host auth login --host https://artifacts.your-co.com
npx artifact-host deploy ./index.html --host https://artifacts.your-co.com`} />
        <p className={styles.p}>
          Other commands: <span className={styles.tag}>list</span>, <span className={styles.tag}>update &lt;slug&gt; &lt;file&gt;</span>,
          <span className={styles.tag}>visibility &lt;slug&gt; public|password</span>, <span className={styles.tag}>delete &lt;slug&gt;</span>,
          <span className={styles.tag}>comments &lt;slug&gt; [--json]</span>.
          In CI, skip the browser with <span className={styles.tag}>ARTIFACT_HOST_TOKEN</span>.
        </p>

        <h2 className={styles.h2}>REST API</h2>
        <p className={styles.p}><strong>POST /api/deploy</strong> — create an artifact. Body:</p>
        <CodeBlock lang="json" code={`{
  "content": "<!doctype html>…",   // required, ≤ 5 MB
  "ttl": "7d",                      // 1h | 1d | 7d | 30d (default 7d)
  "visibility": "public",           // public | password
  "password": "…"                   // required when visibility = password
}

→ 201 { "slug", "url", "edit_token", "expires_at" }`} />
        <p className={styles.p}>
          <strong>PATCH /api/artifacts/&#123;slug&#125;</strong> — update content or visibility. Authorize with the
          edit token via the <span className={styles.tag}>x-edit-token</span> header (or <span className={styles.tag}>edit_token</span> in the body).
        </p>
        <CodeBlock lang="json" code={`// Update content
PATCH /api/artifacts/x7k2
x-edit-token: <token>
{ "content": "<!doctype html>…" }
→ { "slug", "url", "expires_at" }

// Change visibility
PATCH /api/artifacts/x7k2
x-edit-token: <token>
{ "visibility": "password", "password": "…" }
→ { "ok": true }`} />
        <p className={styles.p}>
          Limits: 5 MB per artifact; up to 5 live artifacts per anonymous user (bucketed by IP); expiry is set
          once at deploy and never extended by updates.
        </p>

        <h2 className={styles.h2}>Comments</h2>
        <p className={styles.p}>
          Owners enable comments per artifact with the <strong>Allow comments</strong> toggle (deploy
          panel or dashboard editor). Signed-in viewers annotate the rendered page in place: click{' '}
          <strong>Add comment</strong> to drop a pin, or select text to attach a highlight. Comments
          appear in a side panel; the owner can resolve or delete any comment.
        </p>
        <p className={styles.p}>
          <strong>Permissions:</strong> reading comments is open to anyone who can view the artifact.
          Posting requires a signed-in account. On public and password-protected artifacts any
          signed-in viewer can post. On restricted artifacts each invited person carries a{' '}
          <strong>View</strong> or <strong>Comment</strong> role (set in the share editor). The API
          never exposes commenters&#39; email addresses — only a display name.
        </p>
        <p className={styles.p}><strong>GET /api/artifacts/&#123;slug&#125;/comments</strong> — list comments (anyone who can view).</p>
        <CodeBlock lang="json" code={`→ { "comments": [{ "id", "body", "anchor", "author_name", "resolved", "created_at" }] }`} />
        <p className={styles.p}><strong>POST /api/artifacts/&#123;slug&#125;/comments</strong> — add a comment (sign-in + comment permission).</p>
        <CodeBlock lang="json" code={`{ "body": "…", "anchor": { "kind": "pin"|"highlight", "x": 0.5, "y": 0.3, "quote": "…" } }
// x, y are normalized 0–1 relative to the rendered page`} />
        <p className={styles.p}>
          <strong>PATCH /api/artifacts/&#123;slug&#125;/comments/&#123;id&#125;</strong> — edit body (author) or
          mark resolved (owner or commenter). <strong>DELETE</strong> — author or owner.
        </p>
        <p className={styles.p}>
          Enable or disable comments on an artifact: <strong>PATCH /api/artifacts/&#123;slug&#125;</strong>{' '}
          <span className={styles.tag}>&#123; &quot;comments_enabled&quot;: true &#125;</span> (owner only).
        </p>
        <p className={styles.p}>
          From the CLI, <span className={styles.tag}>artifact comments &lt;slug&gt; --json</span> returns the full
          structured comment thread — useful for an AI agent to read and act on.
        </p>
      </main>
    </>
  );
}
