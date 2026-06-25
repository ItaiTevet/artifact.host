# Batch A — Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three small, independent features — drag-and-drop HTML upload on the homepage deploy panel, a GitHub link in the site header, and Markdown support added to the roadmap/docs (not implemented).

**Architecture:** F1 adds a drop-aware overlay + browse affordance to the existing `DeployPanel` editor box, feeding the existing `content` state and deploy path; a pure `validateUploadFile` helper holds the rules. F4 extracts the existing inline `GitHubMark` SVG into a shared icon module and links it from the header. F5 is documentation-only.

**Tech Stack:** Next.js 16 (App Router), React client components, TypeScript, Vitest (+ `@testing-library/react` + jsdom for component tests), CSS modules. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-06-25-batch-a-quick-wins-design.md`

**Notes for the implementer:**
- Run tests with `npm test` (Vitest). Test files match `**/*.test.{ts,tsx}`.
- Type-check with `npx tsc --noEmit`. Build with `npm run build`.
- Commit after each task. Use multiple `-m` flags, never PowerShell here-strings.
- Path alias `@/` maps to the repo root (e.g. `@/lib/web/upload`).

---

## Task 1: Extract a shared `GitHubMark` icon

**Why:** F4 needs a GitHub icon in the header. The SVG already exists inlined in `SignInGate.tsx`. Extract it to a shared module so the header and the sign-in gate share one definition (DRY).

**Files:**
- Create: `components/ui/icons.tsx`
- Modify: `components/dashboard/SignInGate.tsx` (remove the local `GitHubMark`, import the shared one)

- [ ] **Step 1: Create the shared icon module**

Create `components/ui/icons.tsx` with the exact SVG currently in `SignInGate.tsx`:

```tsx
export function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
```

- [ ] **Step 2: Use the shared icon in `SignInGate.tsx`**

Add the import at the top (with the other imports):

```tsx
import { GitHubMark } from '@/components/ui/icons';
```

Then delete the local `function GitHubMark() { … }` definition at the bottom of `components/dashboard/SignInGate.tsx` (the `GoogleMark` function stays). The existing `<GitHubMark />` usage at line ~41 now resolves to the import.

- [ ] **Step 3: Type-check and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; all existing tests pass (no behavior change — same SVG markup).

- [ ] **Step 4: Commit**

```bash
git add components/ui/icons.tsx components/dashboard/SignInGate.tsx
git commit -m "Extract shared GitHubMark icon" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: GitHub link in the header (F4)

**Files:**
- Modify: `components/site/Header.tsx`
- Modify: `components/site/Header.module.css`
- Test: `components/site/__tests__/Header.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `components/site/__tests__/Header.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '@/components/site/Header';

describe('Header', () => {
  it('renders a GitHub repository link that opens in a new tab', () => {
    render(<Header />);
    const link = screen.getByRole('link', { name: /github repository/i });
    expect(link).toHaveAttribute('href', 'https://github.com/ItaiTevet/artifact.host');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Header`
Expected: FAIL — no link with the accessible name "github repository".

- [ ] **Step 3: Add the link to `Header.tsx`**

Add the import:

```tsx
import { GitHubMark } from '@/components/ui/icons';
```

Replace the `<nav>` block so the GitHub link sits between `docs` and the account menu:

```tsx
      <nav className={styles.nav}>
        <Link href="/docs">docs</Link>
        <a
          className={styles.iconLink}
          href="https://github.com/ItaiTevet/artifact.host"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          title="GitHub repository"
        >
          <GitHubMark size={18} />
        </a>
        <AccountMenu />
      </nav>
```

- [ ] **Step 4: Style the icon link**

Append to `components/site/Header.module.css`:

```css
.iconLink { display: inline-flex; align-items: center; color: var(--ink-2); }
.iconLink:hover { color: var(--ink); }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- Header`
Expected: PASS.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Then:

```bash
git add components/site/Header.tsx components/site/Header.module.css components/site/__tests__/Header.test.tsx
git commit -m "Add GitHub repository link to the header nav" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `validateUploadFile` pure helper (F1, logic)

**Why:** Hold the upload rules (HTML-only, size cap) in a pure, DOM-free function so they can be unit-tested directly and reused.

**Files:**
- Create: `lib/web/upload.ts`
- Test: `lib/web/__tests__/upload.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/web/__tests__/upload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateUploadFile } from '@/lib/web/upload';
import { MAX_BYTES } from '@/lib/artifacts/validate';

describe('validateUploadFile', () => {
  it('accepts .html by extension', () => {
    expect(validateUploadFile({ name: 'index.html', size: 100, type: '' })).toEqual({ ok: true });
  });
  it('accepts .htm by extension', () => {
    expect(validateUploadFile({ name: 'page.HTM', size: 100, type: '' })).toEqual({ ok: true });
  });
  it('accepts text/html by MIME even with an odd name', () => {
    expect(validateUploadFile({ name: 'download', size: 100, type: 'text/html' })).toEqual({ ok: true });
  });
  it('rejects a non-HTML extension/MIME', () => {
    const r = validateUploadFile({ name: 'photo.png', size: 100, type: 'image/png' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/html file/i);
  });
  it('accepts a file exactly at the cap', () => {
    expect(validateUploadFile({ name: 'a.html', size: MAX_BYTES, type: '' })).toEqual({ ok: true });
  });
  it('rejects a file over the cap', () => {
    const r = validateUploadFile({ name: 'a.html', size: MAX_BYTES + 1, type: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/4\.5\s?MB|too large/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- upload`
Expected: FAIL — `validateUploadFile` is not defined.

- [ ] **Step 3: Implement `validateUploadFile`**

Create `lib/web/upload.ts`:

```ts
import { MAX_BYTES } from '@/lib/artifacts/validate';

export type UploadFileMeta = { name: string; size: number; type: string };
export type UploadValidation = { ok: true } | { ok: false; error: string };

const HTML_EXT = /\.html?$/i;

/** Pure, DOM-free validation for a dropped/browsed file before we read it.
 *  Accepts HTML by extension (.html/.htm) or MIME (text/html); enforces the byte cap. */
