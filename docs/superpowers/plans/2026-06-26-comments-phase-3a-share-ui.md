# Comments & Annotations — Phase 3a: Share UI (toggle + per-person roles) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **UI tasks (1, 3, 4): invoke the `frontend-design` skill and match the existing brand tokens/components — do not introduce a divergent visual language.**

**Goal:** Let an owner turn comments on per artifact and assign per-person **View/Comment** roles, via the deploy panel and the dashboard editor — replacing the plain restricted-allowlist textarea with a Notion-style role editor.

**Architecture:** A reusable `ShareRoleEditor` client component manages a `SharePrincipal[]` (each principal carries `role: 'view' | 'comment'` from Phase 1). The deploy panel + editor gain an "Allow comments" toggle and use the editor; they send `comments_enabled` and the structured `allowlist` array through the existing artifact `POST`/`PATCH` (Phase 2 already accepts both). The editor's GET is updated to return the structured allowlist + the flag.

**Tech Stack:** React client components, CSS modules + brand tokens (`app/globals.css`), Vitest + @testing-library/react (jsdom, native matchers, co-located).

**Spec:** `docs/superpowers/specs/2026-06-26-comments-annotations-design.md` (§7 UI — deploy/editor portion). **Builds on Phase 1 + Phase 2** (branch `claude/batch-b-comments`). The annotation runtime + viewer sidebar are **Phase 3b** (separate plan); docs are **Phase 3c**.

**Conventions:**
- `@/` = repo root. `npm test` (Vitest). `npx tsc --noEmit` (ignore the 2 pre-existing `components/home/DeployPanel.test.tsx` errors). Commit per task, multiple `-m` flags.
- **Brand tokens** (`app/globals.css`): `--ink` `#0e0c09`, `--ink-2` `#5a5449`, `--ink-3` `#a09890`, `--rule` `#e2dbd2`, `--bg` `#fefdfb`, `--bg-2` `#f6f1eb`, `--amber` `#b36b20`, `--serif`, `--mono`. Reuse the existing pill pattern (see `components/home/DeployPanel.module.css` `.pill`/`.on`) for the role toggle.
- Component-test conventions: `// @vitest-environment jsdom` pragma, native matchers only (no jest-dom — use `.toBeTruthy()`, `getAttribute`, `.value`), co-located `*.test.tsx`, mock `@/lib/web/auth`.
- `SharePrincipal = { value: string; type: 'email' | 'domain'; role: 'view' | 'comment' }`. `parsePrincipals(text)` (from `@/lib/artifacts/sharing`, pure, client-safe) parses a string into principals with `role: 'view'`.

---

## Task 1: `ShareRoleEditor` component

**Files:**
- Create: `components/dashboard/ShareRoleEditor.tsx`
- Create: `components/dashboard/ShareRoleEditor.module.css`
- Test: `components/dashboard/ShareRoleEditor.test.tsx`

**Invoke the `frontend-design` skill** for the visual design, then implement to this interface and behavior. Keep it consistent with the existing pills/inputs.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/ShareRoleEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ShareRoleEditor } from './ShareRoleEditor';
import type { SharePrincipal } from '@/lib/artifacts/types';

afterEach(() => cleanup());

function setup(initial: SharePrincipal[] = []) {
  const onChange = vi.fn();
  const utils = render(<ShareRoleEditor principals={initial} onChange={onChange} />);
  return { onChange, ...utils };
}

