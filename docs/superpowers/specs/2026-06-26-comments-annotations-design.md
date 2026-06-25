# Comments & Annotations — Design (Batch B)

**Date:** 2026-06-26
**Status:** Approved, ready for implementation plan.

The second of two specs from a 5-feature request (Batch A — drag-drop upload, GitHub
link, Markdown roadmap — already shipped). This spec covers a live commenting /
annotation system: a creator can allow comments on an artifact, viewers annotate the
rendered artifact in place, and the owner (or their AI agent) can list the comments to
act on them. Sharing gains Notion-style per-person View vs Comment roles.

---

## 1. Goals & constraints

- A creator can **opt an artifact into comments** (default off).
- A viewer can **annotate the rendered artifact in place** — drop a pin at a point, or
  highlight a text selection — and the annotation persists.
- **Sharing with specific people** supports a per-person **View** or **Comment** role
  (like Notion).
- The owner / an AI agent can **list all comments** (REST API + CLI) to act on them.
- **Hard constraint — the security boundary:** artifacts render in a sandboxed `srcDoc`
  iframe with `allow-scripts` but **no `allow-same-origin`** (see
  `app/a/[slug]/page.tsx` and `app/a/[slug]/RestrictedGate.tsx`). This neutralizes
  stored-XSS: the artifact's JS cannot reach our origin, token, cookies, or parent DOM.
  The design must preserve isolation from our origin. The only relaxation (see §4) is
  scoped to artifacts whose owner explicitly enabled comments.

Out of scope (v1): threaded replies, edit history/timestamps, a dashboard comments
page, email/push notifications, comment reactions.

---

## 2. Data model

### 2.1 New `comments` entity

A `CommentRepository` port (`lib/artifacts/comment-repository.ts`) mirrors
`ArtifactRepository`, with implementations for all three drivers (Supabase, SQLite,
Postgres) and an `InMemoryCommentRepository` fake for unit tests. `lib/db/factory.ts`
gains `getCommentRepository()` using the same lazy-load + driver-dispatch pattern as
`getArtifactRepository()`/`getTokenRepository()`.

**Table `comments`:**

| column | type | notes |
| --- | --- | --- |
| `id` | uuid / text | PK (uuid on pg/supabase, `randomUUID()` text on sqlite) |
| `artifact_slug` | text | FK → `artifacts(slug)` **on delete cascade** |
| `author_id` | text | owner-id of the signed-in author |
| `author_email` | text null | email when available; null for PAT-authored |
| `body` | text | comment text, capped at `COMMENT_MAX_BYTES` (8 KB) |
| `anchor` | text | JSON (see §2.3) |
| `resolved` | boolean | default false |
| `created_at` | timestamptz / text | |

Indexed on `artifact_slug`. Edit mutates `body` in place (no `updated_at`/edit flag, per
decision). Flat — no `parent_id`.

**Types** (`lib/artifacts/comment-types.ts`):
- `Anchor` (§2.3), `CommentRecord` (all columns, camelCase), `NewComment`
  (`{ artifactSlug, authorId, authorEmail, body, anchor }`).

**Repository methods** (`CommentRepository`):
- `insert(rec: NewComment): Promise<CommentRecord>`
- `listBySlug(slug: string): Promise<CommentRecord[]>` — ordered by `created_at` asc.
- `findById(id: string): Promise<CommentRecord | null>`
- `updateBody(id: string, body: string): Promise<CommentRecord>`
- `setResolved(id: string, resolved: boolean): Promise<CommentRecord>`
- `deleteById(id: string): Promise<boolean>`
- `deleteBySlug(slug: string): Promise<number>` — for artifact deletion/expiry on
  drivers without FK cascade (Supabase migration uses `on delete cascade`; the explicit
  method keeps parity and is used by the expiry path).

### 2.2 Artifact changes

- New column `comments_enabled boolean not null default false` on `artifacts` (all three
  schemas + a Supabase migration `0006_comments.sql`, which also creates `comments`).
