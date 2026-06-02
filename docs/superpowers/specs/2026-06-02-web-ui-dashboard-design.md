# Plan 3b — Authenticated Web Dashboard (Design)

**Status:** Approved design, ready for implementation plan.
**Date:** 2026-06-02
**Builds on:** Plan 3a (public web UI, merged) and Plan 2b/MCP-OAuth (Supabase
Auth foundation, `owner_id` schema, ownership-threaded service/handlers).

## Goal

Let a signed-in user manage their own artifacts from the browser: list them, edit
the HTML, change visibility, and delete — reusing the Supabase Auth foundation and
the existing service layer, adding no new auth dependency.

## Scope

**In scope**
- Web sign-in (Google / GitHub) via the existing browser Supabase client.
- `/dashboard` — list the signed-in user's own artifacts (ledger rows).
- `/dashboard/<slug>` — dedicated edit page (replace HTML, change visibility).
- Per-artifact actions: Open, Edit, Change visibility, Delete.
- Header account state (email + Sign out, Dashboard link).

**Non-goals (deliberately deferred; see `docs/ROADMAP.md`)**
- Claiming anonymous artifacts (edit-token-only, `owner_id IS NULL`) into an account.
- Extending expiry or changing TTL — expiry stays set-once.
- Team / sharing / granular permissions.
- In-browser visual ("WYSIWYG") editing.
- Comprehensive analytics beyond the existing `view_count`.

## Architecture overview

Login uses the **existing browser Supabase client** (the same one the OAuth consent
page uses, factored into a single `lib/web/supabase-browser.ts` singleton). The
dashboard reads the session, takes `session.access_token`, and sends it as
`Authorization: Bearer <token>` to authed API routes. Each route verifies the token
with a **shared `verifySupabaseToken(bearer) → userId`** helper — extracted from the
logic already in `lib/mcp/auth.ts` so the MCP endpoint and the web API share one
audited verification path — then calls the service layer with `{ ownerId: userId }`.

Ownership is enforced **server-side, in the service layer**. A valid token that is
not the artifact's owner receives `403` and never another user's data. This keeps the
"set once, never extend expiry" and visibility business rules in one place
(`lib/artifacts/service.ts`) rather than duplicating them client-side or in RLS.

Rationale for this auth model (vs. SSR cookies or client-side RLS): it reuses three
things already built and trusted — the browser client, the JWT verification, and the
service layer — adds **zero** new dependencies, and writes **no** hand-authored RLS
policies (which would be security-critical and risk breaking the service-role
deploy/cron/viewer paths that intentionally bypass RLS). The only cost is that the
list fetches client-side (a brief loading state behind the login gate), which is
standard for a private dashboard.

## Screens

### `/dashboard` — list (ledger rows)

- **Signed-out:** in-page sign-in gate with **Sign in with Google** / **Sign in with
  GitHub** buttons (reuses the consent page's `signInWithOAuth` pattern, `redirectTo`
  back to `/dashboard`).
- **Signed-in:** artifacts owned by the current user, newest first. Each row shows:
  - Title and `/slug` (mono, amber).
  - Visibility badge (`public` / `password`).
  - Meta: `created <date>`, `expires in Nd` (humanized; reuses `lib/web/format.ts`),
    `N views`.
  - Actions: **Open** (live viewer in a new tab), **Edit** (→ `/dashboard/<slug>`),
    **⋯** menu (Change visibility shortcut, Delete).
- **Delete:** ⋯ → confirm dialog → `DELETE` → row removed on success.
- **Empty state:** "Nothing here yet" with a pointer to the homepage / connect flow.
- Expired artifacts are not listed (the list queries live artifacts only:
  `expires_at > now`).

### `/dashboard/<slug>` — edit page

- Full-width editor. Loads the artifact's current content (owner-scoped fetch).
- **HTML field:** large mono textarea prefilled with current content. Validates
  non-empty and ≤ 5 MB before saving (mirrors the deploy panel).
- **Visibility:** segmented control public ⇄ password; password field shown when
  `password` is selected.
- **Save changes:** `PATCH` content and/or visibility; on success show confirmation,
  expiry stays unchanged.
- **Cancel / back:** returns to `/dashboard`.
- **Not found / not owner / expired:** branded message, link back to dashboard.

### Header account state

- A small client island (`AccountMenu`) added to the existing site header.
- Signed-out: no account UI (header unchanged from 3a).
- Signed-in: shows the account email and **Sign out**, plus a **Dashboard** link.

## API surface

All routes run on the Node runtime and use the existing `errorResponse` mapper.

| Endpoint | New? | Purpose | Auth |
|---|---|---|---|
| `GET /api/artifacts` | new | List my artifacts (summary projection, no content) | Bearer → owner |
| `GET /api/artifacts/<slug>` | new | Fetch one artifact's content for the editor | Bearer → owner (403 if not owner) |
| `PATCH /api/artifacts/<slug>` | extend | Update content and/or visibility | Bearer → owner **or** existing `x-edit-token` |
| `DELETE /api/artifacts/<slug>` | new | Delete an owned artifact | Bearer → owner (403 if not owner) |

- `GET /api/artifacts` returns an array of summary objects:
  `{ slug, title, visibility, created_at, expires_at, view_count }` — no `content`.
- `PATCH` keeps its current edit-token path intact and **adds** the Bearer/owner path;
  when a valid owner Bearer is present it authorizes via `{ ownerId }`.