export function validateUploadFile(file: UploadFileMeta): UploadValidation {
  const isHtml = HTML_EXT.test(file.name) || file.type === 'text/html';
  if (!isHtml) return { ok: false, error: "That doesn't look like an HTML file." };
  if (file.size > MAX_BYTES) return { ok: false, error: 'That file is too large (4.5MB max).' };
  return { ok: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- upload`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Then:

```bash
git add lib/web/upload.ts lib/web/__tests__/upload.test.ts
git commit -m "Add validateUploadFile helper for HTML file uploads" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Drag-and-drop + browse wired into `DeployPanel` (F1, UI)

**Why:** Add the drop-aware overlay and a browse affordance that read a file into the existing `content` state. Merges into the existing editor box; no new section, no new deploy logic.

**Files:**
- Modify: `components/home/DeployPanel.tsx`
- Modify: `components/home/DeployPanel.module.css`
- Test: `components/home/__tests__/DeployPanel.upload.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `components/home/__tests__/DeployPanel.upload.test.tsx`. This drives the browse `<input type="file">` (deterministic in jsdom; drag events are exercised manually in the browser). It uses the global `File` and fires a change event.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeployPanel } from '@/components/home/DeployPanel';

beforeEach(() => {
  // DeployPanel calls getAccountEmail() on mount; stub network so it resolves signed-out.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })));
});

describe('DeployPanel file upload', () => {
  it('loads a browsed .html file into the editor', async () => {
    render(<DeployPanel />);
    const input = screen.getByTestId('upload-input') as HTMLInputElement;
    const file = new File(['<h1>hi</h1>'], 'page.html', { type: 'text/html' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByDisplayValue('<h1>hi</h1>')).toBeInTheDocument();
    });
  });

  it('rejects a non-HTML file with an error and does not load it', async () => {
    render(<DeployPanel />);
    const input = screen.getByTestId('upload-input') as HTMLInputElement;
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/html file/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- DeployPanel.upload`
Expected: FAIL — no element with `data-testid="upload-input"`.

- [ ] **Step 3: Add upload state, file-read, drag handlers, and a ref**

In `components/home/DeployPanel.tsx`, update the React import and add the upload import:

```tsx
import { useState, useEffect, useRef, type KeyboardEvent, type DragEvent } from 'react';
import { validateUploadFile } from '@/lib/web/upload';
```

Inside the component, after the existing `useState` hooks, add:

```tsx
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File | undefined) {
    if (!file) return;
    const check = validateUploadFile({ name: file.name, size: file.size, type: file.type });
    if (!check.ok) { setError(check.error); return; }
    const reader = new FileReader();
    reader.onload = () => { setError(null); setContent(String(reader.result ?? '')); };
    reader.onerror = () => setError("Couldn't read that file. Try again.");
    reader.readAsText(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files?.[0]);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!dragging) setDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    // Only clear when leaving the box itself, not when moving over children.
    if (e.currentTarget === e.target) setDragging(false);
  }
```

- [ ] **Step 4: Make the editor box drop-aware and add the overlay + browse affordance**

Replace the existing editor `.box` block:

```tsx
      <div className={styles.box}>
        <HtmlEditor
          variant="light"
          value={content}
          onValueChange={setContent}
          onKeyDown={onKeyDown}
          placeholder="Paste your HTML here..."
        />
        <div className={styles.hint}>⌘↵ deploy</div>
      </div>
```

with:

```tsx
      <div
        className={`${styles.box} ${dragging ? styles.dragging : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <HtmlEditor
          variant="light"
          value={content}
          onValueChange={setContent}
          onKeyDown={onKeyDown}
          placeholder="Paste your HTML — or drop a file..."
        />
        <div className={styles.hint}>⌘↵ deploy</div>
        {dragging && <div className={styles.dropOverlay}>Drop your HTML file to load it</div>}
        <input
          ref={fileInputRef}
          data-testid="upload-input"
          type="file"
          accept=".html,.htm,text/html"
          className={styles.fileInput}
          onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
```

The `⌘↵ deploy` hint and the hidden file input live *inside* the box (above). Now add the visible **browse** affordance immediately **after** the box's closing `</div>` (i.e. between the box and the `<div className={styles.opts}>` block):

```tsx
      <button type="button" className={styles.browse} onClick={() => fileInputRef.current?.click()}>
        or drop a file · browse
      </button>
```

- [ ] **Step 5: Add styles**

Append to `components/home/DeployPanel.module.css`:

```css
.box.dragging { border-color: var(--ink); border-style: dashed; }
.dropOverlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--bg-2) 88%, transparent);
  font-family: var(--mono); font-size: 13px; color: var(--ink-2);
  border-radius: 3px; pointer-events: none; text-align: center; padding: 0 16px;
}
.fileInput { display: none; }
.browse {
  display: inline-block; margin: -6px 0 13px; padding: 0; background: none; border: none;
  font-family: var(--mono); font-size: 11px; color: var(--ink-3); cursor: pointer; letter-spacing: .02em;
}
.browse:hover { color: var(--ink-2); }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- DeployPanel.upload`
Expected: PASS (loads HTML into the editor; rejects PNG with an error).

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit`
Then:

```bash
git add components/home/DeployPanel.tsx components/home/DeployPanel.module.css components/home/__tests__/DeployPanel.upload.test.tsx
git commit -m "Add drag-and-drop + browse HTML upload to the deploy panel" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Markdown support → roadmap (F5)

**Why:** Capture full Markdown support as a roadmap item and retire the now-delivered HTML-upload item. Documentation only — no runtime code.

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Replace roadmap item #5 with the Markdown entry**

In `docs/ROADMAP.md`, replace the entire `### 5. Upload an HTML file instead of pasting` section (lines covering items 48–54: heading through "not a replacement.") with:

```markdown
### 5. Markdown artifact support
Support Markdown artifacts with full parity to HTML — paste, file upload, and rendering:
- **Rendering:** convert Markdown → HTML server-side, sanitized before display
  (the viewer iframe stays sandboxed, same as HTML artifacts).
- **Pasting:** paste Markdown into the deploy panel, like HTML today.
- **File upload:** drag-drop / browse `.md` / `.markdown` files, reusing the
  HTML file-upload path (`lib/web/upload.ts`, generalized to accept Markdown).
- **Syntax highlighting:** highlight fenced code blocks in the *rendered* output
  (distinct from the editor highlighting we use for the paste box today).
- **Libraries (candidates):** a Markdown renderer (`markdown-it` or `marked`) plus a
  sanitizer (`rehype-sanitize` or DOMPurify); Prism or Shiki for code-fence highlighting.
- Goal: parity with HTML across paste / upload / render / highlight, and updating the
  README, `/docs`, and CLI help to document the new format once it ships.

> Note: HTML file upload (formerly item #5) shipped in
> `docs/superpowers/specs/2026-06-25-batch-a-quick-wins-design.md`.
```

