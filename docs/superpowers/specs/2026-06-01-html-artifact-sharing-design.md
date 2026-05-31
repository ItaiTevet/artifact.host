# HTML Artifact Sharing — Design Spec

**Date:** 2026-06-01
**Status:** Approved design, ready for implementation planning
**One-line pitch:** *"Paste your AI's HTML, get a live link. One MCP call. Expires when you want."*

---

## Context

AI tools (Claude, ChatGPT/Codex, Cursor, etc.) increasingly emit standalone HTML as their primary output, but there is no frictionless way to share it as a *rendered* webpage. Raw `.html` files are inconvenient to open; cloud storage forces downloads or shows source; existing single-file hosts lack an MCP/API layer, require file uploads, gate basics behind paywalls, or have no ownership model.

This project fills a narrow niche perfectly: **a single MCP tool that takes an HTML string and returns a live, short URL.** It is explicitly *not* a general web host — no builds, no multi-file sites, no serverless functions, no storage/bandwidth arms race. Static single-file serving keeps it instant, secure, and near-zero cost, which is what makes a side project survivable.

---

## Scope decisions (from brainstorming)

| Area | Decision | Rationale |
|------|----------|-----------|
| **Framework** | Next.js (TypeScript), App Router | Full-stack, Vercel-native, fits API + MCP + UI in one app |
| **Hosting** | Vercel | Zero-config Next.js deploys; free tier covers a side project; serverless fits tiny-file serving |
| **Auth + DB + (no) storage** | Supabase (Auth + Postgres). **HTML stored as Postgres `TEXT`, no blob store** | One service, one dashboard. We must proxy every view anyway (password gate, analytics, `X-Robots-Tag`), so a CDN/blob layer adds no benefit. 5MB cap × 30-day TTL keeps Postgres trivial. Expiry becomes a simple `DELETE`. |
| **MCP delivery** | **Hosted MCP endpoint** as a `/mcp` route in the Next.js app (MCP SDK streamable HTTP transport) + a thin `npx artifact-host-mcp` stdio shim for local clients | Users add one config block; works on Vercel serverless |
| **UI aesthetic** | Radical-minimal, light mode, "technical editorial" — **Lora** (italic serif) for headline/logo/primary button, **JetBrains Mono** for everything else. Warm off-white `#fefdfb`, near-black ink, amber `#b36b20` single accent | Distinctive, non-generic; see mockup |

**Final homepage mockup:** `docs/superpowers/specs/2026-06-01-homepage-mockup.html` (self-tested in browser).

---

## Architecture

Single Next.js app on Vercel, talking to Supabase.

```
┌─────────────────────────────────────────────────────────┐
│  Next.js app (Vercel)                                    │
│                                                          │
│  /                     Homepage: platform picker +       │
│                        connect snippet + manual paste    │
│  /a/[slug]             Artifact viewer (proxied render)  │
│  /a/[slug]/password    Password gate (server-enforced)   │
│  /dashboard            Authed: manage own artifacts      │
│                                                          │
│  /api/deploy           POST  → create artifact           │
│  /api/artifacts/[slug] PATCH → update content / visibility│
│  /api/artifacts/[slug]/og   OG card + screenshot meta    │
│  /mcp                  MCP streamable-HTTP endpoint       │
│                        (deploy_html, update_html,         │
│                         set_visibility)                  │
└───────────────┬─────────────────────────────────────────┘
                │
        ┌───────▼────────┐
        │   Supabase     │
        │  Auth + Postgres (artifacts table; HTML in TEXT) │
        └────────────────┘
```

**Component boundaries (each independently testable):**

1. **Core service layer** (`lib/artifacts/`) — pure domain logic: slug generation, TTL resolution, size validation, hashing, ownership/edit-token checks. No HTTP, no framework. This is the heart and must be unit-testable in isolation.
2. **Data access** (`lib/db/`) — Supabase queries. One module, well-defined functions (`createArtifact`, `getBySlug`, `updateContent`, `setVisibility`, `incrementViews`, `deleteExpired`).
3. **HTTP API routes** (`app/api/`) — thin adapters over the service layer.
4. **MCP route** (`app/mcp/`) — thin adapter exposing the same service layer as MCP tools.
5. **Viewer** (`app/a/[slug]/`) — server-rendered proxy that enforces visibility and sets headers.
6. **Web UI** (`app/`, `components/`) — homepage + dashboard.

The API routes and the MCP route are **two adapters over one service layer** — this is the key design property. Business rules live in exactly one place.

---

## Data model

Single primary table, designed for the full feature set from day one (including claimable anonymous artifacts, even though claim UI ships later).

```sql
create table artifacts (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,           -- short, e.g. "x7k2"
  content       text not null,                  -- the HTML (<= 5MB enforced in app)
  title         text,                           -- parsed from <title> for OG cards

  visibility    text not null default 'public', -- 'public' | 'password'  (enum, extensible)
  password_hash text,                           -- bcrypt/argon2; null unless password-protected

  owner_id      uuid references auth.users(id), -- null for anonymous deploys
  edit_token_hash text not null,                -- hash of edit token; the anon credential

  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,           -- set ONCE at deploy, never reset on update
  view_count    bigint not null default 0
);

create index on artifacts (expires_at);         -- for expiry sweeps
create index on artifacts (owner_id);           -- for dashboard listing
```