- Error contract matches the existing API: `{ error: <code>, message }` with
  appropriate status (`401` unauthenticated, `403` not owner, `404` missing/expired,
  `400` validation).

## Data layer changes (additive)

**Repository** (`lib/artifacts/repository.ts` interface + `lib/db/artifact-repository.ts`):
- `listByOwner(ownerId, now): Promise<ArtifactSummary[]>` — selects metadata columns
  only (`slug, title, visibility, created_at, expires_at, view_count`) for live
  artifacts (`owner_id = ownerId AND expires_at > now`), newest first. Avoids pulling
  5 MB content blobs for the list.
- `deleteOwned(slug, ownerId): Promise<boolean>` — deletes only when `owner_id`
  matches; returns whether a row was removed.

A new `ArtifactSummary` type (in `lib/artifacts/types.ts`) describes the list
projection. `getOwnArtifact` for the editor reuses the existing `findBySlug`.

**Service** (`lib/artifacts/service.ts`):
- `listOwnArtifacts(repo, ownerId, now)` → `ArtifactSummary[]`.
- `getOwnArtifact(repo, slug, ownerId)` → full record for the editor; throws
  not-found if missing/expired, forbidden if `ownerId` doesn't match.
- `deleteArtifact(repo, slug, { ownerId })` → owner-checked delete.
- `updateArtifact` / `setVisibility` already accept `{ ownerId, editToken }`; the new
  Bearer path exercises the `ownerId` branch. Confirm the `ownerId` branch enforces
  ownership (rejects when the record's `owner_id` differs).

Existing anonymous edit-token flows, `POST /api/deploy`, the expiry cron, and the
viewer are **untouched**.

## Shared auth helper

Extract the JWT verification from `lib/mcp/auth.ts` into
`lib/auth/supabase-token.ts`:
- `verifySupabaseToken(bearerToken?): Promise<string | undefined>` — verifies the
  Supabase access-token JWT against the project JWKS and issuer (`<SUPABASE_URL>/auth/v1`),
  returning the `sub` (user id) or `undefined` on missing/invalid/expired/wrong-issuer.
- `lib/mcp/auth.ts`'s `makeVerifyMcpToken` is refactored to build its `AuthInfo` on
  top of this helper, preserving its current fail-closed-to-anonymous behavior. No
  behavior change to the MCP endpoint.

## Component / file structure

```
app/dashboard/page.tsx              server shell → <DashboardClient/>
app/dashboard/[slug]/page.tsx       server shell → <EditClient slug=.../>
components/dashboard/
  DashboardClient.tsx               session gate + fetch list + render rows/empty/error
  ArtifactRow.tsx                   one ledger row + ⋯ menu
  SignInGate.tsx                    Google/GitHub sign-in buttons
  DeleteConfirm.tsx                 confirm dialog
  EditClient.tsx                    editor: load content, textarea, visibility, save, delete
components/site/AccountMenu.tsx     header auth-state island
lib/web/supabase-browser.ts         singleton browser Supabase client
lib/auth/supabase-token.ts          shared verifySupabaseToken (web API + MCP)
```

Reuses existing brand tokens (`app/globals.css`), `lib/web/format.ts` (expiry
humanizing), and the copy/QR primitives from Plan 3a where relevant. CSS Modules,
no framework, matching 3a conventions.

## Error handling

- **Session expired / 401:** client clears state and shows the sign-in gate.
- **403 (not owner):** "This artifact isn't yours."
- **404 (missing/expired):** "This artifact is gone or has expired," link to dashboard.
- **Network/5xx:** inline error with a retry control.
- **Save validation:** non-empty HTML and ≤ 5 MB enforced client-side before PATCH,
  with the server re-validating (defense in depth, mirrors deploy).

## Testing

- **Pure/unit (vitest, node):**
  - `verifySupabaseToken` — valid token → userId; missing/invalid/expired/wrong-issuer
    → undefined (mock JWKS as in existing MCP auth tests).
  - Repository summary projection mapping (`listByOwner` row → `ArtifactSummary`) and
    `deleteOwned` owner-match logic, via the existing repository test patterns / fake.
  - Service owner-checks (`getOwnArtifact`, `deleteArtifact`, owner branch of
    `updateArtifact`/`setVisibility`) with a fake repository: not-found, forbidden,
    success.
- **Component (vitest + jsdom, existing harness):**
  - `DashboardClient`: loading, empty, list, and expired-session → gate states with a
    mocked fetch and mocked browser client.
  - `EditClient`: load → edit → save (PATCH called with Bearer + body), visibility
    change, and delete-confirm flow.
- **Integration contract:** extend the existing Supabase adapter contract tests to
  cover `listByOwner` and `deleteOwned`.
- **Gate:** `npx tsc --noEmit` clean, `next build` clean, full suite green — same bar
  as Plan 3a.

## Dependencies & go-live

No new npm dependencies. Real end-to-end sign-in (clicking "Sign in with Google" and
landing on the dashboard) requires the OAuth providers to be enabled — that is Plan
2b Part B (Tasks 8–9: enable Supabase OAuth server, create Google/GitHub OAuth apps),
which also lights up the MCP consent flow. All 3b **code** is buildable and unit/
component-testable without Part B; only the live click-through smoke test depends on
it. Build order is therefore free: 3b can be implemented now and verified live once
Part B is done in a single go-live batch.