- `ArtifactRecord` gains `commentsEnabled: boolean`.
- `comments_enabled` is only settable on **owned** artifacts (a signed-in deploy/owner).
  Anonymous artifacts never expose the toggle (consistent with how `restricted` is gated
  to signed-in users today).

### 2.3 Anchor model

```ts
type Anchor =
  | { kind: 'pin'; x: number; y: number }                  // x,y normalized 0..1 of document
  | { kind: 'highlight'; x: number; y: number; quote: string };
```

`x`/`y` are the annotation position normalized to the document's scroll width/height so
pins re-place correctly across viewport sizes. A `highlight` also stores the selected
`quote`. **Rendering rule:** a `highlight` re-finds its `quote` in the live DOM and wraps
the first match; if the quote is absent (artifact content changed on a later update), it
**degrades to a pin** at `x,y` rather than disappearing. The anchor is stored as a JSON
string; the runtime and service treat it as opaque except for this render rule.

### 2.4 Sharing principal role

`SharePrincipal` (`lib/artifacts/types.ts`) gains `role: 'view' | 'comment'`:

```ts
interface SharePrincipal { value: string; type: 'email' | 'domain'; role: 'view' | 'comment'; }
```

`lib/artifacts/sharing.ts` updates:
- `deserializeAllowlist` defaults missing `role` to `'view'` (back-compatible with
  existing stored allowlists).
- `serializeAllowlist` persists `role`.
- `parsePrincipals`/`formatPrincipals` keep parsing emails/domains; the structured
  per-person UI (§7) supplies the role (parser defaults to `view`).
- New `commentAllowed(email, allowlist): boolean` — true if a matching principal has
  `role === 'comment'` (mirrors the existing `emailAllowed`, which stays as the
  view-level check and now matches `view` **or** `comment`).

---

## 3. Permission & authorization model

`comments_enabled` is the master switch. When **off**, the artifact renders byte-for-byte
as today (no injected layer, no comment endpoints succeed → 404/`comments_disabled`).

When **on**:

| Action | Who is allowed |
| --- | --- |
| **Read** comments (list) | Anyone who can view the artifact (anonymous on public; password-verified on password; owner or any allowlisted principal on restricted) |
| **Post** a comment | Signed-in only. Public/password ⇒ any signed-in viewer. Restricted ⇒ owner or a principal with `comment` role |
| **Edit** body | The comment's author only |
| **Resolve / unresolve** | The artifact owner, or anyone with comment access |
| **Delete** | The comment's author, or the artifact owner |

Identity comes from the existing `viewerFromRequest` seam (`lib/http/request-auth.ts`):
session identity (carries `email`) **or** PAT → owner (no email). "Can view" is decided by
reusing `viewArtifact`'s gate; "can comment / owner" is decided in a new service layer
(§4). Posting requires a verified identity, so anonymous viewers can read but not post.

---

## 4. Annotation architecture (the injected layer)

Chosen approach: an **injected annotation runtime** inside the iframe (vs. a parent-only
coordinate overlay, which can't follow the iframe's scroll across the no-same-origin
boundary). Strict separation of concerns:

- **Iframe = spatial layer only.** When `comments_enabled`, the viewer route wraps the
  artifact HTML with our annotation runtime (`allow-scripts` stays; **`allow-same-origin`
  stays OFF**). The runtime: renders numbered pins/highlights at their anchors, captures
  a click (pin) or text selection (highlight) to compute a normalized anchor, and signals
  the parent on pin-click. It holds **no comment text and no token**, and makes **no
  network calls**.
- **Parent page = data layer.** A comment sidebar/composer rendered outside the iframe
  holds the session token, fetches/saves via the REST API (§5), and renders all comment
  **text**. The composer's "save" lives here.
