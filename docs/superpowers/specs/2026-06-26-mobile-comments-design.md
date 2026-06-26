# Mobile Comments — Design Spec

**Date:** 2026-06-26
**Status:** Proposed (awaiting review)
**Builds on:** `2026-06-26-ambient-comments-redesign.md` (the ambient pins + hover/tap tooltip + pill). This spec makes that feature work well on touch/mobile and adds mobile test automation.

## Goal

The comments feature must work well on phones: fix the display issues, make highlight-commenting touch-friendly, and add automated mobile coverage. The comment **data model, REST API, CLI, `author_name` privacy rule, and the iframe security boundary are unchanged.** This is a **client runtime + tests** change.

## Problems being fixed (reproduced on a 390px viewport)

1. **Highlighting is broken on touch.** The runtime captures a highlight on `mouseup`, which does not fire for native long-press text selection on mobile. The "tap = pin / drag-select = highlight" model is desktop-only.
2. **The comment card is a cramped 280px popover** on phones — a tall, narrow column that wastes the screen.
3. **The composer can be hidden by the on-screen keyboard** (it's an in-document absolutely-positioned popover; for pins low on the page the keyboard covers it).
4. **Tap targets are too small** — 18px pins and small text buttons (Resolve/Delete/Cancel/Post), below the ~44px touch minimum.

## Decisions (from brainstorming)

- **Highlight:** selection → floating **"💬 Comment"** button (selection-driven, not `mouseup`); gated by comment mode; works on touch and desktop.
- **Card presentation:** responsive — **bottom-sheet on mobile**, anchored popover on desktop.
- **Tests:** a **dedicated Playwright mobile project** (touch device) running a general mobile smoke + the comments mobile flow.
- **Selection button visibility:** only while **comment mode is on**.

## 1. Touch-friendly highlight (replaces `mouseup` capture)

Remove `onMouseUp`. Add a selection-driven flow in the runtime:

- A new Shadow-root button `selBtn` (label "💬 Comment"), hidden by default, ≥44px tap target.
- Listen on `document` for `selectionchange` and `pointerup` (covers mouse + touch). On either, if `mode === 'commenting'`, a composer/tooltip isn't already capturing, and `window.getSelection()` is non-collapsed with non-empty trimmed text:
  - Compute the selection rect (`sel.getRangeAt(0).getBoundingClientRect()`), derive the normalized `{x,y}` anchor from `docSize()`, and **cache** `pendingHighlight = { quote: text.slice(0,280), x, y }`.
  - Position `selBtn` just above the selection rect (viewport-clamped) and show it.
- **Preserving the selection on tap:** `selBtn` calls `preventDefault()` on `pointerdown`/`mousedown` so tapping it does not collapse the page selection; on `click` it reads the **cached** `pendingHighlight` (robust even if the selection clears), then `openComposer({kind:'highlight', x, y, quote})`, clears the selection, and hides `selBtn`.
- Hide `selBtn` when: the selection collapses, comment mode turns off, the composer opens, the user scrolls, or `(no selection)`.
- Desktop behavior change: drag-select now shows the same button instead of opening the composer immediately (a confirm step; more discoverable). The existing desktop e2e does not test the highlight path, so it is unaffected; the pin path (`onClick`) is unchanged.

## 2. Responsive comment card (bottom-sheet on mobile)

- `isMobile()` = `matchMedia('(max-width: 600px), (pointer: coarse)').matches`, evaluated when a card is shown.
- The single reused `pop` element gains a `sheet` class on mobile. Sheet styling (in the injected Shadow stylesheet, behind an equivalent `@media` block plus the JS-applied class for positioning):
  - `position: fixed; left: 0; right: 0; bottom: 0; width: 100%; max-width: none; max-height: 72vh; overflow: auto; border-radius: 14px 14px 0 0; box-shadow: 0 -4px 24px rgba(0,0,0,.18); padding: 16px 16px calc(16px + env(safe-area-inset-bottom));`
  - Larger type and a visible **Close** control (✕) so dismissal doesn't depend on a precise tap-outside.
- On mobile, `place()` short-circuits: apply the `sheet` class and skip the x/y popover math. On desktop, `place()` is unchanged (anchored popover).
- **Keyboard handling:** while a mobile sheet is open, bind `window.visualViewport` `resize`/`scroll` and set the sheet's `bottom` to the keyboard inset (`max(0, layoutHeight − (visualViewport.height + visualViewport.offsetTop))`) so the composer stays above the keyboard. Unbind on close.
- This sheet presentation applies to all three card types: the pin **tooltip**, the **composer**, and the **sign-in prompt**.

## 3. Bigger touch targets

- **Pins:** keep the ~18px visual dot but expand the tappable region to ~44px via a transparent `::after` overlay (`position:absolute; inset:-13px`) on the `.pin` button — no change to the anchor math.
- **Buttons:** Resolve/Delete/Cancel/Post and `selBtn` get `min-height:44px` + adequate padding on mobile (via the same `@media`/class).

## 4. Pill ↔ sheet coordination

The pill is parent chrome rendered over the iframe; a bottom sheet (inside the iframe) would otherwise overlap it. Add a tiny protocol message **iframe → parent `card { open: boolean }`**, emitted whenever the card is shown/hidden. `CommentableArtifact` hides the pill while `open` is true **and the parent is on a mobile viewport** (parent checks its own `matchMedia`); desktop keeps the pill visible. This is the only `CommentableArtifact.tsx` change.

## 5. Message protocol (delta)

Unchanged except one addition:
- **iframe → parent:** add `card { open: boolean }` (pill coordination). Existing: `ready`, `create-comment`, `resolve-comment`, `delete-comment`, `request-signin`.
- **parent → iframe:** unchanged (`render-comments`, `set-mode`, `auth-state`).

The created-comment payload is identical (`{kind:'highlight', x, y, quote}` / `{kind:'pin', x, y}`), so no API/CLI/schema change.

## 6. Files touched

- `lib/comments/annotation-runtime.ts` — main change: `selBtn` + selection flow (replacing `onMouseUp`), responsive sheet in `place()` + stylesheet, `::after` pin hit area, larger mobile buttons, `visualViewport` keyboard tracking, `card` emit, Close control.
- `components/comments/CommentableArtifact.tsx` — handle inbound `card` message; hide the pill while a sheet is open on mobile (parent `matchMedia`). No other change.
- `lib/comments/__tests__/annotation-runtime.test.ts` — assert the new emitted strings/behaviors exist (`selectionchange`, the "💬 Comment" button, `sheet`, `visualViewport`, `card`, `inset:-13px` hit area).
- `e2e-browser/playwright.config.*` — add a **mobile project** using a phone device descriptor (touch enabled).
- `e2e-browser/mobile.spec.mjs` — new mobile e2e (smoke + comments flow).
- Possibly `package.json` — a convenience script to run only the mobile project (e.g. `e2e:browser:mobile`), if it fits the existing script pattern.

## 7. Testing

**Dedicated mobile project** (Playwright `devices['iPhone 13']` or similar: `hasTouch`, `isMobile`, mobile viewport). The project runs `mobile.spec.mjs`:

- **General mobile smoke:** home page renders (hero + deploy box visible at mobile width); deploy a **public** artifact from the home page; open it and confirm the viewer renders **full-width** (iframe ≈ viewport width).
- **Comments mobile flow** (signed up via the dashboard gate, local-password mode as the other browser e2e):
  - Deploy a comment-enabled artifact; open it on mobile.
  - **Tap a pin → the bottom sheet** appears with the comment body and (as owner) Resolve/Delete.
  - Enter comment mode (pill) → **tap the page → composer sheet → fill → Post**; the new pin appears.
  - **Highlight:** drive a text selection inside the iframe (set a `Range` + dispatch `selectionchange`/`pointerup` via in-frame `evaluate`, the same technique used in cloud testing) → assert the **"💬 Comment"** button appears → tap it → composer sheet → Post → verify the comment persisted as a `highlight` (anchor kind via the API or by reopening).
  - **Resolve** from the sheet hides the pin.

**Regression:** the existing desktop browser e2e + the full unit suite stay green (desktop pin flow unchanged; desktop highlight now routes through the selection button, which the desktop spec doesn't exercise). `tsc`/`build` clean (only the 2 pre-existing `DeployPanel.test.tsx:73-74` errors).

**Manual:** after deploy, a real mobile check on prod (tap pin → sheet; long-press select → Comment button → composer above keyboard → post; resolve).

## 8. Security posture

Unchanged. Token never enters the iframe; iframe stays `sandbox="allow-scripts allow-popups allow-forms"` (no `allow-same-origin`); comment text in the iframe and forged write-intents remain the previously-accepted risks. The new `card` message carries only a boolean.

## 9. Out of scope / open minor

- Native-feeling sheet drag-to-dismiss gesture (a Close ✕ + tap-outside is enough for v1).
- Pinch-zoom interaction with anchored pins (artifacts are responsive; pins use normalized coords).
- iOS Safari `visualViewport` quirks beyond the bottom-inset adjustment — handled best-effort; the sheet remains usable without it.
