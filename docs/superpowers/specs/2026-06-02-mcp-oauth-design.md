# MCP OAuth — Account Ownership Design Spec

**Date:** 2026-06-02
**Status:** Approved design, ready for implementation planning
**One-line pitch:** *Sign in with Google or GitHub when adding the MCP, and everything you deploy is owned by your account — anonymous use still works untouched.*

This is **Plan 2b**, building directly on the shipped anonymous MCP endpoint (`docs/superpowers/plans/2026-06-01-mcp-endpoint.md`, live at `https://artifact-host-two.vercel.app/mcp`).

---

## Context & goal

The MCP endpoint currently works **anonymously**: every deploy is owned by nobody (`owner_id = null`) and is managed via a one-time `edit_token`. The schema, service layer, and account cap for *owned* artifacts already exist (`owner_id` FK to `auth.users`, `authorize()` accepts owner-or-token, `countLiveByOwner`, `ACCOUNT_LIVE_CAP = 50`) — they are simply never exercised because nothing authenticates the caller.

**Goal:** let a user authenticate the MCP connection with **Google or GitHub**, so their tool calls set `owner_id` to their account and they can manage their own artifacts without juggling edit tokens. Concretely: adding `…/mcp` to an MCP client (Claude, Cursor, …) opens a browser window with "Sign in with Google / GitHub" + a consent screen; after approval the connection is authenticated. Unauthenticated clients keep working exactly as today.

---

## Scope

**In scope**
- Supabase OAuth 2.1 server as the Authorization Server (enable + configure).
- A consent + login page hosted in our Next app.
- Resource-server auth on `/mcp` (validate Supabase JWTs, coexist with anonymous).
- Threading the authenticated user id into the MCP tools so deploys are owned and owners can manage without an edit token.
- Google + GitHub sign-in (via Supabase Auth social providers).

**Out of scope (later plans)**
- The full web dashboard / artifact management UI (Plan 3).
- Email/password or magic-link login (only Google + GitHub for v1).
- Claiming pre-existing anonymous artifacts into an account.
- Per-scope granular permissions beyond a single "deploy & manage" scope.
- Changing the anonymous edit-token model.

---

## Architecture

Two roles, cleanly separated by the MCP authorization spec:

- **Authorization Server = Supabase.** Supabase's OAuth 2.1 server (beta, free on all plans) provides discovery, Dynamic Client Registration, the PKCE authorization-code flow, the consent hand-off, and JWT issuance. We do **not** build an authorization server.
- **Resource Server = our `/mcp` route.** It validates the access token and serves the protected-resource metadata that points clients at Supabase. Built with mcp-handler's `withMcpAuth`.

```
MCP client ─(1) POST /mcp (no token) ─▶ RS: 401 + WWW-Authenticate
   │                                      → /.well-known/oauth-protected-resource
   │                                        advertises Supabase as the auth server
   ├─(2) discover Supabase AS, self-register via DCR, begin PKCE auth-code flow
   ├─(3) browser → Supabase /auth/v1/oauth/authorize
   │        → redirects to OUR /oauth/consent?authorization_id=…
   │        → user signs in (Google / GitHub via Supabase Auth) → reviews scope → Approve
   ├─(4) Supabase issues an access token (JWT) to the client
   └─(5) client → POST /mcp  Authorization: Bearer <jwt>
                    │
                    ▼
        RS: withMcpAuth verifyToken validates the JWT via Supabase JWKS,
            extracts `sub` (user id) → AuthInfo. Tools set ownerId = user id.
            No/invalid token + required:false → anonymous edit-token path (unchanged).
```

**Relevant Supabase endpoints** (`<ref>` = `bjztcxpqchwpdsrgapqp`):
- Authorize: `https://<ref>.supabase.co/auth/v1/oauth/authorize`
- Token: `https://<ref>.supabase.co/auth/v1/oauth/token`
- JWKS: `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`
- AS discovery: `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`

---

## Components

### 1. Consent + login page — `app/oauth/consent/page.tsx` (+ a small client component)
The only substantial new UI. Supabase redirects here (path configured as `authorization_url_path`) with `?authorization_id=…`. The page:
1. Ensures a Supabase session — if none, shows **Sign in with Google** / **Sign in with GitHub** buttons (Supabase Auth `signInWithOAuth`).
2. Calls `supabase.auth.oauth.getAuthorizationDetails(authorization_id)` to fetch the requesting client + scopes.
3. Renders "Allow **artifact.host** to deploy and manage artifacts on your behalf?" with Approve / Deny.
4. Calls `supabase.auth.oauth.approveAuthorization(authorization_id)` or `denyAuthorization(...)`, which redirects back to the MCP client.

This requires a browser-side Supabase Auth client (`@supabase/supabase-js` with the **publishable** key — never the service key) and the Supabase Auth session cookies. Styling is minimal and on-brand; it is *not* the dashboard.

