# Ambient Comments Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the **frontend-design** skill when building Tasks 2 & 3 (the in-iframe tooltip/composer/marker visuals and the pill) — match the brand tokens in `app/globals.css`.

**Goal:** Replace the comment **sidebar** with an ambient, non-intrusive UI — the artifact renders full-bleed; comments are small in-iframe pins that reveal the comment on hover, with an inline composer and a single floating pill.

**Architecture:** All comment UI (markers, hover tooltip, inline composer) renders **inside the sandboxed iframe** runtime, isolated from the artifact's CSS via a Shadow root. The iframe relays write *intents* (`create`/`resolve`/`delete`) via `postMessage`; the **parent** holds the auth token, performs the authenticated API calls, and renders only a floating pill. Token never enters the iframe. Backend changes are additive only (viewer capability flags); no migration.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest (+ jsdom), Playwright (`e2e-browser/`), the existing comment REST API + `comment-service`.

**Reference spec:** `docs/superpowers/specs/2026-06-26-ambient-comments-redesign.md`.

---

## File Structure (what changes and why)

- `lib/http/comment-json.ts` — `commentToJson` gains **optional** capability flags (`can_resolve`, `can_delete`). Backward compatible (omitted when no caps passed).
- `lib/artifacts/comment-service.ts` — add pure `commentCaps()` (mirrors resolve/delete authz) + `listCommentsForViewer()` (loads record, gates, returns each comment with its caps).
- `app/api/artifacts/[slug]/comments/route.ts` — GET uses `listCommentsForViewer` and serializes caps. (POST/PATCH/DELETE responses unchanged — the client re-fetches via GET, so they don't need caps.)
- `lib/comments/annotation-runtime.ts` — **rewritten**: in-iframe markers + hover tooltip + inline composer in a Shadow root; new message protocol.
- `lib/comments/__tests__/annotation-runtime.test.ts` — updated to the new protocol strings.
- `components/comments/CommentableArtifact.tsx` — **rewritten**: no sidebar; bridge (token + API + message relay) + floating pill.
- `components/comments/CommentableArtifact.module.css` — **replaced**: sidebar styles removed; only `.root`/`.frame`/`.pill` remain.
- `e2e-browser/comments.spec.mjs` — **rewritten** for the new flow.
- `lib/artifacts/__tests__/comment-service.test.ts` — add `commentCaps` + `listCommentsForViewer` tests.
- `lib/http/__tests__/comment-json.test.ts` — add caps serialization test.
- Docs sweep (README / `app/docs/page.tsx`) — reword any "sidebar" description to "pins + hover".

**Message protocol (single source of truth — keep names identical across runtime, component, tests):**
- Parent → iframe: `render-comments {comments:[{id,anchor,body,author_name,can_resolve,can_delete}]}` (open only), `set-mode {mode:'idle'|'commenting'}`, `auth-state {canPost:boolean}`.
- Iframe → parent: `ready`, `create-comment {body,anchor}`, `resolve-comment {id}`, `delete-comment {id}`, `request-signin`.

---

## Task 1: Backend — viewer-relative capability flags (additive, no migration)

**Files:**
- Modify: `lib/http/comment-json.ts`
- Modify: `lib/artifacts/comment-service.ts`
- Modify: `app/api/artifacts/[slug]/comments/route.ts`
- Test: `lib/http/__tests__/comment-json.test.ts`, `lib/artifacts/__tests__/comment-service.test.ts`

- [ ] **Step 1: Failing test — `commentCaps` mirrors resolve/delete authz**

Append to `lib/artifacts/__tests__/comment-service.test.ts` (it already imports `InMemoryRepository`, `InMemoryCommentRepository`, and defines `seed`/`ctx`/`OWNER`/`pin`). Add `commentCaps` and `listCommentsForViewer` to the import on line 4, then add:

```ts
describe('commentCaps', () => {
  it('owner: can resolve and delete any comment', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx({ ownerId: 'rando', email: 'r@x.com' }));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, OWNER)).toEqual({ canResolve: true, canDelete: true });
  });

  it('author (non-owner, public): can resolve and delete own comment', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const author = { ownerId: 'rando', email: 'r@x.com' };
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(author));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, author)).toEqual({ canResolve: true, canDelete: true });
  });

  it('other commenter (public): can resolve but not delete someone else’s comment', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx({ ownerId: 'a', email: 'a@x.com' }));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, { ownerId: 'b', email: 'b@x.com' })).toEqual({ canResolve: true, canDelete: false });
  });

  it('anonymous: cannot resolve or delete', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(OWNER));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, null)).toEqual({ canResolve: false, canDelete: false });
  });

  it('restricted view-only role: cannot resolve or delete', async () => {
    const { artifacts, comments } = await seed({
      visibility: 'restricted', commentsEnabled: true,
      allowlist: [{ value: 'v@x.com', type: 'email', role: 'view' }],
    });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(OWNER));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, { ownerId: 'v', email: 'v@x.com' })).toEqual({ canResolve: false, canDelete: false });
  });
});

describe('listCommentsForViewer', () => {
  it('returns each comment with its caps for the viewer', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx({ ownerId: 'rando', email: 'r@x.com' }));
    const rows = await listCommentsForViewer(artifacts, comments, 's1', ctx(OWNER));
    expect(rows).toHaveLength(1);
    expect(rows[0].caps).toEqual({ canResolve: true, canDelete: true }); // owner
    expect(rows[0].comment.body).toBe('hi');
  });

  it('rejects when the viewer cannot read the artifact', async () => {
    const { artifacts, comments } = await seed({
      visibility: 'restricted', commentsEnabled: true,
      allowlist: [{ value: 'v@x.com', type: 'email', role: 'view' }],
    });
    await expect(listCommentsForViewer(artifacts, comments, 's1', ctx(null)))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/comment-service.test.ts`
Expected: FAIL — `commentCaps`/`listCommentsForViewer` are not exported.

- [ ] **Step 3: Implement `commentCaps` + `listCommentsForViewer`**

In `lib/artifacts/comment-service.ts`, after `listComments` (ends line 46), add:

```ts
/** UI-facing capabilities for the viewer on a single comment. Mirrors resolveComment/deleteComment
 *  authz exactly so the rendered buttons match what the service will enforce. Booleans only —
 *  never leaks identity. */
export function commentCaps(
  record: ArtifactRecord, comment: CommentRecord, viewer: Viewer | null,
): { canResolve: boolean; canDelete: boolean } {
  const owner = isOwner(record, viewer);
  return {
    canResolve: owner || canComment(record, viewer),
    canDelete: (!!viewer && viewer.ownerId === comment.authorId) || owner,
  };
}

export interface CommentWithCaps {
  comment: CommentRecord;
  caps: { canResolve: boolean; canDelete: boolean };
}

/** List comments for a viewer, each tagged with that viewer's capabilities. Read gate identical
 *  to listComments. */
export async function listCommentsForViewer(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, ctx: ReadContext,
): Promise<CommentWithCaps[]> {
  const record = loadEnabled(await artifacts.findBySlug(slug));
  if (!canRead(record, ctx)) throw new ServiceError('forbidden', 'Not authorized to view this artifact');
  const rows = await comments.listBySlug(slug);
  return rows.map((c) => ({ comment: c, caps: commentCaps(record, c, ctx.viewer) }));
}
```

- [ ] **Step 4: Failing test — `commentToJson` includes caps when provided**

Append to `lib/http/__tests__/comment-json.test.ts`:

```ts
describe('commentToJson capability flags', () => {
  const rec: CommentRecord = {
    id: 'c1', artifactSlug: 's1', authorId: 'owner-uuid', authorEmail: 'alice@example.com',
    body: 'hi', anchor: { kind: 'pin', x: 0.5, y: 0.5 }, resolved: false, createdAt: new Date('2026-06-26T00:00:00Z'),
  };
  it('omits caps when none provided (back-compat)', () => {
    expect(commentToJson(rec)).not.toHaveProperty('can_resolve');
  });
  it('includes caps when provided, still no email/id', () => {
    const json = commentToJson(rec, { canResolve: true, canDelete: false });
    expect(json).toMatchObject({ can_resolve: true, can_delete: false });
    expect(JSON.stringify(json)).not.toContain('alice@example.com');
    expect(JSON.stringify(json)).not.toContain('owner-uuid');
  });
});
```

- [ ] **Step 5: Run — verify it fails**

Run: `npx vitest run lib/http/__tests__/comment-json.test.ts`
Expected: FAIL — `commentToJson` takes one arg / no caps in output.

- [ ] **Step 6: Implement caps in `commentToJson`**

Replace `lib/http/comment-json.ts` `commentToJson` with:

```ts
/** Snake_case wire shape for a comment. Emails and internal author ids are never exposed.
 *  `caps` (optional) adds viewer-relative `can_resolve`/`can_delete` booleans for UI gating. */
export function commentToJson(c: CommentRecord, caps?: { canResolve: boolean; canDelete: boolean }) {
  const base = {
    id: c.id,
    body: c.body,
    anchor: c.anchor,
    author_name: authorName(c.authorEmail),
    resolved: c.resolved,
    created_at: c.createdAt.toISOString(),
  };
  return caps ? { ...base, can_resolve: caps.canResolve, can_delete: caps.canDelete } : base;
}
```

- [ ] **Step 7: Wire the GET route to serialize caps**

In `app/api/artifacts/[slug]/comments/route.ts`: change the import on line 3 from `listComments` to `listCommentsForViewer`, and replace the GET body (lines 30–31) with:

```ts
    const list = await listCommentsForViewer(artifacts, comments, slug, ctx);
    return Response.json({ comments: list.map(({ comment, caps }) => commentToJson(comment, caps)) });
```

(POST stays as-is — its single-comment response needs no caps; the client re-fetches.)

- [ ] **Step 8: Run all affected tests + typecheck**

Run: `npx vitest run lib/artifacts/__tests__/comment-service.test.ts lib/http/__tests__/comment-json.test.ts`
Expected: PASS (all green).
Run: `npx tsc --noEmit`
Expected: no NEW errors (2 pre-existing errors in `components/home/DeployPanel.test.tsx:73-74` are tolerated — build does not typecheck tests).

- [ ] **Step 9: Commit**

```bash
git add lib/http/comment-json.ts lib/artifacts/comment-service.ts app/api/artifacts/\[slug\]/comments/route.ts lib/artifacts/__tests__/comment-service.test.ts lib/http/__tests__/comment-json.test.ts
git commit -m "comments: add viewer-relative capability flags to comments API (additive)"
```

---

## Task 2: Rewrite the annotation runtime (in-iframe markers + tooltip + composer)

**Files:**
- Modify (rewrite): `lib/comments/annotation-runtime.ts`
- Test: `lib/comments/__tests__/annotation-runtime.test.ts`

- [ ] **Step 1: Update the runtime unit test to the new protocol (failing)**

Replace `lib/comments/__tests__/annotation-runtime.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';

describe('buildAnnotationScript', () => {
  it('embeds the nonce as a JSON string literal', () => {
    expect(buildAnnotationScript('abc-123')).toContain('"abc-123"');
  });
  it('is a self-invoking IIFE referencing the new message protocol', () => {
    const s = buildAnnotationScript('n');
    expect(s.trim().startsWith('(function')).toBe(true);
    for (const t of ['render-comments', 'create-comment', 'resolve-comment', 'delete-comment', 'set-mode', 'auth-state', 'request-signin']) {
      expect(s).toContain(t);
    }
  });
  it('renders UI in a shadow root and tags markers with data-ah-pin', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('attachShadow');
    expect(s).toContain('data-ah-pin');
  });
  it('cannot break out of the host <script>', () => {
    expect(buildAnnotationScript('n').toLowerCase()).not.toContain('</script>');
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run lib/comments/__tests__/annotation-runtime.test.ts`
Expected: FAIL — old runtime lacks `render-comments`/`attachShadow`/etc.

- [ ] **Step 3: Rewrite `lib/comments/annotation-runtime.ts`**

Replace the entire file with (complete code — DOM-JS string; uses only single-quoted strings inside so there are no nested backticks; isolates all UI in a Shadow root; never holds the token):

```ts
/** Builds the annotation runtime injected into a comment-enabled artifact's sandboxed iframe.
 *  Plain DOM JS (no imports). Renders pin markers + a hover tooltip + an inline composer inside a
 *  Shadow root (isolated from the artifact's CSS). Talks to the parent over postMessage tagged with
 *  `nonce`. It never holds the auth token: it emits write *intents* the parent executes.
 *  Protocol — in: render-comments / set-mode / auth-state. out: ready / create-comment /
 *  resolve-comment / delete-comment / request-signin. */
export function buildAnnotationScript(nonce: string): string {
  const N = JSON.stringify(nonce);
  return `(function(){
  var NONCE=${N};
  var mode='idle', comments=[], canPost=false, sticky=null, hideTimer=null;

  var host=document.createElement('div');
  host.setAttribute('data-ah-host','');
  host.style.cssText='position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
  var root=host.attachShadow?host.attachShadow({mode:'open'}):host;
  var style=document.createElement('style');
  style.textContent='.layer{position:absolute;top:0;left:0;width:0;height:0;pointer-events:none}'
    +'.pin{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;width:18px;height:18px;background:#b36b20;border:2px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .1s;padding:0}'
    +'.pin:hover,.pin.on{transform:translate(-50%,-100%) scale(1.18)}'
    +'.pop{position:absolute;max-width:280px;background:#fefdfb;color:#0e0c09;border:1px solid #e2dbd2;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.16);padding:10px 12px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;pointer-events:auto}'
    +'.who{font-weight:600;font-size:11px;color:#5a5449;margin-bottom:4px}'
    +'.quote{font-size:11px;color:#5a5449;border-left:2px solid #b36b20;padding-left:6px;margin-bottom:5px;opacity:.85;white-space:pre-wrap;word-break:break-word}'
    +'.body{white-space:pre-wrap;word-break:break-word}'
    +'.row{display:flex;gap:12px;margin-top:8px;padding-top:7px;border-top:1px solid #e2dbd2}'
    +'.row button{font:11px ui-monospace,monospace;color:#5a5449;background:none;border:none;cursor:pointer;padding:0}'
    +'.row button:hover{color:#0e0c09}'
    +'textarea{width:240px;min-height:60px;font:13px ui-sans-serif,system-ui,sans-serif;color:#0e0c09;border:1px solid #e2dbd2;border-radius:5px;padding:6px;resize:vertical;outline:none;box-sizing:border-box}'
    +'.crow{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}'
    +'.crow .post{background:#0e0c09;color:#fefdfb;border:none;border-radius:4px;padding:5px 12px;font:12px ui-monospace,monospace;cursor:pointer}'
    +'.crow .cancel{background:none;border:none;color:#a09890;font:12px ui-monospace,monospace;cursor:pointer}'
    +'.signin{font-size:12px;color:#5a5449}.signin button{color:#b36b20;text-decoration:underline;background:none;border:none;cursor:pointer;font:inherit;padding:0}';
  root.appendChild(style);
  var layer=document.createElement('div'); layer.className='layer'; root.appendChild(layer);
  var pop=document.createElement('div'); pop.className='pop'; pop.style.display='none'; root.appendChild(pop);

  function post(m){ try{ m.nonce=NONCE; parent.postMessage(m,'*'); }catch(e){} }
  function docSize(){ var de=document.documentElement,b=document.body; return {w:Math.max(de.scrollWidth,b?b.scrollWidth:0,de.clientWidth), h:Math.max(de.scrollHeight,b?b.scrollHeight:0,de.clientHeight)}; }
  function clamp01(n){ return Math.min(1,Math.max(0,n)); }
  function isOpen(c){ return !c.resolved; }

  function clearOn(){ for(var i=0;i<layer.children.length;i++) layer.children[i].classList.remove('on'); }
  function hidePop(){ pop.style.display='none'; sticky=null; clearOn(); }
  function scheduleHide(){ clearTimeout(hideTimer); hideTimer=setTimeout(function(){ if(!sticky) hidePop(); },200); }
  function cancelHide(){ clearTimeout(hideTimer); }
  function place(x,y){ var s=docSize(); var left=Math.min(x+8, s.w-290); pop.style.left=Math.max(4,left)+'px'; pop.style.top=(y+8)+'px'; }

  function showTooltip(c,x,y,makeSticky){
    cancelHide();
    if(makeSticky) sticky=c.id;
    pop.innerHTML='';
    var who=document.createElement('div'); who.className='who'; who.textContent=c.author_name||'someone'; pop.appendChild(who);
    if(c.anchor&&c.anchor.kind==='highlight'&&c.anchor.quote){ var q=document.createElement('div'); q.className='quote'; q.textContent='\\u201C'+c.anchor.quote+'\\u201D'; pop.appendChild(q); }
    var b=document.createElement('div'); b.className='body'; b.textContent=c.body; pop.appendChild(b);
    if(c.can_resolve||c.can_delete){
      var row=document.createElement('div'); row.className='row';
      if(c.can_resolve){ var rb=document.createElement('button'); rb.textContent='Resolve'; rb.onclick=function(e){ e.stopPropagation(); post({type:'resolve-comment',id:c.id}); hidePop(); }; row.appendChild(rb); }
      if(c.can_delete){ var db=document.createElement('button'); db.textContent='Delete'; db.onclick=function(e){ e.stopPropagation(); post({type:'delete-comment',id:c.id}); hidePop(); }; row.appendChild(db); }
      pop.appendChild(row);
    }
    place(x,y); pop.style.display='block';
  }

  function openComposer(anchor,x,y){
    cancelHide(); hidePop(); sticky='__composer__'; pop.innerHTML='';
    if(!canPost){
      var s=document.createElement('div'); s.className='signin';
      s.appendChild(document.createTextNode('Sign in to comment. '));
      var a=document.createElement('button'); a.textContent='Sign in'; a.onclick=function(e){ e.stopPropagation(); post({type:'request-signin'}); }; s.appendChild(a);
      pop.appendChild(s); place(x,y); pop.style.display='block'; return;
    }
    var ta=document.createElement('textarea'); ta.placeholder='Add a comment\\u2026'; pop.appendChild(ta);
    var row=document.createElement('div'); row.className='crow';
    var cancel=document.createElement('button'); cancel.className='cancel'; cancel.textContent='Cancel'; cancel.onclick=function(e){ e.stopPropagation(); hidePop(); };
    var pb=document.createElement('button'); pb.className='post'; pb.textContent='Post';
    pb.onclick=function(e){ e.stopPropagation(); var v=ta.value.trim(); if(!v) return; post({type:'create-comment',body:v,anchor:anchor}); hidePop(); };
    row.appendChild(cancel); row.appendChild(pb); pop.appendChild(row);
    place(x,y); pop.style.display='block'; ta.focus();
  }

  function render(){
    layer.innerHTML=''; clearOn();
    var s=docSize();
    comments.filter(isOpen).forEach(function(c){
      var a=c.anchor||{x:0,y:0};
      var px=clamp01(a.x||0)*s.w, py=clamp01(a.y||0)*s.h;
      var el=document.createElement('button'); el.type='button'; el.className='pin'; el.setAttribute('data-ah-pin','');
      el.style.left=px+'px'; el.style.top=py+'px';
      el.addEventListener('mouseenter',function(){ el.classList.add('on'); showTooltip(c,px,py,false); });
      el.addEventListener('mouseleave',function(){ if(sticky!==c.id) el.classList.remove('on'); scheduleHide(); });
      el.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); el.classList.add('on'); showTooltip(c,px,py,true); });
      layer.appendChild(el);
    });
    if(sticky&&sticky!=='__composer__'&&!comments.filter(isOpen).some(function(c){return c.id===sticky;})) hidePop();
  }

  pop.addEventListener('mouseenter',cancelHide);
  pop.addEventListener('mouseleave',scheduleHide);

  function setMode(m){ mode=m; try{ document.documentElement.style.cursor=(m==='commenting')?'crosshair':''; }catch(e){} }

  function onClick(ev){
    if(mode!=='commenting') return;
    ev.preventDefault(); ev.stopPropagation();
    var s=docSize(), x=ev.pageX, y=ev.pageY;
    openComposer({kind:'pin',x:clamp01(x/(s.w||1)),y:clamp01(y/(s.h||1))},x,y);
    setMode('idle');
  }
  function onMouseUp(){
    if(mode!=='commenting') return;
    var sel=window.getSelection&&window.getSelection(); if(!sel||sel.isCollapsed) return;
    var q=String(sel).trim(); if(!q) return;
    var rect=sel.getRangeAt(0).getBoundingClientRect(), s=docSize();
    var x=rect.left+window.scrollX+rect.width/2, y=rect.top+window.scrollY;
    try{ sel.removeAllRanges(); }catch(e){}
    openComposer({kind:'highlight',x:clamp01(x/(s.w||1)),y:clamp01(y/(s.h||1)),quote:q.slice(0,280)},x,y);
    setMode('idle');
  }
  function onOutside(ev){ if(sticky&&ev.target!==host) hidePop(); }

  function ready(){ if(document.body){ document.body.appendChild(host); } render(); post({type:'ready'}); }
  window.addEventListener('message',function(ev){
    var d=ev.data; if(!d||d.nonce!==NONCE) return;
    if(d.type==='render-comments'){ comments=Array.isArray(d.comments)?d.comments:[]; render(); }
    else if(d.type==='set-mode'){ setMode(d.mode); }
    else if(d.type==='auth-state'){ canPost=!!d.canPost; }
  });
  document.addEventListener('click',onClick,true);
  document.addEventListener('mouseup',onMouseUp,true);
  document.addEventListener('click',onOutside,false);
  window.addEventListener('keydown',function(e){ if(e.key==='Escape') hidePop(); });
  window.addEventListener('resize',render);
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',ready); } else { ready(); }
})();`;
}
```