(Leave items #1–#4, #6, #7 as-is. The list keeps its existing numbering since we reused slot #5.)

- [ ] **Step 2: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "Roadmap: replace shipped HTML-upload item with Markdown support" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Mention planned Markdown support in README + docs (F5 copy)

**Why:** Surface the roadmap item in user-facing copy, framed clearly as **planned**, never as a live feature.

**Files:**
- Modify: `README.md`
- Modify: `app/docs/page.tsx`

- [ ] **Step 1: Add a planned-support line to the README**

In `README.md`, immediately after the bullet list (after line 7, the `**Self-hostable:**` bullet), add:

```markdown
> **Coming soon:** Markdown artifacts (paste, upload, and rendering) are on the
> [roadmap](docs/ROADMAP.md#5-markdown-artifact-support). Today, artifacts are HTML.
```

- [ ] **Step 2: Add a planned-support note to the docs page**

In `app/docs/page.tsx`, change the lede paragraph (lines 13–16) to add a clearly-planned sentence. Replace:

```tsx
        <p className={styles.lede}>
          Deploy HTML from the command line or directly over the REST API. Anonymous use is
          fully supported via a one-time edit token; no account required.
        </p>
```

with:

```tsx
        <p className={styles.lede}>
          Deploy HTML from the command line or directly over the REST API. Anonymous use is
          fully supported via a one-time edit token; no account required. Markdown artifacts
          are planned — see the <a href="https://github.com/ItaiTevet/artifact.host/blob/main/docs/ROADMAP.md">roadmap</a>.
        </p>
```

- [ ] **Step 3: Verify copy is framed as planned, not live**

Re-read both edits. Confirm neither claims Markdown currently works (words like "supported"/"available" must not apply to Markdown). Build to ensure the docs page still compiles:

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add README.md app/docs/page.tsx
git commit -m "Docs: note planned Markdown support in README and docs page" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing + new: `upload`, `Header`, `DeployPanel.upload`).

- [ ] **Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds; `/` and `/docs` in the route table.

- [ ] **Manual smoke (browser, `npm run dev`)**
  - Homepage: drag an `.html` file onto the editor box → overlay appears → content loads → Deploy works.
  - Click **browse** → file picker → pick an `.html` file → content loads.
  - Drag a `.png` → error message; content unchanged.
  - Header: GitHub icon visible; links to the repo (note: 404 until the repo is public — expected).
  - `/docs`: roadmap link present; Markdown described as planned.

---

## Spec coverage check

- F1 drag-drop + browse + overlay + guardrails → Tasks 3, 4. ✅
- F1 retire roadmap #5 → Task 5. ✅
- F4 GitHub link + shared icon → Tasks 1, 2. ✅
- F5 roadmap entry + README/docs copy (planned framing) → Tasks 5, 6. ✅
- F2 (install command) → intentionally not implemented (documented in spec). ✅
- No new npm dependencies. ✅