**Notes:**
- `edit_token_hash` stored, never the raw token (shown once at deploy). `owner_id` + `edit_token_hash` together support Option C ownership.
- `password_hash` only — never plaintext.
- `expires_at` is anchored to first deploy; updates never touch it.
- "Claimable anonymous" = later, attach `owner_id` to a row by presenting a valid edit token. Schema already supports it; no migration needed.

---

## Feature behaviors

### Deploy (`deploy_html` / `POST /api/deploy`)
- Input: `content`, `visibility="public"`, `password=null`, `ttl="7d"`.
- Validate size ≤ 5MB → reject otherwise.
- Generate a short, non-trivial-to-guess slug (collision-checked).
- Resolve `ttl` ∈ `{1h, 1d, 7d, 30d}` → `expires_at = now() + ttl` (30d max, no permanent).
- Parse `<title>` for OG card.
- Generate an edit token; store only its hash.
- If request is authenticated, set `owner_id`; **always** return an edit token.
- Returns `{ slug, url, edit_token, expires_at }`.

### Update in place (`update_html` / `PATCH`)
- Auth: requester must present a **matching owner key OR a valid edit token**.
- Replaces `content` (re-validates 5MB); same slug, same URL.
- **`expires_at` is unchanged** — TTL never resets. `ttl` is not accepted here.
- Returns `{ slug, url, expires_at }`.

### Visibility (`set_visibility` / `PATCH`)
- `visibility ∈ {public, password}` (v1). `restricted` (email allowlist) reserved for paid tier — enum leaves room, no breaking change.
- Setting `password` stores only a hash.

### Viewing (`GET /a/[slug]`)
- **Public:** render HTML directly. Functionally unlisted but called "public" everywhere.
- Always send `X-Robots-Tag: noindex`.
- **Password:** HTML is **never sent** until the password clears server-side. Gate page posts password → server verifies hash → sets a short-lived signed cookie scoped to the slug → renders. **No password in URL fragment.**
- No viewer accounts ever required.
- Increment `view_count` (lightweight analytics — "viewed N times").
- Expired or missing slug → 404/410.

### Lifecycle / cost control
- **Per-file cap: 5MB** (the real cost lever, hard ceiling).
- **TTL: 1h / 1d / 7d / 30d**, chosen at deploy, anchored to first deploy.
- **Live-artifact cap** (generous deploys, bound concurrent live count). Self-clears via expiry.
- Expiry sweep: scheduled job `DELETE FROM artifacts WHERE expires_at < now()` (Vercel Cron).
- No server-side execution — static serving only.

### Sharing niceties
- **QR code** per artifact (client-side generation from the URL).
- **OG cards** — title from `<title>`; optional screenshot thumbnail (see open question).
- **View analytics** — simple counter only.

### AI-native
- MCP tool names/descriptions tuned so agents reliably call them and surface the returned URL to the user.

---

## Web UI (v1)

Per the approved mockup:

- **Homepage** — hero (*"Share what your AI built."*), **primary CTA = platform picker** (Claude, GPT/Codex, Cursor, VS Code, Windsurf) that reveals a copy-paste connect snippet per platform; secondary **manual HTML paste** path below a divider, with TTL + visibility pills and a Deploy button. Real favicons via Google favicon service (flagged to self-host crisp logos in production).
- **Artifact viewer** — the rendered HTML (public) or password gate.
- **Dashboard** (authed) — list/manage/update own artifacts; view counts; copy URL/QR.

**Carried-over UI audit findings to address during implementation** (not blockers):
1. Mobile header collapses (logo/nav flush at ~390px) — needs responsive treatment.
2. No `:focus-visible` states — add for keyboard/a11y.
3. Favicons are a runtime third-party dependency — consider self-hosting SVG logos.
4. `⌘↵ deploy` hint needs a real key handler.
5. Decide on "Always free" copy given a future paid tier.

---

## Explicit non-goals (v1)

Custom domains · multi-file/ZIP · build pipelines · serverless/edge functions for users · email-allowlist (`restricted`) sharing · team/collab · competing on bandwidth/storage/throughput.

---

## Open questions for the implementation plan

1. **OG screenshot thumbnails** — true screenshots need a headless browser, which doesn't fit Vercel serverless cleanly. Options: (a) ship v1 with title-only OG cards, add screenshots later via a separate service; (b) use a third-party screenshot API. **Leaning (a)** to stay in scope.
2. **Live-artifact cap value** — what's the concrete number (per account / per anon)? Pick a generous default.
3. **Rate limiting** on deploy to prevent abuse (anon especially) — approach (IP-based? Supabase-backed counter?).
4. **MCP auth** — how does an authenticated user's MCP calls associate to their account vs. anonymous (API key in MCP config?).
```
