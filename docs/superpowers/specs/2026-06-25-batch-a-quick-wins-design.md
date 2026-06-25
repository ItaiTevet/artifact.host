# Batch A — Quick Wins Design (drag-drop upload · GitHub nav link · Markdown roadmap)

**Date:** 2026-06-25
**Status:** Approved, ready for implementation plan.

This is the first of two specs spun out of a 5-feature request. The larger
**Commenting / annotation** feature (with comment-vs-view permissions and comment
listing) is deferred to its own spec. A separate request item — adding a CLI
*install* command before `auth login` on the homepage — was **dropped**: the CLI
runs via `npx` with no install step required (`AgentShowcase.tsx`, `app/docs/page.tsx`
both state "No install required"), so there is no install that must precede auth.

This spec covers three independent, small features.

---

## F1 — Drag-and-drop HTML upload (homepage deploy panel)

### Goal
Let a user load HTML by dropping (or browsing to) an `.html` file, as an additional
input mode that **merges into the existing paste editor** — not a separate dropzone or
section. Homepage `DeployPanel` only (per decision; the dashboard edit page keeps
paste-only for now).

This implements existing roadmap item #5 ("Upload an HTML file instead of pasting"),
which is **retired from the roadmap** as part of this work.

### UX
- **Drop target:** the editor box (`components/home/DeployPanel.tsx`, the `.box`
  wrapping `<HtmlEditor>`). Chosen over the whole panel for predictability.
- **Drag state:** on drag-enter carrying file(s), the box enters a `dragging` state —
  a soft tint + dashed inset border + a centered overlay label
  *"Drop your HTML file to load it."* It reads as the same surface in a ready state.
- **On drop:** take the first file → validate → `FileReader.readAsText` → set the
  result into the existing `content` state via the same path paste uses
  (`onValueChange`/`setContent`). The HTML appears in the editor, syntax-highlighted,
  ready to deploy. **No new deploy logic** — it feeds the existing `POST /api/deploy`.
- **Discoverability + accessibility:** a subtle affordance near the existing
  `⌘↵ deploy` hint — *"or drop a file · browse"* — where **browse** triggers a hidden
  `<input type="file" accept=".html,.htm,text/html">`. Gives keyboard users and
  non-draggers a real path and makes the feature visible. The editor placeholder
  updates to *"Paste your HTML — or drop a file…"*.

### Guardrails (reuse existing)
- Accept only HTML: extension `.html`/`.htm` **or** MIME `text/html`. Otherwise show a
  friendly inline error via the existing `error` state / `styles.error`
  (e.g. *"That doesn't look like an HTML file."*).
- Reject files larger than the existing byte cap (`REQUEST_MAX_BYTES`, ~4.5 MB) on the
  client with an inline error; the server still validates on deploy.
- Multiple files dropped → use the first; ignore the rest.

### Code shape (for isolation + testability)
- `validateUploadFile({ name, size, type })` — a **pure** helper in `lib/web/`
  (no DOM), returns `{ ok: true } | { ok: false, error: string }`. Holds the
  type + size rules. Unit-tested directly. Imports the byte cap constant rather than
  hard-coding it.
- `FileReader` read + drag-state handling live in the component (or a small
  `useFileDrop` hook in `components/home/` / `lib/web/` returning the handlers +
  `dragging` flag). The hook is thin glue over `validateUploadFile`.
- No new dependencies.

### Out of scope
- Dashboard edit page drag-drop (paste-only stays).
- Markdown / non-HTML files (roadmap, F5).

---

## F2 (dropped) — CLI install command on the homepage

Investigated and **not implemented**. The CLI is invoked with `npx artifact-host …`,
which fetches-and-runs in one step; the homepage showcase and `/docs` both explicitly
say no install is required. There is therefore no install command that must precede
`auth login`. Recorded here so the decision is traceable. (If a soft, optional
`npm i -g artifact-host` hint for repeat users is ever wanted, that's a separate, small
future change — not part of this spec.)

---

## F4 — GitHub link in the nav

### Goal
A GitHub link in the site header, following the quiet convention used by OSS project
sites (icon-only, links to the repo).

### Design
- Add an icon-only link to the nav in `components/site/Header.tsx` (alongside `docs`
  and `AccountMenu`).
- Target: the canonical repo URL from `cli/package.json` (`repository`/`homepage`,
  i.e. `https://github.com/ItaiTevet/artifact.host`). Open in a new tab:
  `target="_blank" rel="noopener noreferrer"`, with `aria-label="GitHub repository"`
  and a `title`.
- Icon: extract the GitHub mark SVG already inlined in
  `components/dashboard/SignInGate.tsx` into a shared `GitHubMark` icon component
  (e.g. `components/ui/icons.tsx`) and use it in both Header and SignInGate (removes
  the duplicate). ~18px, muted color, hover → ink, matching the existing nav links.
- **No star count** — avoids a GitHub API call and extra state (YAGNI).

### Accepted tradeoff
The repo is currently private, so the link 404s for anyone who isn't the owner until
the repo is made public. The user explicitly accepted this ("add it now anyway").

---

## F5 — Markdown support → roadmap + docs (NOT implemented)

### Goal
Capture full Markdown artifact support as a roadmap item and update project copy to
mention it as **planned**, without claiming it is a live feature.

### Changes
1. **`docs/ROADMAP.md`** — add a new "Markdown artifact support" entry covering:
   - **Rendering:** server-side Markdown → HTML, sanitized before display.
   - **Pasting:** paste Markdown into the deploy panel.
   - **File upload:** drag-drop / browse `.md` / `.markdown` files, reusing the F1
     upload path.
   - **Syntax highlighting:** highlight fenced code blocks in the *rendered* output
     (distinct from the editor highlighting we have today).
   - Candidate libraries noted: a Markdown renderer (`markdown-it` / `marked`) + a
     sanitizer (`rehype-sanitize` / DOMPurify); Prism or Shiki for code fences.
   - Goal stated as **parity with HTML** across paste / upload / render / highlight.
2. **Retire roadmap item #5** ("Upload an HTML file instead of pasting") — delivered
   by F1. Renumber remaining items as needed.
3. **Copy updates, framed as *planned* (not live):**
   - `README.md`: a line noting Markdown support is on the roadmap.
   - `app/docs/page.tsx`: a brief "Markdown support is planned" note where formats are
     discussed.
   - Wording must make clear it is **not yet available** — no claim that Markdown works.

### Out of scope
- Any actual Markdown rendering/parsing/upload code. Explicitly deferred.

---

## Testing

- **F1:** unit tests for `validateUploadFile` (valid `.html`/`.htm`/`text/html`; reject
  wrong extension + wrong MIME; reject over-cap size; boundary at the cap). Component
  behavior (drop reads into the editor, browse input wired) verified per the project's
  existing component-test setup (`@testing-library/react` + jsdom) where practical.
- **F4:** light render assertion that the header contains a GitHub link with the
  correct `href` and accessible label; `GitHubMark` extraction doesn't change
  SignInGate rendering.
- **F5:** docs-only; no tests (verify copy is framed as "planned", not "supported").

## Rollout / risks
- F1 and F4 are additive UI; low risk. F4's only "risk" is the known private-repo 404,
  already accepted.
- F5 changes only docs/markdown/copy — no runtime behavior.
- No new npm dependencies in this batch.
