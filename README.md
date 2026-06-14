# artifact.host

Share what your AI built. Turn an HTML file into a live, shareable URL in seconds — paste it
in the browser or push it from the CLI. Nothing to install for viewers.

- **Hosted:** [artifact.host](https://artifact.host)
- **Self-hostable:** one container, SQLite, local accounts — no external services required.

## CLI

```bash
npx artifact-host auth login          # sign in via the browser
npx artifact-host deploy ./index.html # → prints the live URL
```

Point it at your own instance with `--host https://artifacts.your-co.com` (or
`ARTIFACT_HOST_URL`). See [`cli/README.md`](cli/README.md) for all commands.

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
| `supabase` | The hosted cloud build | Supabase project |
| `oidc` *(planned)* | Company SSO — e.g. **Google Workspace**, Okta, Keycloak | OIDC client + `ALLOWED_EMAIL_DOMAINS` |

**Company Google (GSuite) — coming next.** The `oidc` provider will let you set
`AUTH_PROVIDER=oidc`, `OIDC_ISSUER=https://accounts.google.com`, your Google OAuth client
id/secret, and `ALLOWED_EMAIL_DOMAINS=intezer.com` so only verified `@intezer.com` accounts
can sign in — with the instance acting only as an OIDC *relying party* (no OAuth server of its
own). The config surface is stubbed in `.env.example`; the provider itself is the next step.

### Database options

`DB_DRIVER=sqlite` (default, embedded file) or `DB_DRIVER=supabase` (Postgres via Supabase).
See [`.env.example`](.env.example) for the full configuration surface.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest (no credentials needed — uses in-memory + SQLite)
```

Architecture notes: the core service (`lib/artifacts/service.ts`) is persistence-agnostic
behind `ArtifactRepository`; `lib/db/factory.ts` selects the driver; auth is pluggable behind
`AUTH_PROVIDER`. Programmatic deploys use the REST API (`/api/deploy`, `/api/artifacts/*`),
which the CLI wraps.

## License

MIT — see [LICENSE](LICENSE).