- **Channel:** `window.postMessage` between parent and iframe. The parent injects a
  per-render **nonce** into the runtime; both sides tag messages with it, and the parent
  validates message `nonce` + shape before acting. (Origin is `'null'` for the
  no-same-origin srcdoc, so the nonce — not origin — is the integrity check.)

**Message protocol (minimal):**
- iframe → parent: `{ nonce, type: 'anchor-proposed', anchor }` (user clicked/selected),
  `{ nonce, type: 'pin-activated', commentId }` (user clicked an existing pin).
- parent → iframe: `{ nonce, type: 'render-pins', pins: [{ id, anchor }] }`,
  `{ nonce, type: 'set-mode', mode: 'idle' | 'commenting' }`.

**Threat model (documented in code + spec):** because the runtime shares the
no-same-origin sandbox with the artifact's own JS, a hostile artifact could tamper with
in-iframe pins or forge `anchor-proposed`/`pin-activated` messages. Worst case: it opens
an empty composer in the parent or scrolls the parent's sidebar — a nuisance, not an
escalation. It **cannot** persist a comment (save is parent-side and requires an explicit
user action with the parent-held token), cannot read comment text (text never enters the
iframe), and cannot reach our origin, token, cookies, or parent DOM (no `allow-same-origin`).
This relaxation is opt-in per artifact; comment-disabled artifacts keep full isolation.

---

## 5. REST API

All under `app/api/artifacts/[slug]/comments/`. All reuse `viewerFromRequest`. When the
artifact has `comments_enabled === false`, comment routes respond `404`/`comments_disabled`.

- **`GET …/comments`** — list. View-gated (anonymous allowed on public). Returns
  `{ comments: [{ id, body, anchor, author_email, author_id, resolved, created_at }] }`,
  ordered oldest-first. This is the agent-collaboration surface — full structured anchors
  included.
- **`POST …/comments`** — create. Requires a verified identity + post permission (§3).
  Body `{ body, anchor }`. Validates body non-empty and ≤ `COMMENT_MAX_BYTES`; validates
  anchor shape. Returns `201 { comment }`.
- **`PATCH …/comments/[id]`** — `{ body }` (author only) **or** `{ resolved }` (owner or
  comment-access). Returns `{ comment }`.
- **`DELETE …/comments/[id]`** — author or owner. Returns `{ ok: true }`.

A new `lib/artifacts/comment-service.ts` holds the framework-free logic (permission
checks built on the artifact record + viewer + the role helpers), mirroring
`lib/artifacts/service.ts`. Errors use the existing `ServiceError` codes plus
`comments_disabled` and `comment_too_large`.

**Expiry/cleanup:** the expiry cron (`app/api/cron/expire`) and artifact delete remove a
slug's comments (FK cascade on pg/supabase; explicit `deleteBySlug` on sqlite and in the
service's delete path for parity).

## 6. CLI

