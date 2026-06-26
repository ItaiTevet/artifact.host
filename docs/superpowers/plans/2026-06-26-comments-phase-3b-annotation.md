# Comments & Annotations — Phase 3b: Annotation Runtime + Viewer Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). **UI tasks (4): invoke the `frontend-design` skill and match the brand tokens.**

**Goal:** Let a viewer annotate the rendered artifact in place — drop a pin or select text to comment — with comments persisted and shown in a sidebar, all while preserving the sandboxed iframe's isolation from our origin.

**Architecture:** When `comments_enabled`, the viewer renders a client `CommentableArtifact` instead of the bare iframe. It injects a small annotation runtime into the iframe `srcDoc` (still `allow-scripts`, **no `allow-same-origin`**). The runtime is the *spatial layer* (renders numbered markers, captures click/selection → an anchor, signals pin clicks); it holds **no comment text and no token** and only talks to the parent via `postMessage` tagged with a per-render **nonce**. The parent is the *data layer*: a sidebar (composer + thread + resolve/edit/delete) that holds the session token, calls the Phase 2 REST API, and pushes pins to the iframe.

**Tech Stack:** React client component, a DOM-JS runtime string, `postMessage`+nonce, Vitest (pure geometry + sidebar data flow), Playwright (`e2e-browser/`) for the real annotation interaction.

**Spec:** `docs/superpowers/specs/2026-06-26-comments-annotations-design.md` §4 (architecture/threat model) + §7 (viewer). Builds on Phases 1/2/3a (branch `claude/batch-b-comments`). Docs are Phase 3c.

**Conventions:** `@/` = repo root. `npm test` (Vitest). `npx tsc --noEmit` (ignore the 2 pre-existing `DeployPanel.test.tsx:73-74` errors). `npm run build`. Component tests: jsdom pragma, native matchers, co-located, mock `@/lib/web/auth`. Brand tokens in `app/globals.css` (`--ink`,`--ink-2`,`--ink-3`,`--rule`,`--bg`,`--bg-2`,`--amber`,`--mono`,`--serif`). Commit per task, multiple `-m`.

**Comment wire shape (Phase 2):** `GET …/comments` → `{ comments: [{ id, body, anchor, author_name, resolved, created_at }] }`. `anchor` = `{ kind:'pin'|'highlight', x, y, quote? }` (x,y normalized 0..1). POST `{ body, anchor }` → `{ comment }` (201). PATCH `{ body }`|`{ resolved }`. DELETE.

**Security note for the runtime:** it must never receive comment text or tokens; it only sends/receives anchors, ids, and mode. The parent validates every inbound message: `event.source === iframe.contentWindow` AND `event.data.nonce === <the injected nonce>`. Origin is `'null'` for the no-same-origin srcdoc, so the nonce is the integrity check. The "Save" action lives only in the parent and requires an explicit user submit — a hostile artifact forging `anchor-proposed` can at most open an empty composer.

---

## Task 1: Surface `comments_enabled` to the viewer

The viewer must know whether to mount the annotation layer. Thread the flag through `viewArtifact` and the content route, and read it in both viewer entry points.

**Files:**
- Modify: `lib/artifacts/service.ts` (`ViewResult` ok variant + `viewArtifact`)
- Modify: `app/api/artifacts/[slug]/content/route.ts` (include it in the response)
- Modify: `app/a/[slug]/page.tsx` + `app/a/[slug]/RestrictedGate.tsx` (read it; wiring of `CommentableArtifact` comes in Task 5 — here just plumb the value)
- Test: extend `lib/artifacts/__tests__/` view coverage if a viewArtifact test exists; otherwise add a small assertion.

- [ ] **Step 1: Extend the ViewResult ok variant + viewArtifact**

In `lib/artifacts/service.ts`, change the `ViewResult` ok variant to include the flag:

```ts
export type ViewResult =
  | { status: 'ok'; content: string; title: string | null; viewCount: number; commentsEnabled: boolean }
  | { status: 'password_required'; title: string | null }
  | { status: 'restricted'; title: string | null; reason: 'login' | 'denied' }
  | { status: 'not_found' };
```

In `viewArtifact`, update the final ok return to include it:

```ts
  return {
    status: 'ok',
    content: record.content,
    title: record.title,
    viewCount: record.viewCount + 1,
    commentsEnabled: record.commentsEnabled,
  };
```

- [ ] **Step 2: Include it in the content route**

