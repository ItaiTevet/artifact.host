# Ambient Comments Redesign — Design Spec

**Date:** 2026-06-26
**Status:** Proposed (awaiting review)
**Supersedes the viewer/UI portion of:** `2026-06-26-comments-annotations-design.md` (§7 sidebar UI). Data model, authz, REST API, CLI, and the injected-runtime *concept* from that spec remain in force.

## Goal

Make in-page commenting **non-intrusive**: a comment-enabled artifact must render **full-bleed, at the same width as a normal artifact** — no sidebar, no width reflow, no layout shift. Comments surface as **small pin markers** on the artifact; **hovering a pin reveals the comment**. Adding/resolving/deleting still happen in-page, but through lightweight floating UI, not a panel.

## Motivation

The shipped v1 renders the artifact in a flex row beside a fixed **320px sidebar** (`CommentableArtifact.module.css` `.sidebar`). That shrinks the artifact's usable width and changes how the author's HTML looks — unacceptable for a tool whose whole job is faithful rendering. We remove the sidebar entirely.

## Scope

**Purely a client/presentation change, plus one small additive API enrichment.** No database migration. No change to: the `comments` schema, `comment-service` authz, REST endpoint routes/verbs, the CLI `comments` command, the `pin`/`highlight` anchor model, or the `author_name`-only privacy rule.

- **Backend (additive only):** the comment JSON gains viewer-relative capability booleans so the client can show only the actions the viewer may perform (see §5).
- **Client (rewrite):** `lib/comments/annotation-runtime.ts` and `components/comments/CommentableArtifact.tsx` (+ its CSS). The old sidebar DOM/CSS is deleted.

**Out of scope (confirmed):** comment replies/threads, keyboard navigation between pins, true in-page text-highlight underlining, real-time/multiplayer updates. One comment per pin, as today.

## 1. Rendering architecture (the load-bearing decision)

**Markers render inside the sandboxed iframe; tooltip, composer, and the pill render in the parent as overlays.** The iframe relays coordinates + intent; the parent owns the token, the comment text, and every write.

### Why not render the tooltip/composer *inside* the iframe?
It looks simpler (perfect anchoring, natural scroll) and the comment **text** crossing into the sandbox is *not* a meaningful leak (every comment is on an artifact its owner already fully controls). **But** putting the **action controls** inside the iframe is unsafe: the artifact's own JS shares the iframe's JS context and can wrap `postMessage` to **steal the message nonce**, then **forge** `create`/`resolve`/`delete` messages. The parent would then execute those writes **with the viewer's token** — letting a hostile artifact delete the owner's comments or post/resolve as a collaborator. That's impersonation, a real integrity break.

