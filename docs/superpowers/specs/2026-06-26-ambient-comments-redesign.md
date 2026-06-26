# Ambient Comments Redesign — Design Spec

**Date:** 2026-06-26
**Status:** Proposed (awaiting review)
**Supersedes the viewer/UI portion of:** `2026-06-26-comments-annotations-design.md` (§7 sidebar UI). Data model, authz, REST API, CLI, and the injected-runtime *concept* from that spec remain in force.

## Goal

Make in-page commenting **non-intrusive**: a comment-enabled artifact must render **full-bleed, at the same width as a normal artifact** — no sidebar, no width reflow, no layout shift. Comments surface as **small pin markers** on the artifact; **hovering a pin reveals the comment**. Adding/resolving/deleting still happen in-page, through lightweight floating UI rather than a panel.

## Motivation

The shipped v1 renders the artifact in a flex row beside a fixed **320px sidebar** (`CommentableArtifact.module.css` `.sidebar`). That shrinks the artifact's usable width and changes how the author's HTML looks — unacceptable for a tool whose whole job is faithful rendering. We remove the sidebar entirely.

## Scope

**Purely a client/presentation change, plus one small additive API enrichment.** No database migration. No change to: the `comments` schema, `comment-service` authz, REST endpoint routes/verbs, the CLI `comments` command, the `pin`/`highlight` anchor model, or the `author_name`-only privacy rule.

- **Backend (additive only):** the comment JSON gains viewer-relative capability booleans so the UI shows only the actions the viewer may perform (see §5).
- **Client (rewrite):** `lib/comments/annotation-runtime.ts` and `components/comments/CommentableArtifact.tsx` (+ its CSS). The old sidebar DOM/CSS is deleted.

**Out of scope (confirmed):** comment replies/threads, keyboard navigation between pins, true in-page text-highlight underlining, real-time/multiplayer updates. One comment per pin, as today.

## 1. Rendering architecture

**All comment UI — markers, hover tooltip, and the inline composer — renders inside the sandboxed iframe runtime, in the artifact's own coordinate space.** This gives perfect pin anchoring and natural scrolling (the tooltip/composer move with the content; nothing to reposition or close on scroll). The **parent holds only the auth token and performs the authenticated API calls**; the iframe relays write *intents* and the parent commits them.

### What crosses the boundary
- **Into the iframe:** pin **anchors** (to draw markers) and, for display, the comment **body / author_name / quote / capability flags**. Comment text in the iframe is **not a meaningful leak** — every comment is on an artifact its owner already fully controls.
- **Out of the iframe:** write **intents** — `create-comment {body, anchor}`, `resolve-comment {id}`, `delete-comment {id}` — plus lifecycle pings (`ready`). The parent performs the real fetch with the token.
- **Never crosses:** the **auth token** and **raw emails**. Token theft = account compromise, so the iframe keeps `sandbox="allow-scripts allow-popups allow-forms"` — **no `allow-same-origin`**, exactly as today. The parent never sends the token in; it only sends already-public comment data and receives intents.

### Accepted risk (explicit product decision)
Because write controls live inside the iframe, a **hostile artifact** (whose own JS shares the iframe context and could steal the message nonce) could **forge** `create`/`resolve`/`delete` intents, causing the parent to perform those writes with the viewer's token. **Impact is deliberately accepted as negligible:** it is limited to comment-integrity mischief (spam/resolve/delete) on an artifact the attacker *already owns*, is fully recoverable via API, and exposes **no token, no account, and nothing on other artifacts**. We do **not** mitigate this. (Were write-integrity ever to matter, the fix is to move the action controls to parent-rendered overlays — noted for posterity, not planned.)

## 2. Message protocol (parent ↔ iframe, nonce-tagged)

All messages carry `nonce`; both sides drop mismatches. (With the risk above accepted, the nonce is just a hygiene filter, not a security control.)

**Parent → iframe**
- `render-comments { comments: [{ id, anchor, body, author_name, quote, can_resolve, can_delete }] }` — **open comments only** (resolved omitted → their markers vanish).
- `set-mode { mode: 'idle' | 'commenting' }` — toggles crosshair + click/selection capture.
- `auth-state { canPost: boolean }` — lets the in-iframe composer show "Sign in to comment" without a round trip.
- `write-result { ok, error? }` — optional feedback so the composer can show an error / clear on success.

**Iframe → parent**
- `ready` — runtime mounted; parent replies with `auth-state` + `render-comments`.
- `create-comment { body, anchor }` — composer submitted. Parent POSTs with the token, re-fetches, re-sends `render-comments`.
- `resolve-comment { id }` — parent PATCHes `resolved:true`, re-fetches, re-renders (the marker disappears).
- `delete-comment { id }` — parent DELETEs, re-fetches, re-renders.

## 3. UI components (all in-iframe; styled with frontend-design + brand tokens)

The injected UI is isolated from the artifact's own CSS via a **Shadow root** (preferred) or inline styles, so the artifact can't restyle or hide it. Visuals use the brand tokens from `app/globals.css` (`--ink`, `--amber`, `--rule`, `--bg`, `--serif`, `--mono`). **The `frontend-design` skill drives the visual design of every element below.**