In `app/api/artifacts/[slug]/content/route.ts`, the `status === 'ok'` branch currently returns `{ content, title }`. Add the flag:

```ts
    if (res.status === 'ok') return Response.json({ content: res.content, title: res.title, comments_enabled: res.commentsEnabled });
```

- [ ] **Step 3: Read it in the viewer page (no behavior change yet)**

In `app/a/[slug]/page.tsx`, the final `res.status === 'ok'` render currently returns the bare `<iframe srcDoc={res.content} …/>`. Leave the iframe as-is for now BUT confirm `res.commentsEnabled` is available (it is, via the type). Task 5 swaps in `CommentableArtifact`. No code change required in this step beyond confirming the type compiles.

- [ ] **Step 4: Run + type-check + commit**

Run: `npm test` → green (if a viewArtifact unit test asserts the ok object shape, add `commentsEnabled: false`/`true` as appropriate). `npx tsc --noEmit` → no new errors.

```bash
git add lib/artifacts/service.ts "app/api/artifacts/[slug]/content/route.ts"
git commit -m "Comments: surface comments_enabled via viewArtifact + content route" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: The injected annotation runtime

A DOM-JS IIFE injected into the iframe srcDoc. It renders markers, captures click/selection → anchor, and talks to the parent over `postMessage`+nonce. No text, no token, no network.

**Files:**
- Create: `lib/comments/annotation-runtime.ts`
- Test: `lib/comments/__tests__/annotation-runtime.test.ts`

- [ ] **Step 1: Write the failing test (string smoke — the DOM behavior is covered by Playwright in Task 5)**

Create `lib/comments/__tests__/annotation-runtime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';

