# Element-Anchored Comments — Design Spec

**Date:** 2026-06-26
**Status:** Proposed (awaiting review)
**Builds on / fixes:** the ambient + mobile comments work. Fixes the core bug that pins drift when an artifact is viewed at a different width than it was created at, by anchoring to **content** instead of page coordinates. Also surfaces comment **editing** (backend already exists).

## Goal

Comments must anchor to the **content** they're about so they survive reflow/width changes, and so an **agent** listing comments can identify the target (which element, or which text). Replace the normalized page-coordinate anchor with element/quote anchors. Add the creation-time UX to show which element you're attaching to. Surface comment-body editing in the UI + CLI. No DB migration (anchor is stored as JSON text).

## Motivation

The old anchor was `{x,y}` = a fraction of the whole scrollable page. That is layout-dependent: a comment created on desktop lands somewhere else when the page rewraps on mobile (observed in production — pins floated below the content). The fix is to bind a comment to the DOM element (pins) or the quoted text (highlights), which track the content across any reflow.

## Decisions (from brainstorming)

- **Pins anchor to an HTML element**; **highlights re-match the quoted text**.
- **Strictly element/quote-only — no `x,y` (and no `fx,fy`, no `tag`).** If a target can't be resolved at render, the marker simply isn't drawn (the comment stays in the list/API).
- **Agentic:** each comment exposes its target — pins a readable `context` describing the element; highlights the exact `quote`.
- **Creation UX:** an element **outline** shows what you're about to comment on.
- **Surface editing** of a comment's body (in-page for the author + a CLI command).

## 1. Anchor model

```ts
type Anchor =
  | { kind: 'pin'; path: number[]; context: string }
  | { kind: 'highlight'; quote: string };
```

- **`path`** — the element-child index route from `<body>` to the target element, using element children only (`.children`, so whitespace/comment nodes don't shift indices). E.g. `[2,0,3]` = `body.children[2].children[0].children[3]`. Precise and reflow-stable (DOM structure doesn't change when text rewraps).
- **`context`** — a human/agent-readable description of the target element, for the listing and for agents to locate it in source: the element's trimmed `textContent` (≤160 chars); if empty, fall back to `alt` / `aria-label` / `title`; if still empty, `"<tagname>"`.
- **`quote`** — the highlighted text (≤280 chars); it *is* what the comment is about.

No `x,y`, no `fx,fy`, no separate `tag`. Marker position for a pin is the **element's top-left corner** (the outline already conveys the whole element, so within-element precision isn't needed and wouldn't be reflow-stable anyway).

### Validation & parsing
- `coerceAnchor(raw)` (HTTP input → Anchor | null): for `pin`, require `path` = array of finite non-negative integers (cap length 60) and coerce `context` to a string (cap 160); for `highlight`, require a non-empty `quote` (cap 280). Anything else → null (400).
- `parseAnchor(rawJSON)` (DB → Anchor): tolerant; returns a valid `pin`/`highlight` when the stored JSON matches, otherwise a render-skippable sentinel (`{ kind:'pin', path:[], context:'' }`) so legacy `x,y`-only rows never throw and simply don't render. **Remove all `x,y` handling** from the type and from `parseAnchor`.

## 2. Capture (in the iframe runtime)

- **Pin** (`onClick`, comment mode): the target is the clicked element (`ev.target`, an artifact element). Compute `path` by walking `parentElement` up to `<body>`, recording `indexOf` within each parent's `.children`. Compute `context` via a `describe(el)` helper (text → alt/aria-label/title → `<tag>`, trimmed/capped). Emit `create-comment` with `{kind:'pin', path, context}`.
- **Highlight** (selection → "💬 Comment"): unchanged shape — `{kind:'highlight', quote}` (quote captured from the selection, ≤280).

## 3. Render / resolution (in the runtime)

- **Pin:** resolve `path` by walking `body.children[i]` for each index; if every step resolves to an element, place the marker at that element's **top-left** in document coords (`rect.left+scrollX`, `rect.top+scrollY`). If any step fails → skip (don't draw).
- **Highlight:** find the first occurrence of `quote` in the document's text (a `TreeWalker` over text nodes, accumulating text, locating the substring, mapping back to a `Range`); place the marker at the range's top-left. If not found → skip.
- Re-resolve on `render` (i.e. on every `render-comments`) and on `resize`, so markers track the content across width changes. (This is the bug fix.)

## 4. Creation UX — element outline