### 2. Resource-server auth on `/mcp` — `app/[transport]/route.ts` + `lib/mcp/auth.ts`
- New `lib/mcp/auth.ts` exports `verifyMcpToken(req, bearerToken): Promise<AuthInfo | undefined>`:
  - Returns `undefined` when there is no token (→ anonymous).
  - Validates the JWT against the Supabase **JWKS** (using `jose` `createRemoteJWKSet` + `jwtVerify`), checking signature, issuer (`https://<ref>.supabase.co/auth/v1`), and expiry.
  - On success returns `AuthInfo` with `clientId`, `scopes`, and `extra: { userId: <sub> }`.
  - On an invalid/expired/wrong-issuer token: returns `undefined` so the call degrades to anonymous rather than hard-failing (anonymous remains a first-class path). *(Alternative considered: reject invalid tokens with 401. Chosen degrade-to-anonymous because the endpoint is intentionally dual-mode; a malformed token shouldn't break a client that can still deploy anonymously.)*
- The route wraps the handler with `withMcpAuth(handler, verifyMcpToken, { required: false, resourceMetadataPath })` and serves the protected-resource metadata (mcp-handler's `protectedResourceHandler` / `generateProtectedResourceMetadata`) advertising the Supabase AS.

### 3. Ownership threading — `lib/mcp/tools.ts`, `lib/mcp/handlers.ts`
- Tool callbacks read the authenticated user id from the request (`req.auth?.extra?.userId`, populated by `withMcpAuth`).
- `deploy_html` passes `ownerId = userId` into `deployHtml` when present (→ `owner_id` set on the row; the **account cap of 50** applies via the existing `countLiveByOwner`). Anonymous deploys keep `ownerId = null` and the **anon cap of 5**.
- `update_html` / `set_visibility` pass the user id into the service's `AuthContext` (`{ ownerId: userId, editToken }`). The existing `authorize()` already grants access on **owner match OR valid edit token**, so a signed-in owner can manage their artifacts without the edit token, while edit-token access still works for everyone.

No new business logic is added to the service layer; this is wiring + passing one more value through the existing seams.

---

## Data model

**No migration required.** `artifacts.owner_id uuid references auth.users(id) on delete set null` already exists. OAuth-issued JWTs carry `sub` = the `auth.users.id`, so `owner_id = sub` satisfies the FK. The existing `artifacts_owner_id_idx` already supports owner lookups.

---

## Behaviors

| Caller | `owner_id` on deploy | Live cap | Manage (update/visibility) via |
|--------|----------------------|----------|--------------------------------|
| Authenticated (valid JWT) | the user's id | 50 (account) | owner match **or** edit token |
| Anonymous (no/invalid token) | null | 5 per IP | edit token only |

- Rate limiting (per-IP deploy window) is unchanged and applies to both.
- An authenticated `deploy_html` still returns an `edit_token` (harmless; ownership is the primary credential, the token is a fallback).

---

## Setup requirements

**Supabase project (`bjztcxpqchwpdsrgapqp`):**
- Enable the OAuth 2.1 server and **Dynamic Client Registration** (Authentication → OAuth Server; or `supabase/config.toml` `[auth.oauth_server] enabled = true`, `authorization_url_path = "/oauth/consent"`).
- Ensure **asymmetric JWT signing keys** (RS256/ES256) are active so the RS can validate via JWKS.
- Set the project **Site URL** to the production origin so the consent redirect resolves to `https://artifact-host-two.vercel.app/oauth/consent`.

**Identity providers (one-time, requires the project owner):**
- **Google:** create an OAuth client in Google Cloud Console; add Supabase's callback URL; put the client id/secret into Supabase Auth → Providers → Google.
- **GitHub:** create a GitHub OAuth app; add Supabase's callback URL; put the client id/secret into Supabase Auth → Providers → GitHub.
- The plan will include click-by-click steps; these are actions the owner performs in their own Google/GitHub accounts.

**App env vars (add to `.env.local` and Vercel production):**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — set to the project's **publishable** key (`sb_publishable_…`), used by the browser-side Supabase Auth client on the consent page. (We currently only set the service-role secret; the consent page needs this public key. `supabase-js` accepts the publishable key in the anon-key position.)
- Existing `NEXT_PUBLIC_SUPABASE_URL` is reused (issuer/JWKS derive from it).

---

## Security considerations

- **Never expose the service-role/secret key client-side.** The consent page uses only the publishable/anon key.
- Token validation is **local via JWKS** (no shared secret, no per-request network call); verify signature + issuer + expiry. Cache the JWKS (jose's remote set caches by default).
- `verifyMcpToken` must fail closed to **anonymous**, never to "trusted": an unverifiable token yields `undefined` (anonymous), not an assumed identity.
- Redirect URIs in Supabase require exact matches (no wildcards) — register the production consent/callback URLs precisely.
- The consent screen must clearly name the client and the scope being granted (Supabase surfaces these via `getAuthorizationDetails`).

---

## Testing strategy

- **Unit — `verifyMcpToken`:** no token → `undefined`; a token signed by a test key and verified against a matching local JWKS → `AuthInfo` with the right `userId`; expired/wrong-issuer/garbage → `undefined`. (Use `jose` to mint test tokens against an in-test JWKS so no network is needed.)
- **Handler/integration — ownership:** an authed `deploy_html` (auth id injected) sets `owner_id`; an authed owner can `update_html` **without** an edit token; anonymous deploy still sets `owner_id = null` and requires the edit token. Reuse the in-memory repo + in-memory MCP `Client`↔`Server` harness from Plan 2.
- **Manual / live:** add the deployed `/mcp` to a real MCP client (e.g. Claude), complete the Google and GitHub sign-in + consent, deploy, and confirm via the DB that `owner_id` is set; confirm anonymous still works.

---

## Risks / notes

- Supabase OAuth server is **beta** — acceptable for a side project; watch for API changes (e.g. the Nov-2025 MCP spec shift toward Client ID Metadata Documents over DCR — DCR remains supported).
- This introduces the **first browser-side Supabase Auth** usage in the app. Keep it isolated to the consent page so Plan 3 can build the dashboard on the same foundation.
- The consent page is a real (if small) UI surface; treat its login/approve states with the same care as the viewer's password gate.

---

## Non-goals (restated)

Custom scopes/permissions · email or magic-link login · claiming anonymous artifacts · the dashboard · changing anonymous behavior · building our own authorization server.
