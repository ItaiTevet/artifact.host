# Session Handoff — artifact.host

**Last updated:** 2026-06-02 (session 3)

## Resume point

- **Active branch: `feat/mcp-endpoint`** — the anonymous MCP endpoint (Plan 2) is built and verified here, NOT yet merged to `main`. Decide merge vs PR via `superpowers:finishing-a-development-branch`.
- **Nothing is pushed to `origin`** (kept intentionally local). The work exists only in this working copy.
- **Next unstarted work:** Task 8 (deploy to Vercel — gated on user confirmation), then Plan 2b (OAuth), then Plan 3 (Web UI).

## Where things stand

**Done & merged to `main` (Plan 1 — foundation + core artifact service):**
- Next.js 16 (App Router, TS) + Vitest scaffold. Note: **Vitest is pinned to v3** because Node is 22.11 and Vitest 4 needs ≥22.12 (`require(ESM)`). Don't bump Vitest to 4 unless Node is upgraded.
- Framework-free core service layer in `lib/artifacts/` (slug, ttl, validate, tokens, html-meta, service) behind a repository **port** (`repository.ts`), unit-tested via an in-memory fake.
- Supabase adapter (`lib/db/`), SQL migrations (`supabase/migrations/0001`, `0002`).
- HTTP: `POST /api/deploy`, `PATCH /api/artifacts/[slug]`, viewer `app/a/[slug]` with server-side password gate + signed cookie, `X-Robots-Tag` via `proxy.ts`, expiry cron `app/api/cron/expire`.
- **48 unit tests pass, tsc clean, build compiles.**

**Also on `main` (integration tests, currently dormant):**
- Real-DB integration contract tests: `lib/db/__tests__/artifact-repository.integration.test.ts` (10 tests). They **skip** unless `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (loaded via `dotenv` in `vitest.setup.ts`).

## ✅ Completed in session 2

- Applied all 3 migrations to the live Supabase project (`bjztcxpqchwpdsrgapqp`, region ap-northeast-1):
  - `0001_artifacts.sql` — table + indexes
  - `0002_increment_view_count.sql` — RPC function
  - `0003_grants.sql` — explicit `GRANT ALL … TO service_role` (required for new Supabase projects that no longer auto-grant)
- Wrote `.env.local` with real URL + `sb_secret_...` key (new Supabase key format, replaces `service_role` JWT)
- **58/58 tests pass** — 48 unit + 10 integration, all green against real DB
- **E2e verified:** deploy → view (iframe + `x-robots-tag: noindex`) → update → password-gate → cron expire — all working

## ✅ Completed in session 3 (Plan 2 — anonymous MCP endpoint, branch `feat/mcp-endpoint`)

Built per `docs/superpowers/plans/2026-06-01-mcp-endpoint.md`, subagent-driven with two-stage review per task.
- **`/mcp` streamable-HTTP endpoint** (`app/[transport]/route.ts`) via `mcp-handler` (stateless, SSE disabled), advertising as `artifact.host` v1.0.0.
- Three tools over the existing service: `deploy_html`, `update_html`, `set_visibility` (`lib/mcp/tools.ts`), built on pure handlers (`lib/mcp/handlers.ts`) + actionable error mapping (`lib/mcp/errors.ts`).
- **Anonymous edit-token model** (no OAuth yet); `ownerId` stays null. IP rate-limit bucket derived from MCP request headers (`getIpHashFromHeaders`).
- New deps: `mcp-handler@1.1.0`, `@modelcontextprotocol/sdk@1.26.0`, `zod@^3`.
- **73/73 tests pass** (58 prior + 15 new: errors 3, handlers 5, tools-integration 4, request-context 3), tsc clean, build compiles. Live HTTP smoke test confirmed: lists 3 tools, deploy works against real Supabase, returned URL renders with `x-robots-tag: noindex`.
- Connect docs: `docs/mcp-connect.md`. **Decision (changed from spec):** streamable-HTTP only, no stdio shim — clients use a remote/HTTP MCP config or `npx mcp-remote`.

## Next steps, in order

1. **Task 8 (gated):** deploy to Vercel + set prod env vars + verify hosted `/mcp`. Needs explicit user go-ahead (publishes the app).
2. **Finish the branch:** merge `feat/mcp-endpoint` to `main` (or open a PR) via `superpowers:finishing-a-development-branch`.
3. **Plan 2b — OAuth:** Supabase Auth on the MCP endpoint so authed tool calls own their artifacts (`ownerId` already plumbed through schema + service). Write with `superpowers:writing-plans`, then execute.
4. **Plan 3 — Web UI** (below).

## Remaining plans (outlined in the spec, not yet written as detailed plans)

- **Plan 2b — OAuth on the MCP endpoint:** authed users own their artifacts; unauth calls stay anonymous (edit-token only). Supabase Auth backs identity.
- **Plan 3 — Web UI + sharing niceties:** the approved homepage (`docs/superpowers/specs/2026-06-01-homepage-mockup.html` — Lora + JetBrains Mono, platform picker + connect snippets + manual paste), Supabase auth, dashboard, `@vercel/og` branded OG cards, QR codes.

## Carried-over UI follow-ups (from the design audit)

Mobile header collapses at ~390px; no `:focus-visible` states; self-host brand icons instead of Google favicon service; wire the `⌘↵ deploy` shortcut; decide on "Always free" copy given a future paid tier.

## Reference docs

- Spec: `docs/superpowers/specs/2026-06-01-html-artifact-sharing-design.md`
- Plan 1: `docs/superpowers/plans/2026-06-01-foundation-core-service.md`
- Plan 2 (MCP endpoint): `docs/superpowers/plans/2026-06-01-mcp-endpoint.md`
- MCP connect guide: `docs/mcp-connect.md`
- Homepage mockup: `docs/superpowers/specs/2026-06-01-homepage-mockup.html`

## Gotcha for the agent

When committing via the Bash tool, **do not use PowerShell here-string syntax (`@'...'@`)** — it isn't valid in bash and pollutes commit messages with stray `@`. Use multiple `-m` flags instead.