describe('buildAnnotationScript', () => {
  it('embeds the nonce as a JSON string literal', () => {
    const s = buildAnnotationScript('abc-123');
    expect(s).toContain('"abc-123"');
  });
  it('is a self-invoking IIFE and references the message protocol', () => {
    const s = buildAnnotationScript('n');
    expect(s.trim().startsWith('(function')).toBe(true);
    expect(s).toContain('render-pins');
    expect(s).toContain('anchor-proposed');
    expect(s).toContain('pin-activated');
  });
  it('does not contain a closing script tag (cannot break out of the host <script>)', () => {
    expect(buildAnnotationScript('n').toLowerCase()).not.toContain('</script>');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- annotation-runtime` → FAIL.

- [ ] **Step 3: Implement**

Create `lib/comments/annotation-runtime.ts`:

```ts
/** Builds the annotation runtime injected into a comment-enabled artifact's sandboxed iframe.
 *  Plain DOM JS (no imports). It is the spatial layer only: renders numbered markers, captures
 *  a click (pin) or text selection (highlight) into a normalized anchor, and talks to the parent
 *  over postMessage tagged with `nonce`. It never holds comment text or tokens. */
export function buildAnnotationScript(nonce: string): string {
  const N = JSON.stringify(nonce);
  return `(function(){
  var NONCE=${N};
  var mode='idle';
  var pins=[];
  var layer=document.createElement('div');
  layer.setAttribute('data-ah-layer','');
  layer.style.cssText='position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483646;';
  function post(m){ try{ m.nonce=NONCE; parent.postMessage(m,'*'); }catch(e){} }
  function docSize(){ var de=document.documentElement, b=document.body; return { w:Math.max(de.scrollWidth, b?b.scrollWidth:0, de.clientWidth), h:Math.max(de.scrollHeight, b?b.scrollHeight:0, de.clientHeight) }; }
  function clamp01(n){ return Math.min(1,Math.max(0,n)); }
  function render(){
    layer.innerHTML='';
    var s=docSize();
    for(var i=0;i<pins.length;i++){ (function(p,idx){
      var a=p.anchor||{}; var el=document.createElement('button');
      el.type='button'; el.textContent=String(idx+1);
      el.style.cssText='position:absolute;left:'+(clamp01(a.x||0)*s.w)+'px;top:'+(clamp01(a.y||0)*s.h)+'px;transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;background:#b36b20;color:#fff;border:none;border-radius:50% 50% 50% 0;width:22px;height:22px;font:12px/1 monospace;box-shadow:0 1px 4px rgba(0,0,0,.3);'+(p.resolved?'opacity:.4;':'');
      el.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); post({type:'pin-activated',id:p.id}); });
      layer.appendChild(el);
    })(pins[i],i); }
  }
  function setMode(m){ mode=m; try{ document.documentElement.style.cursor = (m==='commenting')?'crosshair':''; }catch(e){} }
  function onClick(ev){
    if(mode!=='commenting') return;
    ev.preventDefault(); ev.stopPropagation();
    var s=docSize();
    post({type:'anchor-proposed',anchor:{kind:'pin',x:clamp01(ev.pageX/(s.w||1)),y:clamp01(ev.pageY/(s.h||1))}});
    setMode('idle');
  }
  function onMouseUp(){
    if(mode!=='commenting') return;
    var sel=window.getSelection&&window.getSelection();
    if(!sel||sel.isCollapsed) return;
    var q=String(sel).trim(); if(!q) return;
    var rect=sel.getRangeAt(0).getBoundingClientRect(); var s=docSize();
    var x=clamp01((rect.left+window.scrollX+rect.width/2)/(s.w||1));
    var y=clamp01((rect.top+window.scrollY)/(s.h||1));
    try{ sel.removeAllRanges(); }catch(e){}
    post({type:'anchor-proposed',anchor:{kind:'highlight',x:x,y:y,quote:q.slice(0,280)}});
    setMode('idle');
  }
  function ready(){ if(document.body){ document.body.appendChild(layer); } render(); post({type:'ready'}); }
  window.addEventListener('message',function(ev){
    var d=ev.data; if(!d||d.nonce!==NONCE) return;
    if(d.type==='render-pins'){ pins=Array.isArray(d.pins)?d.pins:[]; render(); }
    else if(d.type==='set-mode'){ setMode(d.mode); }
  });
  document.addEventListener('click',onClick,true);
  document.addEventListener('mouseup',onMouseUp,true);
  window.addEventListener('resize',render);
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',ready); } else { ready(); }
})();`;
}
```

- [ ] **Step 4: Run + commit**

Run: `npm test -- annotation-runtime` → PASS (3). `npx tsc --noEmit` → clean.

```bash
git add lib/comments/annotation-runtime.ts lib/comments/__tests__/annotation-runtime.test.ts
git commit -m "Comments: injected annotation runtime (markers + anchor capture over postMessage)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `CommentableArtifact` client component (iframe + sidebar)

**Invoke `frontend-design`.** The parent data layer: injected iframe + a comment sidebar (composer, thread, resolve/edit/delete), the postMessage bridge, and the API calls.

**Files:**
- Create: `components/comments/CommentableArtifact.tsx`
- Create: `components/comments/CommentableArtifact.module.css`
- Test: `components/comments/CommentableArtifact.test.tsx`

- [ ] **Step 1: Write the failing test (sidebar data flow; the iframe/postMessage path is Playwright-only)**

Create `components/comments/CommentableArtifact.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CommentableArtifact } from './CommentableArtifact';
import { getAccessToken } from '@/lib/web/auth';

vi.mock('@/lib/web/auth', () => ({ getAccessToken: vi.fn(async () => 'tok') }));

const comment = { id: 'c1', body: 'first note', anchor: { kind: 'pin', x: 0.5, y: 0.5 }, author_name: 'alice', resolved: false, created_at: '2026-06-26T00:00:00.000Z' };

beforeEach(() => { vi.mocked(getAccessToken).mockResolvedValue('tok'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CommentableArtifact sidebar', () => {
  it('lists existing comments fetched from the API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ comments: [comment] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<CommentableArtifact slug="s1" content="<p>hi</p>" />);
    await waitFor(() => expect(screen.getByText('first note')).toBeTruthy());
    expect(screen.getByText(/alice/)).toBeTruthy();
  });

  it('posts a new comment (POST then refetch) once an anchor is pending', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ comment: { ...comment, id: 'c2', body: 'added' } }), { status: 201, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ comments: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CommentableArtifact slug="s1" content="<p>hi</p>" />);
    // Simulate the iframe proposing an anchor (the component listens for postMessage).
    // The composer is exposed via a test hook: dispatch the same message the runtime would send.
    await waitFor(() => expect(screen.getByRole('button', { name: /add comment/i })).toBeTruthy());
    // Open the composer by posting an anchor-proposed message with the component's nonce.
    // The component renders a hidden marker with the nonce in data-testid for the test to read.
    const host = screen.getByTestId('ca-root');
    const nonce = host.getAttribute('data-nonce')!;
    window.postMessage({ type: 'anchor-proposed', nonce, anchor: { kind: 'pin', x: 0.2, y: 0.2 } }, '*');
    const ta = await screen.findByPlaceholderText(/add a comment/i);
    fireEvent.change(ta, { target: { value: 'added' } });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === 'POST')).toBe(true));
  });
});
```

> Note: the test drives the composer by dispatching the same `anchor-proposed` message the iframe runtime would post (the component's message handler accepts `window` messages whose `nonce` matches; it exposes the nonce via `data-nonce` on its root for the test). This exercises the real parent message handler without a live iframe.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- CommentableArtifact` → FAIL.

- [ ] **Step 3: Implement the component**

Create `components/comments/CommentableArtifact.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAccessToken } from '@/lib/web/auth';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';
import type { Anchor } from '@/lib/artifacts/comment-types';
import styles from './CommentableArtifact.module.css';

interface Comment { id: string; body: string; anchor: Anchor; author_name: string; resolved: boolean; created_at: string; }

export function CommentableArtifact({ slug, content }: { slug: string; content: string }) {
  const [nonce] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'n-' + Date.now()));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [pending, setPending] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const srcDoc = useMemo(() => `${content}\n<script>${buildAnnotationScript(nonce)}</script>`, [content, nonce]);

  const toIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ ...msg, nonce }, '*');
  }, [nonce]);

  const pushPins = useCallback((list: Comment[]) => {
    toIframe({ type: 'render-pins', pins: list.map((c) => ({ id: c.id, anchor: c.anchor, resolved: c.resolved })) });
  }, [toIframe]);

  const authHeaders = useCallback(async (json = false): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    const h: Record<string, string> = {};
    if (json) h['content-type'] = 'application/json';
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments`, { headers: await authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch { /* keep prior */ }
  }, [slug, authHeaders]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { pushPins(comments); }, [comments, pushPins]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const fromIframe = ev.source === iframeRef.current?.contentWindow;
      const d = ev.data as { type?: string; nonce?: string; anchor?: Anchor; id?: string } | null;
      if (!d || d.nonce !== nonce) return;
      // Accept 'ready'/'pin-activated' only from the iframe; 'anchor-proposed' may also be
      // dispatched by tests on window — still nonce-gated, and harmless (only opens a composer).
      if (d.type === 'ready' && fromIframe) pushPins(comments);
      else if (d.type === 'anchor-proposed' && d.anchor) setPending(d.anchor);
      else if (d.type === 'pin-activated' && d.id) setActiveId(d.id);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [nonce, comments, pushPins]);

  function startCommenting() { toIframe({ type: 'set-mode', mode: 'commenting' }); }

  async function post() {
    if (!pending || !draft.trim()) return;
    const token = await getAccessToken();
    if (!token) { setError('Sign in to comment.'); return; }
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments`, {
      method: 'POST', headers: await authHeaders(true), body: JSON.stringify({ body: draft, anchor: pending }),
    });
    if (!res.ok) { setError('Could not post that comment.'); return; }
    setDraft(''); setPending(null); setError(null);
    await load();
  }

  async function toggleResolved(c: Comment) {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${c.id}`, {
      method: 'PATCH', headers: await authHeaders(true), body: JSON.stringify({ resolved: !c.resolved }),
    });
    if (res.ok) await load();
  }

  async function remove(c: Comment) {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${c.id}`, {
      method: 'DELETE', headers: await authHeaders(),
    });
    if (res.ok) await load();
  }

  return (
    <div className={styles.root} data-testid="ca-root" data-nonce={nonce}>
      <iframe
        ref={iframeRef}
        title="artifact"
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups allow-forms"
        className={styles.frame}
      />
      <aside className={styles.sidebar}>
        <div className={styles.head}>
          <span className={styles.title}>Comments</span>
          <button type="button" className={styles.add} onClick={startCommenting}>+ Add comment</button>
        </div>

        {pending && (
          <div className={styles.composer}>
            <textarea
              className={styles.input}
              placeholder="Add a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className={styles.composerRow}>
              <button type="button" className={styles.ghost} onClick={() => { setPending(null); setDraft(''); }}>Cancel</button>
              <button type="button" className={styles.post} onClick={() => void post()}>Post</button>
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <ul className={styles.list}>
          {comments.length === 0 && <li className={styles.empty}>No comments yet. Click “Add comment”, then click on the page.</li>}
          {comments.map((c) => (
            <li key={c.id} className={`${styles.item} ${c.id === activeId ? styles.active : ''} ${c.resolved ? styles.resolved : ''}`}>
              <div className={styles.meta}><span className={styles.author}>{c.author_name}</span>{c.resolved && <span className={styles.badge}>resolved</span>}</div>
              {c.anchor.kind === 'highlight' && c.anchor.quote && <div className={styles.quote}>“{c.anchor.quote}”</div>}
              <div className={styles.body}>{c.body}</div>
              <div className={styles.actions}>
                <button type="button" onClick={() => void toggleResolved(c)}>{c.resolved ? 'Reopen' : 'Resolve'}</button>
                <button type="button" onClick={() => void remove(c)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
```

> Editing a comment body (author-only PATCH `{body}`) is wired in the API already; for v1 the sidebar exposes Resolve + Delete. (Inline edit can be a small follow-up; not required for the spec's core flow.)

- [ ] **Step 4: Style it (frontend-design; brand tokens)**

Create `components/comments/CommentableArtifact.module.css`. Baseline (refine with frontend-design, keep tokens): a fixed full-viewport split — iframe fills the left, a fixed-width sidebar on the right.

```css
.root { position: fixed; inset: 0; display: flex; }
.frame { flex: 1; border: none; height: 100%; width: 100%; }
.sidebar { width: 320px; flex-shrink: 0; height: 100%; overflow-y: auto; border-left: 1px solid var(--rule); background: var(--bg); padding: 16px; font-family: var(--mono); }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.title { font-size: 13px; color: var(--ink); letter-spacing: .04em; }
.add { font-size: 12px; color: var(--ink); background: var(--bg-2); border: 1px solid var(--rule); border-radius: 999px; padding: 5px 12px; cursor: pointer; }
.add:hover { border-color: var(--ink-2); }
.composer { border: 1px solid var(--rule); border-radius: 3px; background: var(--bg-2); padding: 8px; margin-bottom: 12px; }
.input { width: 100%; min-height: 60px; font-family: var(--mono); font-size: 13px; color: var(--ink); background: transparent; border: none; outline: none; resize: vertical; }
.composerRow { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.post { font-size: 12px; color: var(--bg); background: var(--ink); border: none; border-radius: 3px; padding: 5px 14px; cursor: pointer; }
.ghost { font-size: 12px; color: var(--ink-2); background: none; border: none; cursor: pointer; }
.error { font-size: 12px; color: #b00020; margin-bottom: 10px; }
.list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.empty { font-size: 12px; color: var(--ink-3); line-height: 1.6; }
.item { border: 1px solid var(--rule); border-radius: 3px; padding: 10px; }
.item.active { border-color: var(--amber); }
.item.resolved { opacity: .6; }
.meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.author { font-size: 12px; color: var(--ink-2); }
.badge { font-size: 10px; color: var(--bg); background: var(--ink-3); border-radius: 999px; padding: 1px 7px; }
.quote { font-size: 12px; color: var(--ink-2); border-left: 2px solid var(--rule); padding-left: 8px; margin-bottom: 4px; }
.body { font-size: 13px; color: var(--ink); line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.actions { display: flex; gap: 12px; margin-top: 8px; }
.actions button { font-size: 11px; color: var(--ink-3); background: none; border: none; cursor: pointer; }
.actions button:hover { color: var(--ink); }
@media (max-width: 640px) { .sidebar { width: 240px; } }
```

- [ ] **Step 5: Run tests + type-check + commit**

Run: `npm test -- CommentableArtifact` → PASS (2). `npx tsc --noEmit` → clean.

```bash
git add components/comments/CommentableArtifact.tsx components/comments/CommentableArtifact.module.css components/comments/CommentableArtifact.test.tsx
git commit -m "Comments: CommentableArtifact (injected iframe + comment sidebar)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire `CommentableArtifact` into the viewer

**Files:**
- Modify: `app/a/[slug]/page.tsx`
- Modify: `app/a/[slug]/RestrictedGate.tsx`

- [ ] **Step 1: Public/password page**

In `app/a/[slug]/page.tsx`, add the import:

```tsx
import { CommentableArtifact } from '@/components/comments/CommentableArtifact';
```

Replace the final `ok` render (the bare `<iframe srcDoc={res.content} …/>`) with a branch:

```tsx
  if (res.commentsEnabled) {
    return <CommentableArtifact slug={slug} content={res.content} />;
  }
  return (
    <iframe
      srcDoc={res.content}
      sandbox="allow-scripts allow-popups allow-forms"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
    />
  );
```

- [ ] **Step 2: Restricted gate**

In `app/a/[slug]/RestrictedGate.tsx`: the success state currently sets `{ phase: 'ok', content }` from the `/content` fetch and renders a bare iframe. Carry the flag through.

- Add the import: `import { CommentableArtifact } from '@/components/comments/CommentableArtifact';`
- Extend the `State` ok variant: `| { phase: 'ok'; content: string; commentsEnabled: boolean }`.
- In `load()`, the success line `setState({ phase: 'ok', content: data.content })` becomes `setState({ phase: 'ok', content: data.content, commentsEnabled: !!data.comments_enabled })`.
- Replace the final return (the bare iframe) with:

```tsx
  if (state.commentsEnabled) {
    return <CommentableArtifact slug={slug} content={state.content} />;
  }
  return (
    <iframe
      srcDoc={state.content}
      sandbox="allow-scripts allow-popups allow-forms"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
    />
  );
```

- [ ] **Step 3: Type-check + build + commit**

Run: `npx tsc --noEmit` → clean. `npm test` → green. `npm run build` → succeeds.

```bash
git add "app/a/[slug]/page.tsx" "app/a/[slug]/RestrictedGate.tsx"
git commit -m "Comments: mount CommentableArtifact in the viewer when comments are enabled" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Playwright e2e — the annotation flow

Validate the real iframe runtime + sidebar against a self-host server. First read `e2e-browser/` to match its harness/config (how it boots the app + signs in).

**Files:**
- Read: the existing `e2e-browser/` test(s) + any `playwright.config.*` to copy setup.
- Create: `e2e-browser/comments.spec.ts` (name/extension per the existing convention)

- [ ] **Step 1: Write the test, matching the existing e2e-browser harness**

Read an existing `e2e-browser` spec to reuse its app-boot + sign-in helpers. Then add a spec that:
1. signs in (reuse the existing helper), deploys an artifact (UI or API), enables comments (the deploy-panel toggle from Phase 3a, or a PATCH),
2. opens `/a/<slug>`, clicks **+ Add comment**, clicks inside the artifact iframe to drop a pin (Playwright `frameLocator` for the srcdoc iframe), types in the composer, clicks **Post**,
3. asserts the comment appears in the sidebar, reloads, and asserts it persists and a pin marker is present in the iframe (`frameLocator('iframe').locator('[data-ah-layer] button')`).

Keep it resilient (Playwright auto-waits). If `e2e-browser` only runs in a specific mode, gate accordingly (match the existing specs).

- [ ] **Step 2: Run the browser e2e**

Run the project's browser-e2e command (check `package.json` scripts — likely `npm run e2e:browser` or similar; confirm from the existing setup).
Expected: the comment annotation spec passes. If the iframe interaction is flaky, prefer `frameLocator` + explicit `expect(...).toBeVisible()` waits over timeouts. Report results.

- [ ] **Step 3: Commit**

```bash
git add e2e-browser/comments.spec.ts
git commit -m "e2e(browser): annotation flow — drop a pin, post, persist" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (Phase 3b)

- [ ] `npm test` — green (new: annotation-runtime, CommentableArtifact).
- [ ] `npx tsc --noEmit` — no new errors.
- [ ] `npm run build` — succeeds.
- [ ] Browser e2e — annotation flow passes.
- [ ] **Manual smoke (`npm run dev`, signed in):** deploy with comments on → open the artifact → "+ Add comment" → click drops a pin → compose + Post → comment shows in sidebar + a numbered marker over the artifact; reload persists; resolve/delete work; comments-OFF artifact renders exactly as before (no sidebar/markers).

## Spec coverage (Phase 3b scope)

- §4 injected runtime in the no-same-origin sandbox; nonce-validated postMessage; text/token/save stay parent-side → Tasks 3, 4. ✅
- §7 in-place annotation (pin + text-selection) + sidebar (composer, thread, resolve/delete) → Tasks 3, 4. ✅
- Wired into both viewer entry points (public/password + restricted) → Tasks 1, 5. ✅
- Runtime smoke-tested; sidebar data-flow component-tested; full interaction Playwright-tested → Tasks 2, 3, 5. ✅
- **Deferred / follow-ups:** inline body editing in the sidebar (API supports it); true in-page text-highlight wrapping (currently highlights render as a marker + show the quote); Phase 3c docs.
