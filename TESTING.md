# Testing

artifact.host runs in two modes, selected entirely by env (`AUTH_PROVIDER` + `DB_DRIVER`):

| Mode | Auth | DB | Login |
| --- | --- | --- | --- |
| **Cloud** | `supabase` | `supabase` (Postgres) | browser OAuth (Google/GitHub) |
| **Self-host** | `local-password` / `oidc` | `sqlite` / `postgres` | email+password (scriptable) |

Tests are organized in three tiers so both modes stay covered without a browser in the loop.

## 1. Unit / logic — `npm test`

Vitest. Mode-agnostic core (service, sharing, auth primitives) plus the data layer:
in-memory and **real SQLite** always run; Postgres and Supabase repo suites run only when
`DATABASE_URL` / Supabase creds are present (skipped otherwise). No credentials needed for the
default run.

## 2. End-to-end (HTTP) — `npm run e2e`

A dual-mode black-box suite (`e2e/`, Node's built-in test runner — no extra deps) that drives
the real REST API + auth. The same scenarios run in both modes; only "how you get an owner
token" differs — and **Personal API Tokens make owner flows browser-free in both modes.**

**Self-host (default, hermetic — this is what CI runs):**

```bash
npm run build && npm run e2e
```

Boots `next start` with `sqlite` + `local-password` against an ephemeral DB on a free port,
signs up an owner, mints extra identities for the sharing matrix, and tears everything down.
No external services.

**Cloud (against a real instance, e.g. prod):**

```bash
# one-time: create a Personal API Token in the dashboard (/dashboard/tokens)
E2E_BASE_URL=https://artifact.host ARTIFACT_HOST_TOKEN=ah_xxx npm run e2e
```

Uses the PAT for owner flows. Multi-identity checks (allowlisted vs denied viewers) are skipped
— minting arbitrary OAuth identities needs real accounts — but owner/anonymous/PAT/restricted-
owner/edit-token/password paths all run. The suite uses 1h TTLs and **deletes the artifacts it
owns** on teardown, so it's safe to point at prod.

### What the suite covers
Anonymous deploy + view + edit-token update (and rejection), owner deploy + listing,
owner-only endpoints rejecting anonymous callers, PAT create→authenticate→revoke, the
`restricted` sharing access matrix (owner/allowlisted-email/allowlisted-domain/denied/anon),
and the password gate.

## 3. Cloud post-deploy smoke

Run tier 2 in cloud mode against prod after a deploy (manually, or as a CI job gated on the
`ARTIFACT_HOST_TOKEN` secret) to confirm the live instance behaves.

## Not automated
Browser **OAuth login** itself (Google/GitHub) and the CLI's loopback `auth login` need a real
browser — verify those manually. Everything they unlock (owner-authenticated API calls) is
covered via PATs.