In comment mode, a translucent amber **outline overlay** (a `pointer-events:none` box in the Shadow root) shows the target element:
- **Desktop:** follows the mouse — on `mousemove` (throttled via `requestAnimationFrame`), `document.elementFromPoint` (sees through the `pointer-events:none` overlay; our host is excluded) → outline that element's rect. On click, that element becomes the pin target and the outline **stays on it while the composer is open**.
- **Mobile:** no hover — on tap, outline the tapped element and open the composer (sheet); the outline persists while composing so you see the attachment.
- Outline clears on post / cancel / leaving comment mode. (Text-highlight flow unchanged: select → "💬 Comment".)

**frontend-design** drives the outline's exact styling (subtle amber border + faint fill, matching the brand) and the edit affordance below.

## 5. Comment editing (surface the existing backend)

Backend `editCommentBody` + `PATCH {body}` (author-only) already exist; expose them.
- **Capability flag:** add `can_edit` to the comment caps (author-only: `viewer.ownerId === comment.authorId`, gated by `canRead`), mirroring how `can_resolve`/`can_delete` are computed and serialized (`can_edit` in the comment JSON; booleans only, no identity leak).
- **In-page (author):** the comment card/sheet gains an **Edit** action (shown only when `can_edit`). Edit turns the body into an inline textarea with **Save/Cancel**; Save `PATCH`es `{body}` and re-renders. Via a new `edit-comment {id, body}` intent (iframe → parent), consistent with the existing `resolve-comment`/`delete-comment` intents — the parent holds the token and performs the authenticated `PATCH`. frontend-design styles it to match the existing card actions on both desktop popover and mobile sheet.
- **CLI:** add a command to edit a comment body, e.g. `artifact comment edit <slug> <id> "<new body>"` → `PATCH /api/artifacts/<slug>/comments/<id>` with `{body}` (token auth). Exact command wording finalized in the plan against the existing CLI dispatch.

## 6. Agent-facing listing

`comments` API + `comments --json` + the human CLI listing already include the full `anchor`. With the new model the agent now gets, per comment: the **body** plus its **target** — for pins `anchor.context` (element description) and for highlights `anchor.quote`. The human CLI's location column shows `context` for pins (replacing the old `@x%,y%`) and the quote for highlights.

## 7. Files touched

- `lib/artifacts/comment-types.ts` — `Anchor` type (drop `x,y`); `coerceAnchor`/`parseAnchor` for the new shapes.
- `lib/comments/annotation-runtime.ts` — capture (path + context, `describe`), render (path resolve + quote TreeWalker, marker at element top-left), element-outline overlay, inline edit affordance, `edit-comment` intent.
- `components/comments/CommentableArtifact.tsx` — handle `edit-comment` intent (authenticated `PATCH {body}` + reload); pass `can_edit` through into `render-comments`.
- `lib/artifacts/comment-service.ts` — add `can_edit` to `commentCaps`.
- `lib/http/comment-json.ts` — serialize `can_edit`.
- `cli/src/cli.js` + `commands.js` — pin location → `context`; new comment-edit command.
- Tests + docs (README/`/docs` mention edit + the agentic "comments are anchored to elements/text" framing).

## 8. Testing

- **Unit:** `coerceAnchor`/`parseAnchor` — accepts new pin/highlight shapes; rejects bad `path`; legacy `x,y` JSON parses to the skip sentinel without throwing. `commentCaps` — `can_edit` true only for the author. `commentToJson` — emits `can_edit`, still no email/id.
- **Runtime unit:** `buildAnnotationScript` emits the new behaviors (path capture, `describe`, element-outline, `edit-comment`, quote `TreeWalker`); no `x,y`.
- **Playwright — cross-width regression (the headline guard):** create a comment at **desktop** width, reload at **mobile** width, and assert the marker resolves onto its element (the bug this fixes). Plus: the element-outline appears in comment mode; in-page **edit** updates the body.
- **Regression:** existing desktop + mobile e2e stay green (pin create/hover/resolve/delete, highlight). The 2 desktop-created demo pins are `x,y`-only and will stop rendering — they'll be **re-created** post-deploy (the Orbit highlight keeps working via quote rematch).
- **Manual:** deploy, re-create demo pins, verify a comment created on desktop renders on its element on mobile and vice-versa; edit a comment in-page and via CLI.

## 9. Security / scope

Unchanged boundary: token never enters the iframe; sandbox unchanged; the `context`/`path`/`quote` are non-sensitive content the artifact owner already controls. No DB migration (anchor stored as JSON text; `comments_enabled`, roles, etc. untouched). Editing is author-only, enforced server-side (UI/CLI gating is convenience).

## 10. Out of scope / minor

- The `nonce` stays as a cheap hygiene filter (no longer load-bearing; not worth removing).
- Multiple identical quotes: highlight rematch uses the **first** occurrence (acceptable).
- Re-anchoring artifacts that mutate their own DOM after load is best-effort (resolve on next render/resize).