- [ ] **Step 4: Run — verify the runtime test passes**

Run: `npx vitest run lib/comments/__tests__/annotation-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comments/annotation-runtime.ts lib/comments/__tests__/annotation-runtime.test.ts
git commit -m "comments: rewrite annotation runtime for in-iframe pins + hover tooltip + composer"
```

---

## Task 3: Rewrite CommentableArtifact (drop sidebar; bridge + pill)

**Files:**
- Modify (rewrite): `components/comments/CommentableArtifact.tsx`
- Modify (replace): `components/comments/CommentableArtifact.module.css`

> No unit test here (the component is integration-only — message bridge + fetch); it is covered by the Playwright e2e in Task 4. Verification for this task is typecheck + build.

- [ ] **Step 1: Rewrite `components/comments/CommentableArtifact.tsx`**

Replace the entire file with:

```tsx
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getAccessToken, getAccountEmail } from '@/lib/web/auth';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';
import type { Anchor } from '@/lib/artifacts/comment-types';
import styles from './CommentableArtifact.module.css';

interface Comment {
  id: string; body: string; anchor: Anchor; author_name: string; resolved: boolean;
  created_at: string; can_resolve?: boolean; can_delete?: boolean;
}

export function CommentableArtifact({ slug, content }: { slug: string; content: string }) {
  // useId() is stable across SSR + hydration, so the iframe's baked nonce matches this closure's.
  const rawId = useId();
  const nonce = rawId.replace(/[^a-z0-9]/gi, '') || 'n';
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [mode, setMode] = useState<'idle' | 'commenting'>('idle');

  const srcDoc = useMemo(() => `${content}\n<script>${buildAnnotationScript(nonce)}</script>`, [content, nonce]);

  const toIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ ...msg, nonce }, '*');
  }, [nonce]);

  const pushComments = useCallback((list: Comment[]) => {
    toIframe({
      type: 'render-comments',
      comments: list.filter((c) => !c.resolved).map((c) => ({
        id: c.id, anchor: c.anchor, body: c.body, author_name: c.author_name,
        can_resolve: !!c.can_resolve, can_delete: !!c.can_delete,
      })),
    });
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

  const create = useCallback(async (body: string, anchor: Anchor) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments`, {
      method: 'POST', headers: await authHeaders(true), body: JSON.stringify({ body, anchor }),
    });
    if (res.ok) await load();
  }, [slug, authHeaders, load]);

  const resolve = useCallback(async (id: string) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${id}`, {
      method: 'PATCH', headers: await authHeaders(true), body: JSON.stringify({ resolved: true }),
    });
    if (res.ok) await load();
  }, [slug, authHeaders, load]);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${id}`, {
      method: 'DELETE', headers: await authHeaders(),
    });
    if (res.ok) await load();
  }, [slug, authHeaders, load]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { getAccountEmail().then((e) => setCanPost(!!e)).catch(() => setCanPost(false)); }, []);
  useEffect(() => { pushComments(comments); }, [comments, pushComments]);
  useEffect(() => { toIframe({ type: 'auth-state', canPost }); }, [canPost, toIframe]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as { type?: string; nonce?: string; body?: string; anchor?: Anchor; id?: string } | null;
      if (!d || d.nonce !== nonce) return;
      if (d.type === 'ready') { toIframe({ type: 'auth-state', canPost }); pushComments(comments); }
      else if (d.type === 'create-comment' && typeof d.body === 'string' && d.anchor) void create(d.body, d.anchor);
      else if (d.type === 'resolve-comment' && d.id) void resolve(d.id);
      else if (d.type === 'delete-comment' && d.id) void remove(d.id);
      else if (d.type === 'request-signin') window.location.href = '/dashboard';
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [nonce, canPost, comments, create, resolve, remove, pushComments, toIframe]);

  function toggleMode() {
    const next = mode === 'commenting' ? 'idle' : 'commenting';
    setMode(next);
    toIframe({ type: 'set-mode', mode: next });
  }

  const openCount = comments.filter((c) => !c.resolved).length;
  const pillLabel = mode === 'commenting' ? 'Click the page to comment' : (openCount > 0 ? String(openCount) : 'Comment');

  return (
    <div className={styles.root}>
      <iframe
        ref={iframeRef}
        title="artifact"
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups allow-forms"
        className={styles.frame}
      />
      <button
        type="button"
        className={`${styles.pill} ${mode === 'commenting' ? styles.pillOn : ''}`}
        aria-pressed={mode === 'commenting'}
        onClick={toggleMode}
      >
        💬 {pillLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Replace `components/comments/CommentableArtifact.module.css`**

Replace the entire file with:

```css
.root {
  position: fixed;
  inset: 0;
}

.frame {
  border: none;
  width: 100%;
  height: 100%;
  display: block;
}

/* Floating pill — the only parent-side chrome. */
.pill {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 10;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--ink);
  background: var(--bg);
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.10);
  transition: border-color 120ms, background 120ms, color 120ms;
}

.pill:hover { border-color: var(--ink-2); }

.pillOn {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
}

.pill:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no NEW errors (only the 2 pre-existing `DeployPanel.test.tsx:73-74`).
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/comments/CommentableArtifact.tsx components/comments/CommentableArtifact.module.css
git commit -m "comments: replace sidebar with full-bleed artifact + floating pill (ambient UI)"
```

---

## Task 4: Rewrite the Playwright e2e for the ambient flow

**Files:**
- Modify (rewrite): `e2e-browser/comments.spec.mjs`

- [ ] **Step 1: Rewrite the spec**

Replace `e2e-browser/comments.spec.mjs` with:

```js
import { test, expect } from '@playwright/test';

const PASSWORD = 'browser-e2e-pass-123';

test('comments: full-bleed artifact, pin + hover tooltip, post + resolve', async ({ page }) => {
  const email = `e2e-cmt-${Date.now()}@browser.test`;

  // Sign up via the dashboard gate.
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /create one/i }).click();
  await page.getByPlaceholder(/you@example\.com/i).fill(email);
  await page.getByPlaceholder(/^password$/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /your artifacts/i })).toBeVisible();

  // Deploy with comments enabled.
  await page.goto('/');
  await expect(page.getByText(/saved to your dashboard/i)).toBeVisible();
  await page.getByPlaceholder(/paste your html/i).fill('<h1>commentable artifact</h1>');
  await page.getByRole('button', { name: /allow comments/i }).click();
  await page.getByRole('button', { name: /deploy artifact/i }).click();

  const viewLink = page.getByRole('link', { name: /view artifact/i });
  await expect(viewLink).toBeVisible();
  const url = await viewLink.getAttribute('href');
  expect(url).toMatch(/\/a\/\w+/);

  // Open it. No sidebar — the artifact iframe + the floating pill are present.
  await page.goto(url);
  const frame = page.frameLocator('iframe[title="artifact"]');
  await expect(frame.getByText('commentable artifact')).toBeVisible();
  const pill = page.getByRole('button', { name: /💬/ });
  await expect(pill).toBeVisible();

  // Enter comment mode, click the page → in-iframe composer appears. Retry: set-mode is async.
  await expect(async () => {
    await pill.click();
    await frame.locator('h1').click();
    await expect(frame.getByPlaceholder(/add a comment/i)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });

  // Compose + post (composer is inside the iframe shadow root; Playwright pierces it).
  await frame.getByPlaceholder(/add a comment/i).fill('looks great');
  await frame.getByRole('button', { name: /^post$/i }).click();

  // A pin marker appears in the iframe.
  const pin = frame.locator('[data-ah-pin]');
  await expect(pin.first()).toBeVisible();

  // Hover the pin → the tooltip shows the body.
  await pin.first().hover();
  await expect(frame.getByText('looks great')).toBeVisible();

  // Persists after reload.
  await page.reload();
  await expect(frame.locator('[data-ah-pin]').first()).toBeVisible();

  // Resolve hides the pin in-page. Click the pin to pin the tooltip open, then Resolve.
  await frame.locator('[data-ah-pin]').first().click();
  await frame.getByRole('button', { name: /^resolve$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e**

Run: `npm run e2e:browser`
Expected: PASS (1 test). If the post-then-pin race is flaky, the `toPass` retry blocks already guard the async `postMessage` settling.

- [ ] **Step 3: Commit**

```bash
git add e2e-browser/comments.spec.mjs
git commit -m "comments: rewrite browser e2e for ambient pins + hover + resolve"
```

---

## Task 5: Docs sweep (remove "sidebar" wording)

**Files:**
- Modify (as found): `README.md`, `app/docs/page.tsx`

- [ ] **Step 1: Find any sidebar/old-UI wording**

Run: `git grep -n -i -e "sidebar" -e "add comment" -e "comment panel" -- README.md app/docs/`
Expected: lists the comment-UI descriptions added in Batch B Phase 3c.

- [ ] **Step 2: Reword to the ambient model**

For each hit, replace the description of the in-page comment UI with wording like:
> "On a comment-enabled artifact, reviewers see comment **pins** directly on the page — hover a pin to read the comment, or click the **💬 pill** (bottom-right) to drop a new pin or highlight text. Resolved comments are hidden in-page; list or reopen them via the API/CLI."

Keep all REST/CLI documentation unchanged (those are accurate). Do not invent endpoints.

- [ ] **Step 3: Commit**

```bash
git add README.md app/docs/page.tsx
git commit -m "docs: describe ambient comments (pins + hover) instead of the sidebar"
```

---

## Task 6: Full verification

- [ ] **Step 1: Unit suite**

Run: `npx vitest run`
Expected: all green (223 prior + the new caps/runtime tests).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` (only the 2 pre-existing `DeployPanel.test.tsx:73-74` errors) and `npm run build` (succeeds).

- [ ] **Step 3: Browser e2e**

Run: `npm run e2e:browser`
Expected: PASS.

- [ ] **Step 4: Manual smoke (local `npm run dev`, signed in)**

Deploy a comment-enabled artifact; confirm: artifact is **full width** (no sidebar); pill bottom-right; comment mode → click drops a pin with an inline composer; post → pin appears; hover → tooltip with body + (as owner) Resolve/Delete; resolve → pin vanishes; reload persists; comments-disabled artifact is visually unchanged.

---

## Self-Review

**Spec coverage:** full-bleed/no-sidebar (Task 3 CSS `.root`/`.frame`) ✓; in-iframe markers+tooltip+composer (Task 2) ✓; hover + sticky/click + ~200ms delay (Task 2) ✓; permission-gated actions via additive flags (Task 1 + runtime reads `can_*`) ✓; resolved hidden, reopen via API/CLI (runtime filters `isOpen`; component filters `!resolved`; resolve sends `resolved:true`) ✓; pill toggles comment mode + open count (Task 3) ✓; signed-out → "Sign in to comment" + `request-signin` (Task 2 + component) ✓; token never crosses (component holds token; runtime only emits intents) ✓; no migration (Task 1 additive) ✓; Shadow-root isolation (Task 2 `attachShadow`) ✓; tests (Tasks 1,2,4) ✓; docs (Task 5) ✓.

**Placeholder scan:** none — all code blocks are complete; no TBD/"handle edge cases".

**Type/name consistency:** message types identical across runtime, component, and tests (`render-comments`, `set-mode`, `auth-state`, `ready`, `create-comment`, `resolve-comment`, `delete-comment`, `request-signin`). `commentCaps` returns `{canResolve,canDelete}`; `commentToJson` maps to `can_resolve`/`can_delete`; component & runtime read `can_resolve`/`can_delete`. Marker hook `data-ah-pin` used in runtime + e2e. `listCommentsForViewer` returns `{comment,caps}` consumed by the GET route.
