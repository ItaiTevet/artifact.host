# artifact.host

Share what your AI built. Turn an HTML file into a live, shareable URL in seconds — paste it
in the browser or push it from the CLI. Nothing to install for viewers.

- **Hosted:** [artifact.host](https://artifact.host)
- **Self-hostable:** one container, SQLite, local accounts — no external services required.

> **Coming soon:** Markdown artifacts (paste, upload, and rendering) are on the
> [roadmap](docs/ROADMAP.md#5-markdown-artifact-support). Today, artifacts are HTML.

## CLI

```bash
npx artifact-host auth login          # sign in via the browser
npx artifact-host deploy ./index.html # → prints the live URL
```

Point it at your own instance with `--host https://artifacts.your-co.com` (or
`ARTIFACT_HOST_URL`). See [`cli/README.md`](cli/README.md) for all commands.

## Comments & collaboration

Owners turn comments on per artifact via the **Allow comments** toggle (deploy panel or
dashboard editor). Signed-in viewers see comment **pins** rendered directly on the page —
hover a pin to read the comment, or click the **💬 pill** (bottom-right) to enter comment
mode: click anywhere to drop a pin, or select text to attach a highlight. Resolved comments
are hidden in-page; list or reopen them via the API or CLI.

On public and password-protected artifacts any signed-in viewer can post. On **restricted**
artifacts each invited person gets a **View** or **Comment** role (set in the share editor).

For agents and scripts, `artifact comments` prints the comment thread:

```bash
npx artifact-host comments <slug>        # human-readable list
npx artifact-host comments <slug> --json # full structured records
```

## Self-hosting

The default profile needs **no external services**: a single container with an embedded
SQLite database and email/password accounts.

```bash
cp .env.example .env
# set AUTH_SECRET, COOKIE_SECRET, CRON_SECRET — e.g. openssl rand -hex 32
docker compose up -d
```

Open `http://localhost:3000`, create an account on `/dashboard`, then connect the CLI:

```bash
npx artifact-host auth login --host http://localhost:3000
npx artifact-host deploy ./index.html --host http://localhost:3000
```

The SQLite database lives in the `artifact-data` volume. To prune expired artifacts, the
bundled `expirer` sidecar pings `/api/cron/expire` daily (or run it from a host cron).

### Authentication options

Pick a provider with `AUTH_PROVIDER`:

| Provider | Use case | Needs |
| --- | --- | --- |
| `local-password` *(default)* | Self-host, simplest | `AUTH_SECRET` |
| `oidc` | Company SSO — e.g. **Google Workspace**, Okta, Keycloak | OIDC client + `ALLOWED_EMAIL_DOMAINS` |
| `supabase` | The hosted cloud build | Supabase project |

**Company Google (GSuite).** Set `AUTH_PROVIDER=oidc`, `OIDC_ISSUER=https://accounts.google.com`,
your Google OAuth client id/secret, and `ALLOWED_EMAIL_DOMAINS=intezer.com` so only verified
`@intezer.com` accounts can sign in. The instance is only an OIDC *relying party* (Authorization
Code + PKCE) — it never runs its own OAuth server. Set the Google OAuth client's redirect URI to
`<APP_BASE_URL>/api/auth/oidc/callback`.

### Database options

| `DB_DRIVER` | Storage |
| --- | --- |
| `sqlite` *(default)* | Embedded file (`SQLITE_PATH`) — simplest, single container |
| `postgres` | Your own Postgres via `DATABASE_URL` — scale-up, multiple app instances |
| `supabase` | The hosted cloud build |

The schema is bootstrapped automatically on first run for `sqlite`/`postgres`. See
[`.env.example`](.env.example) for the full configuration surface.

## Development

```bash
npm install
npm run dev               # http://localhost:3000
npm test                  # vitest unit/logic (no credentials needed)
npm run build && npm run e2e   # hermetic HTTP end-to-end (self-host mode)
```

Testing spans both deployment modes (cloud + self-host) — see [TESTING.md](TESTING.md).

Architecture notes: the core service (`lib/artifacts/service.ts`) is persistence-agnostic
behind `ArtifactRepository`; `lib/db/factory.ts` selects the driver; auth is pluggable behind
`AUTH_PROVIDER`. Programmatic deploys use the REST API (`/api/deploy`, `/api/artifacts/*`),
which the CLI wraps.

## License

MIT — see [LICENSE](LICENSE).