`artifact comments <slug>` (cli/src): lists comments for an **owned** artifact (owner
token or PAT — both resolve via the API's `viewerFromRequest`). Human-readable table by
default; `--json` emits the full records (anchor + body + author + resolved) for agents.
List-only in v1 — resolve/delete remain available via the REST API. Follows the existing
`list` command/`apiFetch` pattern (`cli/src/cli.js`, `commands.js`, `api.js`).

## 7. UI

**Deploy panel (`components/home/DeployPanel.tsx`) + dashboard editor
(`components/dashboard/EditClient.tsx`):**
- An **"Allow comments"** toggle, shown only when signed in (same gate as `restricted`).
- When visibility is `restricted`, replace the plain allowlist `<textarea>` with a
  **structured per-person editor**: an "add email or @domain" input, then one row per
  principal with a **View ⇄ Comment** segmented toggle and a remove control; helper text
  "You always have comment access." A small, focused component
  (`components/dashboard/ShareRoleEditor.tsx`) reused by both panels, backed by
  `SharePrincipal[]`. Deploy still applies restricted sharing as the follow-up `PATCH`
  it does today.

**Viewer (`app/a/[slug]`):** when `comments_enabled`, render the annotation runtime
(injected into the srcdoc) plus a parent-side **comment sidebar** (enter comment mode,
drop a pin / highlight, composer, thread list with author + body + resolve/edit/delete
per the authz matrix, and pin↔thread activation over postMessage). Reading is available
to anyone who can view; posting prompts sign-in when needed (reuse `SignInGate`). Built
with the **frontend-design** skill at implementation time. The runtime's pure anchor math
(normalize/denormalize coordinates, quote-or-degrade resolution) lives in a DOM-free
helper for unit testing.

## 8. Testing

- **Unit (vitest):** `InMemoryCommentRepository`; `comment-service` permission/authz tests
  covering the full §3 matrix across public/password/restricted; `commentAllowed` /
  allowlist role round-trip (serialize/deserialize back-compat); anchor
  normalize + quote-degrade helper. Component tests (jsdom pragma, native matchers,
  co-located) for `ShareRoleEditor` and the sidebar's non-iframe logic.
- **Integration (skips without creds):** `lib/db/__tests__/comment-repository.integration.test.ts`
  — real-DB contract for the new methods; plus an artifacts contract update for
  `comments_enabled`.
- **E2E HTTP (`e2e/flows.test.mjs`):** post → list → edit → resolve → delete; permission
  denials (anonymous post rejected; view-only principal post rejected on restricted;
  reading allowed where expected); `comments_disabled` when the toggle is off.
- **E2E browser (Playwright, `e2e-browser/`):** enable comments on an owned artifact,
  drop a pin, post a comment, reload, confirm it persists and renders.

## 9. Docs

Update `README.md` and `app/docs/page.tsx` to document commenting (the toggle, roles, the
`comments` API, and `artifact comments <slug>`). This is a live feature, so copy is
present-tense (unlike the Markdown roadmap item).

---

## 10. File map (new / modified)

**New:** `lib/artifacts/comment-types.ts`, `comment-repository.ts`, `comment-service.ts`;
`lib/db/{supabase,sqlite,pg}-comment-repository.ts`; `lib/artifacts/__tests__/in-memory-comment-repository.ts`;
`app/api/artifacts/[slug]/comments/route.ts` + `[id]/route.ts`;
`components/dashboard/ShareRoleEditor.tsx`; viewer annotation runtime + sidebar components
under `app/a/[slug]/`; runtime anchor helper (DOM-free) under `lib/web/`;
`supabase/migrations/0006_comments.sql`; CLI `comments` command; integration + e2e tests.

**Modified:** `lib/artifacts/types.ts` (`SharePrincipal.role`, `ArtifactRecord.commentsEnabled`),
`sharing.ts` (`role` + `commentAllowed`), `repository.ts` (+`comments_enabled` plumbing),
`lib/db/{sqlite,postgres}.ts` schemas + the three artifact repos, `factory.ts`
(`getCommentRepository`), `app/a/[slug]/page.tsx` (inject runtime when enabled),
`DeployPanel.tsx` + `EditClient.tsx` (toggle + role editor), deploy/visibility API +
service (carry `comments_enabled` + roles), expiry cleanup, `README.md`,
`app/docs/page.tsx`.

## 11. Risks & decisions

- **Decided defaults (flippable):** `COMMENT_MAX_BYTES` = 8 KB; resolve allowed by owner
  **or** anyone with comment access; commenting only on **owned** artifacts.
- **Self-host parity:** every change lands in all three drivers + the Supabase migration;
  the schema bootstrap (`lib/db/{sqlite,postgres}.ts`) and the migration must agree.
- **Largest risk:** the injected runtime + postMessage protocol. Mitigated by the strict
  iframe-spatial / parent-data split, the nonce check, and keeping text + token + saves
  entirely parent-side. Phased so the runtime is the last layer, on top of a tested
  data/API/CLI foundation.
- No new npm dependencies anticipated (pins/highlights are hand-rolled DOM; markdown not
  involved).