### 3a. Markers
- Small **unnumbered** amber teardrop/dot (slightly smaller than today's 22px), with a `box-shadow` for legibility over any background, max `z-index`.
- Hover/active: subtle grow + raise; pointer cursor.
- `pin` and `highlight` anchors use the same marker; a highlight's stored `quote` shows in the tooltip.

### 3b. Tooltip
- Appears on marker **hover**, anchored next to the marker, clamped within the iframe viewport.
- Content: **author name**, the **quote** (if a highlight), the **full body** (internal scroll if long).
- **Interactive:** moving the pointer into it cancels the ~200ms close timer, so the user can read and act. **Click/tap a marker = sticky open** (survives mouse-out; the touch path) until click-away / Esc.
- **Permission-gated actions** (see §5): **Resolve** (→ marker disappears) and **Delete**, rendered only when `can_resolve` / `can_delete` are true. No buttons a viewer can't use.

### 3c. Composer
- Opens at the new pin/selection location when, in comment mode, the user clicks (pin) or selects text (highlight).
- Textarea + **Post** / **Cancel**; Esc / click-away cancels.
- Signed-out (`canPost:false`): the user may type, but **Post** shows inline **"Sign in to comment"** with a link to sign in.
- On success: composer closes; parent re-renders with the new marker.

### 3d. Pill (the one piece of parent chrome)
- Fixed **bottom-right**, rendered by the parent (it owns the open-comment count from the fetch and the comment-mode state). Shows the **open** count (e.g. "💬 3"); zero-state styled/hidden when none.
- Click toggles **comment mode** (`set-mode`), with a pressed state.
- Kept in the parent only because it is persistent chrome that needs the live count + mode state; everything else is in the iframe.

## 4. States & edge cases

- **Resolved comments:** hidden in-page (never sent in `render-comments`). Resolve removes the marker immediately. **Reopen is via CLI/API only** (confirmed).
- **Signed-out viewer:** sees all open markers + tooltips (read), sees the pill count, may open the composer, gated at Post.
- **Touch/mobile:** tap marker = sticky tooltip; tap-away closes. Comment mode via the pill; tap = pin (text-selection highlight is best-effort on touch).
- **Comments-disabled artifacts:** unchanged — still the bare `position:fixed; inset:0` iframe in `app/a/[slug]/page.tsx`, byte-for-byte as today.
- **Viewport clamping:** tooltip/composer shift to stay within the iframe viewport near edges.

## 5. Backend change — viewer-relative capability flags (additive, no migration)

The comments `GET`/`POST` responses already resolve the viewer (`viewerFromRequest` in `app/api/artifacts/[slug]/comments/route.ts`). Today `commentToJson` (`lib/http/comment-json.ts`) returns no identity, so the UI can't tell who may act. We enrich the wire shape:

```ts
// lib/http/comment-json.ts — commentToJson(c, viewerCtx)
{
  id, body, anchor, author_name, resolved, created_at, // unchanged
  can_resolve: boolean,  // viewer is owner, or has comment access (mirrors service authz)
  can_delete:  boolean,  // viewer is the author, or the artifact owner
}
```

- Computed from the already-known viewer + the stored `authorId` / artifact `ownerId` — **booleans only; never the email or author id** (privacy rule intact).
- The flags **mirror** `comment-service` authz so the UI and the enforced rule agree; the service remains the source of truth (UI gating is convenience, not security).
- `commentToJson` gains a context arg; the two comment routes pass the viewer context. CLI JSON may include the flags harmlessly (an agent ignores them) — lean: include; finalize at plan time.

No other backend file changes.

## 6. Files touched

- **Rewrite** `lib/comments/annotation-runtime.ts` — markers + hover/sticky tooltip + inline composer + comment-mode click/selection capture, all inside a Shadow root; emits/consumes the §2 messages. (Grows substantially; consider splitting helper builders within the file but keep it one injected IIFE string.)
- **Rewrite** `components/comments/CommentableArtifact.tsx` — drop the sidebar; become the bridge + pill host: holds the token, fetches comments, sends `render-comments` + `auth-state`, performs writes on relayed intents, renders the floating pill.
- **Replace** `components/comments/CommentableArtifact.module.css` — remove sidebar/list/composer styles; keep only pill styles (the rest of the UI is in-iframe, styled by the runtime).
- **Edit** `lib/http/comment-json.ts` — capability flags + context arg.
- **Edit** `app/api/artifacts/[slug]/comments/route.ts` and `.../[id]/route.ts` — pass viewer context to `commentToJson`.
- `app/a/[slug]/page.tsx` — unchanged.

## 7. Security posture (summary)

- **Token:** never leaves the parent; no `allow-same-origin`. Unchanged invariant.
- **Comment text in the iframe:** accepted (not a meaningful leak — see §1).
- **Forged write intents from a hostile artifact:** accepted as negligible (see §1) — no token/account/cross-artifact impact; recoverable.
- **Nonce:** retained as a hygiene filter only. The old "guessable `useId` nonce" follow-up is now moot for security.

## 8. Testing

- **Unit (vitest + jsdom):** `commentToJson` capability flags across viewer roles (owner / author / comment-access / anonymous) — booleans correct, no email/id ever present.
- **Runtime unit:** `buildAnnotationScript` emits/handles the new message types; mode toggling; resolved comments absent from render; composer respects `auth-state`.
- **Playwright (`e2e-browser/`):** full-bleed render (no sidebar; iframe ≈ viewport width); pill toggles comment mode; click → in-iframe composer → Post → marker appears; hover marker → tooltip with body; resolve → marker disappears; signed-out → "Sign in to comment". Reuse the in-iframe real-`mouseup` selection technique (from cloud testing) for the highlight path.
- **Regression:** comments-disabled artifact renders byte-for-byte as before; existing comment API/CLI tests stay green.

## 9. Open items / minor

- Shadow root vs inline styles for the in-iframe UI — prefer Shadow root; confirm cross-browser at build.
- Exact close-delay timing and tooltip placement (above/below marker) — frontend-design call.
- Whether CLI JSON includes the new flags — lean yes (truthful), finalize in plan.
- Multiple near-overlapping pins: acceptable as-is for v2; clustering is a future idea.
