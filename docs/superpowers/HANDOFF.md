# Session Handoff — artifact.host

**Last updated:** 2026-06-02 (session 6)

## Resume point

- **Plan 3a (public web UI) is DONE and merged to `main`.** **Plan 3b (sign-in + dashboard) is DONE on branch `feat/web-ui-dashboard`** (see the Plan 3b block below) — pending the finishing-a-development-branch step (merge/PR decision). Plan 2 (anonymous MCP endpoint) and **Plan 2b Part A (MCP OAuth code)** are on `main`.
- **Nothing is pushed to `origin`** (kept intentionally local). The work exists only in this working copy.
- **Next unstarted work:** the Plan 2b **go-live ops batch** (below) — DNS + Supabase OAuth server enable + Google/GitHub OAuth apps + e2e. This is the ONE thing gating real sign-in for BOTH the MCP consent flow and the new web dashboard (they share the same Supabase Google/GitHub providers). All Plan 3b code is built, type-checked, and unit/component/contract-tested; only the live click-through sign-in depends on this batch.

## Plan 3b (sign-in + dashboard) — DONE (branch `feat/web-ui-dashboard`)

Authenticated web dashboard. Login reuses the existing browser Supabase client (factored into `lib/web/supabase-browser.ts` singleton: `getAccessToken`/`getAccountEmail`/`signIn`/`signOut`). The dashboard sends `session.access_token` as a Bearer to new authed API routes, which verify it via a **shared `verifySupabaseToken`** (`lib/auth/supabase-token.ts`, extracted from the MCP auth path so MCP + web share one audited verifier) and call the service layer with `{ ownerId }`. Ownership enforced **server-side in the service** (no RLS, no new deps).
- **Routes:** `/dashboard` (ledger-row list of the signed-in user's artifacts; signed-out → in-page Google/GitHub gate; empty state; per-row Open/Edit/Delete with confirm + optimistic remove) and `/dashboard/<slug>` (dedicated edit page: HTML textarea, visibility public⇄password, Save). Header `dashboard`/`sign in` placeholders now wired to `<AccountMenu/>`.
- **API:** `GET /api/artifacts` (list, summary projection — no content blobs), `GET /api/artifacts/[slug]` (editor fetch, owner-only), `DELETE /api/artifacts/[slug]` (owner-only), and `PATCH` extended with a Bearer/owner path alongside the existing anonymous edit-token path (anonymous editing preserved).
- **Data:** repo `listByOwner`/`deleteOwned` (+ `ArtifactSummary` type); service `listOwnArtifacts`/`getOwnArtifact`/`deleteArtifact`. Real-DB contract tests added (`listByOwner`/`deleteOwned`) — ran green against the live Supabase project.
- **Deliberate deviation from spec:** the row's "change visibility" affordance folds into Edit (visibility lives on the edit page), avoiding an inline password flow. Row actions are Open · Edit · Delete.
- **Known follow-up (UX papercut, not blocking):** editing a password-protected artifact's content re-requires the viewer password because the edit page loads the password field empty and `validateEditInput` requires it when visibility is `password`. Consider relaxing validation to only require a password when newly enabling/changing protection.
- Plan: `docs/superpowers/plans/2026-06-02-web-ui-dashboard.md`; spec: `docs/superpowers/specs/2026-06-02-web-ui-dashboard-design.md`. **150/150 tests pass, tsc clean, build clean** (`/dashboard` + `/dashboard/[slug]` in the route table; both serve HTTP 200 on a prod-build smoke). Subagent-driven (Opus implementers + two-stage review). No new npm deps.
- **Roadmap backlog** captured at `docs/ROADMAP.md`: comprehensive analytics, team/sharing/permissions, in-browser visual (WYSIWYG) artifact editing.

## Plan 3a (public web UI) — DONE (merged to `main`)

Branded shell (Lora + JetBrains Mono via `next/font`, brand tokens in `app/globals.css`), homepage (connect-your-AI platform picker + anonymous paste-deploy with inline result card), `/docs` (MCP tools + REST API reference), branded OG cards (`next/og`, with missing/expired fallback) + client-side QR, reskinned viewer password gate + branded `not-found`. Deploys via the existing `POST /api/deploy` (no business logic added in the UI). Auth header links (`dashboard`/`sign in`) render but are **inert** (wired in Plan 3b). New deps: `qrcode` (+ `@types/qrcode`), dev `@testing-library/react` + `jsdom`. Component-test infra: `vitest.config.ts` now globs `**/*.test.{ts,tsx}` and uses `pool: 'forks'` + `--experimental-require-module` (needed for jsdom under Node 22.11; remove once Node ≥ 22.12). Plan: `docs/superpowers/plans/2026-06-02-web-ui-public.md`; spec: `docs/superpowers/specs/2026-06-02-web-ui-public-design.md`. **107/107 tests pass, tsc clean, build clean**; live smoke (prod build): `/`→200, `/docs`→200, missing slug→404, OG→`image/png`. Subagent-driven (Opus implementers + review). **Carried-over manual audit (not blocking):** eyeball the ~390px mobile header, `:focus-visible` rings, and the `⌘↵`/`Ctrl+↵` deploy shortcut against the mockup in a browser.

## Plan 2b status — code DONE, live setup DEFERRED

Plan: `docs/superpowers/plans/2026-06-02-mcp-oauth.md`. **Part A (Tasks 1–6) is complete and merged** — `jose` JWT validation (`lib/mcp/auth.ts`, fail-closed to anonymous), `owner_id` threaded through handlers/tools, `/mcp` wrapped with `withMcpAuth({required:false})` + `/.well-known/oauth-protected-resource` metadata route, and the `/oauth/consent` Google/GitHub page. 86/86 tests pass; build clean; anonymous HTTP path verified live; Opus review found no serious bugs.

**Go-live checklist (Part B, Tasks 7–10 — pure ops, do as one batch, domain-first):**
1. **DNS for `artifact.host`** (registered at Squarespace). Domain already added to Vercel project `artifact-host`. Either add `A @ 76.76.21.21` at Squarespace (keeps DNS there) OR delegate nameservers to `ns1/ns2.vercel-dns.com` (Vercel-managed; only if nothing else uses the domain). Decision pending.
2. Repoint Vercel prod `APP_BASE_URL=https://artifact.host`; add `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) to Vercel prod; redeploy.
3. **Supabase dashboard:** enable OAuth 2.1 server + Dynamic Client Registration; consent path `/oauth/consent`; confirm asymmetric (RS256) signing keys; Site URL `https://artifact.host` + add `/oauth/consent` to redirect allow-list.
4. **Google + GitHub OAuth apps** (owner): callback `https://bjztcxpqchwpdsrgapqp.supabase.co/auth/v1/callback`; paste Client ID/secret into Supabase → Auth → Providers. These same providers also power the Plan 3 website login.
5. **Verify e2e:** add `https://artifact.host/mcp` to an MCP client → Google + GitHub sign-in → consent → owned deploy (`owner_id` set); confirm anonymous still works. Keep `NEXT_PUBLIC_SUPABASE_URL` with NO trailing slash so issuer `…/auth/v1` matches Supabase's `iss`.
6. Update `docs/mcp-connect.md` (custom-domain URLs + a "Sign in (optional)" note).

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

## 🚀 Deployed to production (Vercel, session 3)

- **Live:** `https://artifact-host-two.vercel.app` — MCP endpoint at `/mcp` (Vercel project `itaitevets-projects/artifact-host`, `prj_HlW9yIpkJmjK3TbpKAuERaRWwpQN`).
- Deployed via **Vercel CLI** (`vercel deploy --prod`); the Vercel MCP connector can't set env vars, the CLI can. Project is **CLI-linked, not git-integrated** (`.vercel/` is gitignored).
- **Production env vars set** (via `vercel env add … production`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COOKIE_SECRET`, `CRON_SECRET` (reused from `.env.local`), `APP_BASE_URL=https://artifact-host-two.vercel.app`. **Prod reuses the dev Supabase project** (`bjztcxpqchwpdsrgapqp`) — same DB for dev and prod.
- **Hobby-tier fix:** expiry cron changed hourly→daily (`0 0 * * *`) in `vercel.json` — Hobby allows only daily crons. Vercel auto-sends `Authorization: Bearer $CRON_SECRET` to the cron route, which it already checks.
- **Verified live:** streamable-HTTP client lists 3 tools, `deploy_html` works against real Supabase, returned prod URL renders with `x-robots-tag: noindex`.
- To redeploy: `vercel deploy --prod` from the repo root (CLI must be logged in: `vercel login`).

## Next steps, in order

1. **Plan 2b — OAuth:** Supabase Auth on the MCP endpoint so authed tool calls own their artifacts (`ownerId` already plumbed through schema + service). Write with `superpowers:writing-plans`, then execute.
2. **Plan 3 — Web UI** (below).
3. **Consider a custom domain** (e.g. artifact.host) on the Vercel project, and update `APP_BASE_URL` + `docs/mcp-connect.md` if so.

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