Keeping all write controls in **parent DOM** makes them **unforgeable from the artifact** (the artifact cannot synthesize a click on a parent element it can't see). The iframe may freely *request* things (open composer, show tooltip) — those are harmless; only the parent's real UI commits a write. Text staying out of the iframe is then a free bonus, not the rationale.

### Trust boundary (unchanged invariant)
- **Never crosses into the iframe:** the auth token, raw emails. (Token theft = account compromise — the reason `allow-same-origin` stays off.)
- **Crosses into the iframe:** only pin **anchors** (normalized coordinates) needed to draw markers. No comment bodies, no author identity.
- **Crosses out of the iframe:** UI intents only (`ready`, `pin-hover{id,rect}`, `pin-unhover`, `anchor-proposed{anchor,rect}`, `viewport-changed`). Never a committed write.

The iframe keeps `sandbox="allow-scripts allow-popups allow-forms"` — **no `allow-same-origin`**, exactly as today.

## 2. Message protocol (parent ↔ iframe, nonce-tagged)

All messages carry `nonce`; both sides drop messages whose nonce doesn't match. (Nonce remains a cheap filter, not the security control — security comes from writes living in parent DOM.)

**Parent → iframe**
- `render-pins { pins: [{ id, anchor }] }` — **open comments only** (resolved are omitted → their pins vanish). Anchors only; no text.
- `set-mode { mode: 'idle' | 'commenting' }` — toggles crosshair + click/selection capture.

**Iframe → parent**
- `ready` — runtime mounted; parent replies with `render-pins`.
- `pin-hover { id, rect }` — pointer entered a marker; `rect` is the marker's iframe-viewport rect. Parent shows the tooltip overlay for `id` at that rect.
- `pin-unhover { id }` — pointer left the marker; parent starts the ~200ms close timer (cancelled if the pointer enters the parent tooltip).
- `pin-activate { id, rect }` — marker clicked/tapped → parent opens the tooltip **sticky** (survives mouse-out; the touch path).
- `anchor-proposed { anchor, rect }` — in comment mode, a click (pin) or text selection (highlight) produced an anchor. Parent opens the composer overlay at `rect`.
- `viewport-changed` — the iframe scrolled or resized (throttled). Parent **closes** any open tooltip/composer (their relayed `rect` is now stale). Markers themselves need no relay — they live in the iframe and scroll naturally.

Positioning math: parent screen position = `iframe.getBoundingClientRect()` offset + relayed `rect`. The iframe fills the viewport (`position:fixed; inset:0`), so the offset is effectively zero, but we compute it for correctness.

## 3. UI components (parent-rendered; styled with frontend-design + brand tokens)

All new parent UI uses the brand tokens already in `app/globals.css` (`--ink`, `--amber`, `--rule`, `--bg`, `--serif`, `--mono`) for consistency with the rest of the product. **The `frontend-design` skill drives the visual design** of every element below.

### 3a. Markers (in iframe)
- Small **unnumbered** amber teardrop/dot (a touch smaller than today's 22px), `box-shadow` for legibility over any background, `z-index` max, inline-styled (or Shadow-DOM-isolated) so the artifact's CSS can't restyle them.
- Hover/active: subtle grow + raise. Pointer cursor.
- `pin` and `highlight` anchors use the same marker; the highlight's stored `quote` shows in the tooltip.

### 3b. Tooltip (parent overlay)
- Appears on `pin-hover`; positioned adjacent to the marker, clamped to the viewport.
- Content: **author name**, the **quote** (if a highlight), the **full body** (internal scroll if long).
- **Interactive:** moving the pointer into it cancels the close timer (~200ms grace). `pin-activate` opens it **sticky** until the user clicks elsewhere / presses Esc (touch path).
- **Permission-gated actions** (see §5): **Resolve** (→ pin disappears) and **Delete**, rendered only when the viewer's capability flags allow. No buttons for users who can't act.

### 3c. Composer (parent overlay)
- Opens on `anchor-proposed`, positioned at the new pin's `rect`.
- Textarea + **Post** / **Cancel**. Esc or click-away cancels.
- Signed-out: the user may type, but **Post** shows inline **"Sign in to comment"** with a link (parent knows auth state directly — no round trip).
- On success: parent re-fetches, re-sends `render-pins`, closes the composer.

### 3d. Pill (parent chrome, fixed bottom-right)
- Shows the **open** comment count (e.g. "💬 3"); hidden or zero-state styled when none.
- Click toggles **comment mode** (`set-mode`), reflected by a pressed state + the iframe's crosshair cursor.
- Only persistent added chrome when not actively commenting.

## 4. States & edge cases

- **Resolved comments:** hidden in-page (never sent in `render-pins`). Resolve removes the pin immediately. **Reopen is via CLI/API only** (confirmed).
- **Signed-out viewer:** sees all open pins + tooltips (read), sees the pill count, may open the composer, gated at Post.
- **Touch/mobile:** tap marker = `pin-activate` (sticky tooltip); tap-away closes. Comment mode via the pill; tap = pin (text-selection highlight is best-effort on touch).
- **Scroll while a tooltip/composer is open:** `viewport-changed` closes it (avoids a detached floating box). Re-hover to reopen.
- **Viewport clamping:** tooltip/composer shift to stay on-screen near edges.
- **Comments-disabled artifacts:** unchanged — still the bare `position:fixed; inset:0` iframe (`app/a/[slug]/page.tsx`), byte-for-byte as today.

## 5. Backend change — viewer-relative capability flags (additive, no migration)

The comments `GET`/`POST` responses already resolve the viewer (`viewerFromRequest` in `app/api/artifacts/[slug]/comments/route.ts`). Today `commentToJson` (`lib/http/comment-json.ts`) returns no identity, so the client can't tell who may act. We enrich the wire shape:

```ts
// lib/http/comment-json.ts — commentToJson(c, viewerCtx)
{
  id, body, anchor, author_name, resolved, created_at, // unchanged
  can_resolve: boolean,  // viewer is owner, or has comment access (mirrors service authz)
  can_delete:  boolean,  // viewer is the author, or the artifact owner
}
```

- Computed from the already-known viewer + the stored `authorId`/artifact `ownerId` — **booleans only; never the email or author id** (privacy rule intact).
- The flags **mirror** `comment-service` authz so the UI and the enforced rule agree; the service remains the source of truth (UI gating is convenience, not security).
- `commentToJson` gains a context arg; callers (the two comment routes) pass the viewer context. The CLI's JSON output may include the flags harmlessly (an agent ignores them) — acceptable, or omit for CLI; decided at plan time (lean: include, it's just truthful data).

No other backend file changes.

## 6. Files touched

- **Rewrite** `lib/comments/annotation-runtime.ts` — markers + hover/activate detection + comment-mode click/selection capture + `viewport-changed` relay. No tooltip/composer/text inside. Marker isolation via inline styles (or a Shadow root).
- **Rewrite** `components/comments/CommentableArtifact.tsx` — drop the sidebar; become the overlay host: holds token, fetches comments, sends `render-pins`, renders pill + tooltip + composer overlays positioned from relayed rects, performs all writes.
- **Replace** `components/comments/CommentableArtifact.module.css` — remove sidebar/list/composer-in-sidebar styles; add pill/tooltip/composer-overlay styles (frontend-design).
- **Edit** `lib/http/comment-json.ts` — capability flags + context arg.
- **Edit** `app/api/artifacts/[slug]/comments/route.ts` and `.../[id]/route.ts` — pass viewer context to `commentToJson`.
- `app/a/[slug]/page.tsx` — unchanged (still renders `CommentableArtifact` when `commentsEnabled`).

## 7. Security analysis

- **Token:** never leaves the parent. Unchanged.
- **Writes:** only the parent's real DOM controls commit writes; the artifact cannot forge them. This is the core improvement over an in-iframe-actions design.
- **Forged intent messages** (`pin-hover`, `anchor-proposed`, etc.) from a hostile artifact: worst case is a tooltip/empty-composer flickering open — **no write, no token/text exposure**. Acceptable; documented.
- **Nonce:** still applied as a filter. The long-standing "guessable `useId` nonce" follow-up is **downgraded to cosmetic** by this design (nonce no longer guards any write). May still harden later (client-random nonce) but no longer security-relevant.
- **Sandbox:** `allow-scripts allow-popups allow-forms`, no `allow-same-origin`. Unchanged.

## 8. Testing

- **Unit (vitest + jsdom):** `commentToJson` capability flags across viewer roles (owner / author / comment-access / anonymous) — booleans correct, no email/id ever present. Anchor coercion unchanged.
- **Runtime unit:** `buildAnnotationScript` emits the new message types; mode toggling; resolved pins absent from render.
- **Playwright (`e2e-browser/`):** full-bleed render (no sidebar; iframe ≈ viewport width); pill toggles comment mode; click → composer overlay → Post → marker appears; hover marker → tooltip with body; resolve → marker disappears; signed-out → "Sign in to comment". Reuse the in-iframe selection technique from cloud testing (real `mouseup`) for the highlight path.
- **Regression:** comments-disabled artifact renders byte-for-byte as before; existing comment API/CLI tests stay green.

## 9. Open items / minor

- Exact close-delay timing and tooltip placement (above/below marker) — frontend-design call during build.
- Whether the CLI JSON includes the new flags — lean yes (truthful), finalize in plan.
- Multiple near-overlapping pins: acceptable as-is for v2; clustering is a future idea.