describe('ShareRoleEditor', () => {
  it('adds an email principal (default role view) from the input on Add', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByPlaceholderText(/add email/i), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onChange).toHaveBeenCalledWith([{ value: 'alice@example.com', type: 'email', role: 'view' }]);
  });

  it('detects an @domain entry', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByPlaceholderText(/add email/i), { target: { value: '@acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onChange).toHaveBeenCalledWith([{ value: 'acme.com', type: 'domain', role: 'view' }]);
  });

  it('does not add a duplicate', () => {
    const { onChange } = setup([{ value: 'alice@example.com', type: 'email', role: 'view' }]);
    fireEvent.change(screen.getByPlaceholderText(/add email/i), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles a principal role to comment', () => {
    const { onChange } = setup([{ value: 'alice@example.com', type: 'email', role: 'view' }]);
    fireEvent.click(screen.getByRole('button', { name: /comment/i }));
    expect(onChange).toHaveBeenCalledWith([{ value: 'alice@example.com', type: 'email', role: 'comment' }]);
  });

  it('removes a principal', () => {
    const { onChange } = setup([{ value: 'alice@example.com', type: 'email', role: 'view' }]);
    fireEvent.click(screen.getByRole('button', { name: /remove alice@example.com/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- ShareRoleEditor`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `components/dashboard/ShareRoleEditor.tsx`:

```tsx
'use client';

import { useState, type KeyboardEvent } from 'react';
import { parsePrincipals } from '@/lib/artifacts/sharing';
import type { SharePrincipal } from '@/lib/artifacts/types';
import styles from './ShareRoleEditor.module.css';

const keyOf = (p: SharePrincipal) => `${p.type}:${p.value}`;

export function ShareRoleEditor({
  principals,
  onChange,
}: {
  principals: SharePrincipal[];
  onChange: (next: SharePrincipal[]) => void;
}) {
  const [input, setInput] = useState('');

  function add() {
    const parsed = parsePrincipals(input); // emails/domains, role defaults to 'view'
    if (!parsed.length) { setInput(''); return; }
    const seen = new Set(principals.map(keyOf));
    const additions = parsed.filter((p) => !seen.has(keyOf(p)));
    if (additions.length) onChange([...principals, ...additions]);
    setInput('');
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  function setRole(target: SharePrincipal, role: SharePrincipal['role']) {
    onChange(principals.map((p) => (keyOf(p) === keyOf(target) ? { ...p, role } : p)));
  }

  function remove(target: SharePrincipal) {
    onChange(principals.filter((p) => keyOf(p) !== keyOf(target)));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="Add email or @domain…"
          aria-label="Add email or domain"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <button type="button" className={styles.add} onClick={add}>Add</button>
      </div>

      <ul className={styles.list}>
        {principals.map((p) => (
          <li key={keyOf(p)} className={styles.row}>
            <span className={styles.who}>{p.type === 'domain' ? `@${p.value}` : p.value}</span>
            <span className={styles.seg}>
              <button
                type="button"
                className={p.role === 'view' ? styles.on : ''}
                aria-pressed={p.role === 'view'}
                onClick={() => setRole(p, 'view')}
              >View</button>
              <button
                type="button"
                className={p.role === 'comment' ? styles.on : ''}
                aria-pressed={p.role === 'comment'}
                onClick={() => setRole(p, 'comment')}
              >Comment</button>
            </span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${p.value}`}
              onClick={() => remove(p)}
            >×</button>
          </li>
        ))}
      </ul>

      <p className={styles.hint}>
        An email grants one person; a domain (e.g. <code>@yourcompany.com</code>) grants everyone there.
        Viewers must sign in. You always have comment access.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Style it (frontend-design; match the brand)**

Create `components/dashboard/ShareRoleEditor.module.css`. Use the brand tokens and echo the existing pill/segment look. A solid baseline (adjust with frontend-design judgment, keep tokens):

```css
.wrap { width: 100%; }
.addRow { display: flex; gap: 8px; margin-bottom: 10px; }
.input {
  flex: 1; font-family: var(--mono); font-size: 13px; color: var(--ink);
  padding: 9px 12px; border: 1px solid var(--rule); border-radius: 3px; background: var(--bg-2); outline: none;
}
.input:focus { border-color: var(--ink-2); }
.add {
  font-family: var(--mono); font-size: 12px; color: var(--ink); background: var(--bg-2);
  border: 1px solid var(--rule); border-radius: 3px; padding: 0 16px; cursor: pointer;
}
.add:hover { border-color: var(--ink-2); }
.list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; gap: 10px; }
.who { flex: 1; font-family: var(--mono); font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 999px; overflow: hidden; }
.seg button {
  font-family: var(--mono); font-size: 11px; color: var(--ink-2); background: transparent;
  border: none; padding: 4px 12px; cursor: pointer;
}
.seg button.on { background: var(--bg-2); color: var(--ink); }
.remove { background: none; border: none; color: var(--ink-3); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 4px; }
.remove:hover { color: var(--ink); }
.hint { font-size: 12px; color: var(--ink-3); line-height: 1.6; margin-top: 8px; }
```

- [ ] **Step 5: Run tests + type-check + commit**

Run: `npm test -- ShareRoleEditor` → PASS (5). `npx tsc --noEmit` → clean.

```bash
git add components/dashboard/ShareRoleEditor.tsx components/dashboard/ShareRoleEditor.module.css components/dashboard/ShareRoleEditor.test.tsx
git commit -m "Comments: ShareRoleEditor (per-person view/comment roles)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Editor GET returns the structured allowlist + comments_enabled

The editor needs roles (and the toggle state) to populate the UI, but the GET route currently returns `allowlist` as a role-less formatted string. Return the structured array + the flag instead.

**Files:**
- Modify: `app/api/artifacts/[slug]/route.ts` (the `GET` handler)

- [ ] **Step 1: Update the GET response**

In `app/api/artifacts/[slug]/route.ts`, the `GET` handler currently returns `allowlist: formatPrincipals(rec.shareAllowlist)`. Change the returned object to send the structured allowlist and the flag (remove the `formatPrincipals` usage here; the import can stay if used elsewhere — if it becomes unused, remove it):

```ts
    return Response.json({
      slug: rec.slug,
      title: rec.title,
      content: rec.content,
      visibility: rec.visibility,
      allowlist: rec.shareAllowlist,          // structured SharePrincipal[] (with roles)
      comments_enabled: rec.commentsEnabled,
      expires_at: rec.expiresAt.toISOString(),
    });
```

If `formatPrincipals` is now unused in this file, remove it from the import on line 4 (keep `parsePrincipals`).

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → clean. (EditClient is updated in Task 4 to consume the array; its existing test is updated there too. `npm test` may show the EditClient test failing on the shape change — that's expected and fixed in Task 4. If you want green now, you may run only `npm test -- ShareRoleEditor` here.)

```bash
git add "app/api/artifacts/[slug]/route.ts"
git commit -m "Comments: editor GET returns structured allowlist + comments_enabled" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Note: this changes the `GET /api/artifacts/[slug]` `allowlist` field from a string to an array. The only consumer is `EditClient` (Task 4).

---

## Task 3: Deploy panel — "Allow comments" toggle + role editor

**Files:**
- Modify: `components/home/DeployPanel.tsx`
- Modify: `components/home/DeployPanel.module.css`
- Modify: `components/home/DeployPanel.test.tsx`

**Invoke the `frontend-design` skill** for the toggle's look; match the existing `.pill`/`.opts` row.

- [ ] **Step 1: Add a failing test (signed-in deploy enables comments + sends roles)**

Add to `components/home/DeployPanel.test.tsx` inside the existing `describe('DeployPanel', …)` block:

```tsx
  it('signed-in: enabling comments + restricted roles sends comments_enabled and structured allowlist', async () => {
    vi.mocked(getAccountEmail).mockResolvedValue('me@example.com');
    vi.mocked(getAccessToken).mockResolvedValue('sess-token');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/deploy') {
        return new Response(JSON.stringify({ slug: 'x7k2', url: 'https://artifact.host/a/x7k2', edit_token: 'tok', expires_at: '2099-01-01T00:00:00Z' }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DeployPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^restricted$/i })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Paste your HTML/i), { target: { value: '<h1>hi</h1>' } });
    fireEvent.click(screen.getByRole('button', { name: /allow comments/i }));
    fireEvent.click(screen.getByRole('button', { name: /^restricted$/i }));
    fireEvent.change(screen.getByPlaceholderText(/add email/i), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    fireEvent.click(screen.getByRole('button', { name: /^comment$/i })); // alice → comment role (exact, not the "allow comments" toggle)
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));

    await waitFor(() => expect(calls.some((c) => c.url.includes('/api/artifacts/'))).toBe(true));
    const patches = calls.filter((c) => c.url.includes('/api/artifacts/')).map((c) => JSON.parse(c.init.body as string));
    expect(patches).toContainEqual({ comments_enabled: true });
    expect(patches).toContainEqual({ visibility: 'restricted', allowlist: [{ value: 'alice@example.com', type: 'email', role: 'comment' }] });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- DeployPanel`
Expected: the new case FAILS (no "allow comments" button / no role editor).

- [ ] **Step 3: Update DeployPanel**

In `components/home/DeployPanel.tsx`:

Add imports:

```tsx
import { ShareRoleEditor } from '@/components/dashboard/ShareRoleEditor';
import type { SharePrincipal } from '@/lib/artifacts/types';
```

Change the allowlist state from a string to principals and add a comments flag (replace `const [allowlist, setAllowlist] = useState('');`):

```tsx
  const [allowlist, setAllowlist] = useState<SharePrincipal[]>([]);
  const [commentsEnabled, setCommentsEnabled] = useState(false);
```

In `deploy()`, after the `if (visibility === 'restricted') { … }` block that PATCHes the allowlist, change that PATCH body to send the structured array, and add a comments_enabled PATCH. Replace the restricted block + add the comments enable so the post-deploy section reads:

```tsx
      if (visibility === 'restricted') {
        const slug = String(data.url).split('/a/')[1];
        const vres = await fetch(`/api/artifacts/${slug}`, {
          method: 'PATCH',
          headers: { ...headers, 'x-edit-token': data.edit_token },
          body: JSON.stringify({ visibility: 'restricted', allowlist }),
        });
        if (!vres.ok) {
          const vdata = await vres.json().catch(() => ({}));
          setError(deployErrorMessage(vdata?.error)); return;
        }
      }
      if (commentsEnabled) {
        const slug = String(data.url).split('/a/')[1];
        // comments_enabled is owner-only — requires the session Bearer (present when signed in).
        const cres = await fetch(`/api/artifacts/${slug}`, {
          method: 'PATCH', headers, body: JSON.stringify({ comments_enabled: true }),
        });
        if (!cres.ok) {
          const cdata = await cres.json().catch(() => ({}));
          setError(deployErrorMessage(cdata?.error)); return;
        }
      }
```

In `reset()`, reset the new state: change `setAllowlist('')` to `setAllowlist([])` and add `setCommentsEnabled(false)`.

Replace the restricted textarea block (the `{visibility === 'restricted' && (…<textarea…/>…)}` block) with the role editor:

```tsx
      {visibility === 'restricted' && (
        <div className={styles.password}>
          <ShareRoleEditor principals={allowlist} onChange={setAllowlist} />
        </div>
      )}
```

Add an "Allow comments" toggle in the options area. After the visibility buttons block (the `{signedIn && (<button … restricted …/>)}`), add — only when signed in:

```tsx
        {signedIn && (
          <>
            <div className={styles.optDiv} />
            <button
              type="button"
              className={`${styles.pill} ${commentsEnabled ? styles.on : ''}`}
              aria-pressed={commentsEnabled}
              onClick={() => setCommentsEnabled((v) => !v)}
            >💬 allow comments</button>
          </>
        )}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npm test -- DeployPanel` → all DeployPanel cases pass (existing + the new one). `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add components/home/DeployPanel.tsx components/home/DeployPanel.module.css components/home/DeployPanel.test.tsx
git commit -m "Comments: deploy panel allow-comments toggle + per-person role editor" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Dashboard editor — toggle + role editor

**Files:**
- Modify: `components/dashboard/EditClient.tsx`
- Modify: `components/dashboard/EditClient.test.tsx`
- (Reuse `app/dashboard/[slug]/edit.module.css` classes; add a couple if needed.)

**Invoke the `frontend-design` skill** to keep the editor consistent.

- [ ] **Step 1: Update the existing EditClient test for the new shape + add coverage**

Open `components/dashboard/EditClient.test.tsx`. The GET mock now returns `allowlist` as an array + `comments_enabled`. Update the mocked GET response to e.g. `{ content, visibility: 'restricted', allowlist: [{ value: 'alice@example.com', type: 'email', role: 'view' }], comments_enabled: false, … }`, and add assertions that:
- the role editor shows the loaded principal, and
- toggling "Allow comments" + Save sends `{ comments_enabled: true }` in a PATCH.

Match the file's existing structure/mocks (it already mocks `@/lib/web/auth` `getAccessToken` and stubs `fetch`). Keep native matchers. Capture PATCH bodies like Task 3 does and assert `comments_enabled` + structured `allowlist` are sent.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- EditClient`
Expected: FAIL (string allowlist handling / no toggle).

- [ ] **Step 3: Update EditClient**

In `components/dashboard/EditClient.tsx`:

Add imports:

```tsx
import { ShareRoleEditor } from './ShareRoleEditor';
import type { SharePrincipal } from '@/lib/artifacts/types';
```

Change `const [allowlist, setAllowlist] = useState('');` to:

```tsx
  const [allowlist, setAllowlist] = useState<SharePrincipal[]>([]);
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [loadedCommentsEnabled, setLoadedCommentsEnabled] = useState(false);
```

In `load()`, replace `setAllowlist((data.allowlist as string) ?? '')` with:

```tsx
      setAllowlist(Array.isArray(data.allowlist) ? (data.allowlist as SharePrincipal[]) : []);
      setCommentsEnabled(!!data.comments_enabled);
      setLoadedCommentsEnabled(!!data.comments_enabled);
```

In `save()`, the restricted branch already sends `{ visibility, allowlist }` — now `allowlist` is the structured array, which the API accepts as-is (no change needed there beyond the state type). After the visibility block, add a comments_enabled PATCH when it changed:

```tsx
      if (commentsEnabled !== loadedCommentsEnabled) {
        const cres = await fetch(`/api/artifacts/${slug}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ comments_enabled: commentsEnabled }),
        });
        const cdata = await cres.json().catch(() => ({}));
        if (!cres.ok) { setError(editErrorMessage(cdata?.error)); return; }
        setLoadedCommentsEnabled(commentsEnabled);
      }
```

Replace the restricted `<textarea>` block with the role editor:

```tsx
        {visibility === 'restricted' && (
          <div style={{ width: '100%', marginTop: 10 }}>
            <ShareRoleEditor principals={allowlist} onChange={(next) => { setAllowlist(next); setSaved(false); }} />
          </div>
        )}
```

Add an "Allow comments" toggle in the controls area (after the visibility segmented control), styled to match `edit.module.css` (reuse `.seg`/button styling or add a small `.toggle` class):

```tsx
        <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input
            type="checkbox"
            checked={commentsEnabled}
            onChange={(e) => { setCommentsEnabled(e.target.checked); setSaved(false); }}
          />
          Allow comments
        </label>
```

- [ ] **Step 4: Run tests + type-check + commit**

Run: `npm test -- EditClient` → PASS. `npm test` → all green. `npx tsc --noEmit` → clean.

```bash
git add components/dashboard/EditClient.tsx components/dashboard/EditClient.test.tsx app/dashboard/[slug]/edit.module.css
git commit -m "Comments: dashboard editor allow-comments toggle + role editor" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (Phase 3a)

- [ ] `npm test` — all green (new: `ShareRoleEditor`; updated: `DeployPanel`, `EditClient`).
- [ ] `npx tsc --noEmit` — no new errors.
- [ ] `npm run build` — succeeds.
- [ ] **Manual smoke (browser, `npm run dev`, signed in):** homepage → "allow comments" toggles; restricted shows the role editor; add alice@example.com, switch her to Comment, deploy → network shows `{comments_enabled:true}` + `{visibility:'restricted',allowlist:[…role:'comment'…]}`. Dashboard editor for an owned artifact loads existing roles + toggle, saves changes.

## Spec coverage (Phase 3a scope)

- §7 "Allow comments" toggle (deploy + editor, signed-in only) → Tasks 3, 4. ✅
- §7 per-person View/Comment editor replacing the textarea → Tasks 1, 3, 4. ✅
- Structured allowlist + flag round-trip (GET returns array + flag) → Task 2. ✅
- frontend-design + brand consistency → Tasks 1, 3, 4 (skill invoked). ✅
- **Deferred:** Phase 3b (annotation runtime + viewer sidebar — the in-artifact pin/highlight UX), Phase 3c (README/`/docs`).
