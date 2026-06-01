# Session Handoff — artifact.host

**Last updated:** 2026-06-01

## Resume point

- **Everything is on local `main`.** No outstanding feature branches — just `git checkout main`.
- **Nothing is pushed to `origin`** (kept intentionally local). The work exists only in this working copy.

## Where things stand

**Done & merged to `main` (Plan 1 — foundation + core artifact service):**
- Next.js 16 (App Router, TS) + Vitest scaffold. Note: **Vitest is pinned to v3** because Node is 22.11 and Vitest 4 needs ≥22.12 (`require(ESM)`). Don't bump Vitest to 4 unless Node is upgraded.
- Framework-free core service layer in `lib/artifacts/` (slug, ttl, validate, tokens, html-meta, service) behind a repository **port** (`repository.ts`), unit-tested via an in-memory fake.
- Supabase adapter (`lib/db/`), SQL migrations (`supabase/migrations/0001`, `0002`).
- HTTP: `POST /api/deploy`, `PATCH /api/artifacts/[slug]`, viewer `app/a/[slug]` with server-side password gate + signed cookie, `X-Robots-Tag` via `proxy.ts`, expiry cron `app/api/cron/expire`.
- **48 unit tests pass, tsc clean, build compiles.**

**Also on `main` (integration tests, currently dormant):**
- Real-DB integration contract tests: `lib/db/__tests__/artifact-repository.integration.test.ts` (10 tests). They **skip** unless `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (loaded via `dotenv` in `vitest.setup.ts`).

## The gap to close (why this handoff exists)

The unit tests cover the **domain logic** but run against the in-memory fake. The **Supabase adapter + SQL + full e2e are UNVERIFIED** — no DB was available. The new session has the Supabase MCP/connector enabled to fix this.

## Next steps, in order

1. **Set up Supabase** (a dev/test project): create it, apply `supabase/migrations/0001_artifacts.sql` and `0002_increment_view_count.sql` (SQL editor or `supabase db push`), then fill `.env.local` from `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COOKIE_SECRET`, `CRON_SECRET`). With the Supabase MCP, the agent can apply migrations and read project keys directly.
2. **Activate the integration tests:** `npm test` — the 10 skipped tests should now run green against the real DB. Fix any adapter/SQL bugs they surface (this is the riskiest, hand-written query code).
3. **True e2e:** `npm run dev`, then deploy via curl → view in browser → update → password-gate → trigger cron. Confirm `X-Robots-Tag: noindex`. (Optionally add `scripts/e2e.mjs` for a one-command run.)
4. **Write Plan 2** (MCP endpoint + OAuth) using the `superpowers:writing-plans` skill, then execute. Both Plan 2 and Plan 3 are adapters over the existing service layer.

## Remaining plans (outlined in the spec, not yet written as detailed plans)

- **Plan 2 — MCP endpoint + OAuth:** `/mcp` streamable-HTTP route exposing `deploy_html` / `update_html` / `set_visibility` over the existing service; OAuth so authed users own their artifacts (`ownerId` is already plumbed through schema + service); `npx artifact-host-mcp` stdio shim.
- **Plan 3 — Web UI + sharing niceties:** the approved homepage (`docs/superpowers/specs/2026-06-01-homepage-mockup.html` — Lora + JetBrains Mono, platform picker + connect snippets + manual paste), Supabase auth, dashboard, `@vercel/og` branded OG cards, QR codes.

## Carried-over UI follow-ups (from the design audit)

Mobile header collapses at ~390px; no `:focus-visible` states; self-host brand icons instead of Google favicon service; wire the `⌘↵ deploy` shortcut; decide on "Always free" copy given a future paid tier.

## Reference docs

- Spec: `docs/superpowers/specs/2026-06-01-html-artifact-sharing-design.md`
- Plan 1: `docs/superpowers/plans/2026-06-01-foundation-core-service.md`
- Homepage mockup: `docs/superpowers/specs/2026-06-01-homepage-mockup.html`

## Gotcha for the agent

When committing via the Bash tool, **do not use PowerShell here-string syntax (`@'...'@`)** — it isn't valid in bash and pollutes commit messages with stray `@`. Use multiple `-m` flags instead.
