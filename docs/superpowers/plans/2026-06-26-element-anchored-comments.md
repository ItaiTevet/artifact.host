# Element-Anchored Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the **frontend-design** skill for the in-iframe visuals in Task 3 (the element outline + the inline edit affordance) — match the brand palette already in the runtime (`--ink #0e0c09`, `--bg #fefdfb`, `--rule #e2dbd2`, `--amber #b36b20`).

**Goal:** Anchor comments to content (pins → an element path; highlights → the quoted text) so markers survive reflow/width changes, expose the target to agents, add a creation-time element-outline, and surface comment editing (in-page + CLI).

**Architecture:** Anchors become `pin {path, context}` / `highlight {quote}` — no `x,y`. The iframe runtime captures the element path + a readable `context`, and at render resolves the element (or re-finds the quote via a TreeWalker), placing the marker at the element/quote's current top-left so it tracks reflow. A new `edit-comment` intent + `can_edit` capability surface author editing. No DB migration (anchor is JSON text).

**Tech Stack:** TypeScript, the `buildAnnotationScript` DOM-JS runtime, React (Next.js client component), the comment REST API + `comment-service`, the `cli/` package, Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-06-26-element-anchored-comments-design.md`.

---

## File Structure
- `lib/artifacts/comment-types.ts` — `Anchor` type (drop `x,y`), `coerceAnchor`, `parseAnchor`.
- `lib/artifacts/comment-service.ts` — add `canEdit` to `commentCaps`.
- `lib/http/comment-json.ts` — serialize `can_edit`.
- `lib/comments/annotation-runtime.ts` — element capture/resolve, quote TreeWalker, element-outline overlay, inline edit, `edit-comment` intent.
- `components/comments/CommentableArtifact.tsx` — handle `edit-comment`; pass `can_edit` into `render-comments`.
- `cli/src/commands.js` + `cli/src/cli.js` — `editComment` + a `comment-edit` command; pin location → `context`.
- Tests across the above; docs note in a final task is optional (covered by spec).

**Message protocol delta:** add iframe→parent `edit-comment { id, body }`. Everything else unchanged.

---

## Task 1: Anchor model — element/quote anchors (drop x,y)

**Files:** Modify `lib/artifacts/comment-types.ts`; Test `lib/artifacts/__tests__/coerce-anchor.test.ts` (exists) + add a parse test.

- [ ] **Step 1: Failing tests.** Replace the ENTIRE contents of `lib/artifacts/__tests__/coerce-anchor.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { coerceAnchor, parseAnchor, serializeAnchor } from '@/lib/artifacts/comment-types';

describe('coerceAnchor', () => {
  it('accepts a pin with a path + context', () => {
    expect(coerceAnchor({ kind: 'pin', path: [2, 0, 3], context: 'Hello' }))
      .toEqual({ kind: 'pin', path: [2, 0, 3], context: 'Hello' });
  });
  it('accepts an empty path (body) and caps context', () => {
    const a = coerceAnchor({ kind: 'pin', path: [], context: 'x'.repeat(500) });
    expect(a?.kind).toBe('pin');
    expect(a && a.kind === 'pin' && a.path).toEqual([]);
    expect(a && a.kind === 'pin' && a.context.length).toBe(160);
  });
  it('rejects a pin with a non-array / negative / non-integer path', () => {
    expect(coerceAnchor({ kind: 'pin', path: 'nope', context: '' })).toBeNull();
    expect(coerceAnchor({ kind: 'pin', path: [-1], context: '' })).toBeNull();
    expect(coerceAnchor({ kind: 'pin', path: [1.5], context: '' })).toBeNull();
  });
  it('accepts a highlight with a quote (capped) and rejects an empty one', () => {
    expect(coerceAnchor({ kind: 'highlight', quote: 'the text' }))
      .toEqual({ kind: 'highlight', quote: 'the text' });
    expect(coerceAnchor({ kind: 'highlight', quote: '   ' })).toBeNull();
    const big = coerceAnchor({ kind: 'highlight', quote: 'q'.repeat(500) });
    expect(big && big.kind === 'highlight' && big.quote.length).toBe(280);
  });
  it('rejects unknown / non-object input', () => {
    expect(coerceAnchor(null)).toBeNull();
    expect(coerceAnchor({ kind: 'blob' })).toBeNull();
  });
});

describe('parseAnchor', () => {
  it('round-trips a pin', () => {
    expect(parseAnchor(serializeAnchor({ kind: 'pin', path: [1, 2], context: 'hi' })))
      .toEqual({ kind: 'pin', path: [1, 2], context: 'hi' });
  });
  it('round-trips a highlight', () => {
    expect(parseAnchor(serializeAnchor({ kind: 'highlight', quote: 'q' })))
      .toEqual({ kind: 'highlight', quote: 'q' });
  });
  it('maps legacy x,y-only pins to an unresolvable sentinel (no throw)', () => {
    expect(parseAnchor('{"kind":"pin","x":0.5,"y":0.7}')).toEqual({ kind: 'pin', path: [-1], context: '' });
  });
  it('maps malformed/empty input to the sentinel', () => {
    expect(parseAnchor('not json')).toEqual({ kind: 'pin', path: [-1], context: '' });
    expect(parseAnchor(null)).toEqual({ kind: 'pin', path: [-1], context: '' });
  });
});
```

- [ ] **Step 2: Run — fail.** `npx vitest run lib/artifacts/__tests__/coerce-anchor.test.ts` → FAIL (old anchor uses x,y).

- [ ] **Step 3: Rewrite `lib/artifacts/comment-types.ts`.** Replace the whole file with:

```ts
/** Where a comment attaches. Pins bind to an element (child-index path from <body>); highlights
 *  bind to the quoted text (re-found at render). No page coordinates — anchors track content
 *  across reflow. `context` is a human/agent-readable description of a pin's target element. */
export type Anchor =
  | { kind: 'pin'; path: number[]; context: string }
  | { kind: 'highlight'; quote: string };

export interface CommentRecord {
  id: string;
  artifactSlug: string;
  authorId: string;
  authorEmail: string | null;   // null when authored via a PAT (no email available)
  body: string;
  anchor: Anchor;
  resolved: boolean;
  createdAt: Date;
}

export interface NewComment {
  artifactSlug: string;
  authorId: string;
  authorEmail: string | null;
  body: string;
  anchor: Anchor;
}

/** Serialize an anchor for a text column. */
export function serializeAnchor(a: Anchor): string {
  return JSON.stringify(a);
}

/** Parse a stored anchor; tolerant — legacy/ malformed rows become an unresolvable pin sentinel
 *  (path [-1]) that the runtime skips, never throwing. */
export function parseAnchor(raw: string | null | undefined): Anchor {
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (v && v.kind === 'highlight' && typeof v.quote === 'string') {
        return { kind: 'highlight', quote: v.quote };
      }
      if (v && v.kind === 'pin' && Array.isArray(v.path)
        && v.path.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0)) {
        return { kind: 'pin', path: v.path as number[], context: String(v.context ?? '') };
      }
    } catch { /* fall through */ }
  }
  return { kind: 'pin', path: [-1], context: '' };
}

/** Validate/normalize an untrusted anchor (from an HTTP body) into a real Anchor, or null. */
export function coerceAnchor(raw: unknown): Anchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (v.kind === 'pin') {
    if (!Array.isArray(v.path) || v.path.length > 60) return null;
    const path: number[] = [];
    for (const n of v.path) {
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
      path.push(n);
    }
    return { kind: 'pin', path, context: String(v.context ?? '').slice(0, 160) };
  }
  if (v.kind === 'highlight') {
    const quote = String(v.quote ?? '').slice(0, 280);
    if (!quote.trim()) return null;
    return { kind: 'highlight', quote };
  }
  return null;
}
```

- [ ] **Step 4: Run — pass.** `npx vitest run lib/artifacts/__tests__/coerce-anchor.test.ts` → PASS.

- [ ] **Step 5: Check fallout.** Run `npx vitest run` — other comment tests may reference old `{kind:'pin',x,y}` anchors. For any failing test that constructs a pin anchor, update the literal to the new shape (`{ kind:'pin', path:[0], context:'' }`); highlights become `{ kind:'highlight', quote:'…' }` (drop `x,y`). Do NOT change assertions about behavior — only the anchor literals. Re-run until green.

- [ ] **Step 6: Commit.**
```bash
git add lib/artifacts/comment-types.ts lib/artifacts/__tests__/coerce-anchor.test.ts
git commit -m "comments: element/quote anchors (drop x,y) in the anchor model"
```
(End every commit body in this plan with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.)

---

## Task 2: `can_edit` capability

**Files:** Modify `lib/artifacts/comment-service.ts`, `lib/http/comment-json.ts`; Test `lib/artifacts/__tests__/comment-service.test.ts`, `lib/http/__tests__/comment-json.test.ts`.

- [ ] **Step 1: Failing tests.** In `lib/artifacts/__tests__/comment-service.test.ts`, inside the existing `describe('commentCaps', ...)` block, add:

```ts
  it('can_edit only for the author (not a non-author owner)', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const author = { ownerId: 'rando', email: 'r@x.com' };
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(author));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, ctx(author)).canEdit).toBe(true);
    expect(commentCaps(rec!, c, ctx(OWNER)).canEdit).toBe(false);
    expect(commentCaps(rec!, c, ctx(null)).canEdit).toBe(false);
  });
```
The existing `comment-service.test.ts` defines `pin` as an anchor literal — update that literal at the top of the file to the new shape: `const pin: Anchor = { kind: 'pin', path: [0], context: '' };`.

In `lib/http/__tests__/comment-json.test.ts`, inside `describe('commentToJson capability flags', ...)`, add:
```ts
  it('includes can_edit', () => {
    const json = commentToJson(rec, { canResolve: true, canDelete: true, canEdit: true });
    expect((json as { can_edit?: boolean }).can_edit).toBe(true);
  });
```

- [ ] **Step 2: Run — fail.** `npx vitest run lib/artifacts/__tests__/comment-service.test.ts lib/http/__tests__/comment-json.test.ts`.

- [ ] **Step 3: Implement `canEdit`.** In `lib/artifacts/comment-service.ts`, update `commentCaps` and its return interface to add `canEdit` (author-only, gated by read):

```ts
export function commentCaps(
  record: ArtifactRecord, comment: CommentRecord, ctx: ReadContext,
): { canResolve: boolean; canDelete: boolean; canEdit: boolean } {
  const owner = isOwner(record, ctx.viewer);
  const readable = canRead(record, ctx);
  const isAuthor = !!ctx.viewer && ctx.viewer.ownerId === comment.authorId;
  return {
    canResolve: owner || (readable && canComment(record, ctx.viewer)),
    canDelete: owner || (readable && isAuthor),
    canEdit: readable && isAuthor,
  };
}
```
Update the `CommentWithCaps` interface's `caps` shape to include `canEdit: boolean`.

- [ ] **Step 4: Implement `can_edit` in the wire shape.** In `lib/http/comment-json.ts`, change `commentToJson` to accept and emit `canEdit`:

```ts
export function commentToJson(c: CommentRecord, caps?: { canResolve: boolean; canDelete: boolean; canEdit: boolean }) {
  const base = {
    id: c.id,
    body: c.body,
    anchor: c.anchor,
    author_name: authorName(c.authorEmail),
    resolved: c.resolved,
    created_at: c.createdAt.toISOString(),
  };
  return caps ? { ...base, can_resolve: caps.canResolve, can_delete: caps.canDelete, can_edit: caps.canEdit } : base;
}
```

- [ ] **Step 5: Run — pass.** `npx vitest run lib/artifacts/__tests__/comment-service.test.ts lib/http/__tests__/comment-json.test.ts` → PASS. Then `npx tsc --noEmit` → only the 2 pre-existing `DeployPanel.test.tsx:73-74` errors (fix any new type errors from the `caps` shape change in the routes if they arise — the GET route passes `caps` straight through, which now includes `canEdit`, so it's compatible).

- [ ] **Step 6: Commit.**
```bash
git add lib/artifacts/comment-service.ts lib/http/comment-json.ts lib/artifacts/__tests__/comment-service.test.ts lib/http/__tests__/comment-json.test.ts
git commit -m "comments: add author-only can_edit capability flag"
```

---

## Task 3: Rewrite the annotation runtime (element anchors + outline + edit)

**Files:** Modify (rewrite) `lib/comments/annotation-runtime.ts`; Test `lib/comments/__tests__/annotation-runtime.test.ts`.

- [ ] **Step 1: Update the runtime unit test.** Replace the ENTIRE contents of `lib/comments/__tests__/annotation-runtime.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';

describe('buildAnnotationScript', () => {
  it('embeds the nonce as a JSON string literal', () => {
    expect(buildAnnotationScript('abc-123')).toContain('"abc-123"');
  });
  it('emits the full message protocol incl. edit-comment', () => {
    const s = buildAnnotationScript('n');
    expect(s.trim().startsWith('(function')).toBe(true);
    for (const t of ['render-comments', 'create-comment', 'resolve-comment', 'delete-comment', 'edit-comment', 'set-mode', 'auth-state', 'request-signin', 'card']) {
      expect(s).toContain(t);
    }
  });
  it('anchors pins to an element path/context (no x,y) and re-finds highlight quotes', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain("kind:'pin',path:");
    expect(s).toContain('context:');
    expect(s).toContain('createTreeWalker');
    expect(s).not.toContain("kind:'pin',x:");
  });
  it('shows an element outline in comment mode and a Comment button for highlights', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('elementFromPoint');
    expect(s).toContain('outline');
    expect(s).toContain('💬 Comment');
  });
  it('uses a shadow root, tags markers, and cannot break out of <script>', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('attachShadow');
    expect(s).toContain('data-ah-pin');
    expect(s.toLowerCase()).not.toContain('</script>');
  });
});
```

- [ ] **Step 2: Run — fail.** `npx vitest run lib/comments/__tests__/annotation-runtime.test.ts`.

- [ ] **Step 3: Rewrite `lib/comments/annotation-runtime.ts`.** Replace the ENTIRE file with EXACTLY (single-quoted JS strings inside; CSS `content:""`/`outline` use double quotes; literal 💬 and ×; `\u{1F4AC}`/`\xd7`/`\\u201C`/`\\u2026` escapes are intentional; only `${N}` interpolates):

```ts
/** Builds the annotation runtime injected into a comment-enabled artifact's sandboxed iframe.
 *  Plain DOM JS (no imports). Pins anchor to an element (child-index path from <body>); highlights
 *  re-find the quoted text. Renders markers + a hover/tap card (bottom sheet on mobile), a
 *  selection "Comment" button, an element outline in comment mode, and inline editing — all in a
 *  Shadow root. Talks to the parent via postMessage tagged with `nonce`; never holds the token.
 *  In: render-comments / set-mode / auth-state. Out: ready / create-comment / resolve-comment /
 *  delete-comment / edit-comment / request-signin / card. */
export function buildAnnotationScript(nonce: string): string {
  const N = JSON.stringify(nonce);
  return `(function(){
  var NONCE=${N};
  var mode='idle', comments=[], canPost=false, sticky=null, hideTimer=null, selTimer=null, pendingHL=null, rafPending=false, target=null;
  var vv=window.visualViewport||null;

  var host=document.createElement('div');
  host.setAttribute('data-ah-host','');
  host.style.cssText='position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
  var root=host.attachShadow?host.attachShadow({mode:'open'}):host;
  var style=document.createElement('style');
  style.textContent='.layer{position:absolute;top:0;left:0;width:0;height:0;pointer-events:none}'
    +'.pin{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;width:18px;height:18px;background:#b36b20;border:2px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .1s;padding:0}'
    +'.pin:hover,.pin.on{transform:translate(-50%,-100%) scale(1.18)}'
    +'.layer.touch .pin::after{content:"";position:absolute;inset:-13px}'
    +'.outline{position:absolute;pointer-events:none;border:2px solid #b36b20;background:rgba(179,107,32,.08);border-radius:3px;box-sizing:border-box;display:none;z-index:2147483644}'
    +'.pop{position:absolute;max-width:280px;background:#fefdfb;color:#0e0c09;border:1px solid #e2dbd2;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.16);padding:10px 12px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;pointer-events:auto}'
    +'.pop.sheet{position:fixed;left:0;right:0;bottom:0;top:auto;width:100%;max-width:none;max-height:72vh;overflow:auto;border-radius:14px 14px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,.18);padding:18px 16px calc(16px + env(safe-area-inset-bottom));font-size:15px;line-height:1.6}'
    +'.who{font-weight:600;font-size:11px;color:#5a5449;margin-bottom:4px}'
    +'.pop.sheet .who{font-size:13px}'
    +'.quote{font-size:11px;color:#5a5449;border-left:2px solid #b36b20;padding-left:6px;margin-bottom:5px;opacity:.85;white-space:pre-wrap;word-break:break-word}'
    +'.pop.sheet .quote{font-size:13px}'
    +'.body{white-space:pre-wrap;word-break:break-word}'
    +'.row{display:flex;gap:12px;margin-top:8px;padding-top:7px;border-top:1px solid #e2dbd2}'
    +'.row button{font:11px ui-monospace,monospace;color:#5a5449;background:none;border:none;cursor:pointer;padding:0}'
    +'.row button:hover{color:#0e0c09}'
    +'.pop.sheet .row{gap:8px}.pop.sheet .row button{min-height:44px;padding:0 14px;border:1px solid #e2dbd2;border-radius:6px;font-size:13px}'
    +'textarea{width:240px;min-height:60px;font:13px ui-sans-serif,system-ui,sans-serif;color:#0e0c09;border:1px solid #e2dbd2;border-radius:5px;padding:6px;resize:vertical;outline:none;box-sizing:border-box}'
    +'.pop.sheet textarea{width:100%;min-height:96px;font-size:16px}'
    +'.crow{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}'
    +'.crow .post{background:#0e0c09;color:#fefdfb;border:none;border-radius:4px;padding:5px 12px;font:12px ui-monospace,monospace;cursor:pointer}'
    +'.crow .cancel{background:none;border:none;color:#a09890;font:12px ui-monospace,monospace;cursor:pointer}'
    +'.pop.sheet .crow{margin-top:12px}.pop.sheet .crow .post,.pop.sheet .crow .cancel{min-height:44px;padding:0 18px;font-size:14px;border-radius:6px}'
    +'.signin{font-size:12px;color:#5a5449}.pop.sheet .signin{font-size:15px}.signin button{color:#b36b20;text-decoration:underline;background:none;border:none;cursor:pointer;font:inherit;padding:0}'
    +'.close{position:absolute;top:6px;right:8px;width:36px;height:36px;border:none;background:none;color:#a09890;font-size:22px;line-height:1;cursor:pointer;display:none}'
    +'.pop.sheet .close{display:block}'
    +'.selbtn{position:absolute;pointer-events:auto;background:#0e0c09;color:#fefdfb;border:none;border-radius:8px;padding:9px 14px;font:13px ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3);display:none;min-height:40px;white-space:nowrap;z-index:2147483646}';
  root.appendChild(style);
  var layer=document.createElement('div'); layer.className='layer'; root.appendChild(layer);
  var outline=document.createElement('div'); outline.className='outline'; root.appendChild(outline);
  var pop=document.createElement('div'); pop.className='pop'; pop.style.display='none'; root.appendChild(pop);
  var selBtn=document.createElement('button'); selBtn.type='button'; selBtn.className='selbtn'; selBtn.textContent='\u{1F4AC} Comment'; root.appendChild(selBtn);

  function post(m){ try{ m.nonce=NONCE; parent.postMessage(m,'*'); }catch(e){} }
  function mobile(){ try{ return window.matchMedia('(max-width:600px), (pointer:coarse)').matches; }catch(e){ return false; } }
  function isOpen(c){ return !c.resolved; }

  // ── element anchoring ──
  function pinPath(el){ var p=[]; while(el && el!==document.body && el.parentElement){ var par=el.parentElement; p.unshift(Array.prototype.indexOf.call(par.children, el)); el=par; } return p; }
  function describe(el){ if(!el) return ''; var t=(el.textContent||'').replace(/\\s+/g,' ').trim(); if(t) return t.slice(0,160); var a=el.getAttribute&&(el.getAttribute('alt')||el.getAttribute('aria-label')||el.getAttribute('title')); if(a) return String(a).slice(0,160); return '<'+(el.tagName?el.tagName.toLowerCase():'el')+'>'; }
  function resolvePin(a){ if(!a||!Array.isArray(a.path)) return null; var el=document.body; if(!el) return null; for(var i=0;i<a.path.length;i++){ var idx=a.path[i]; if(typeof idx!=='number'||idx<0||!el.children||idx>=el.children.length) return null; el=el.children[idx]; } return el; }
  function findQuoteRect(quote){ if(!quote||!document.body) return null; var tw=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null); var nodes=[], full='', node; while(node=tw.nextNode()){ nodes.push([node, full.length]); full+=node.nodeValue||''; } var at=full.indexOf(quote); if(at<0) return null; var end=at+quote.length; function loc(pos){ for(var i=nodes.length-1;i>=0;i--){ if(nodes[i][1]<=pos) return [nodes[i][0], pos-nodes[i][1]]; } return [nodes[0][0],0]; } try{ var st=loc(at), en=loc(end); var r=document.createRange(); r.setStart(st[0],st[1]); r.setEnd(en[0],en[1]); return r.getBoundingClientRect(); }catch(e){ return null; } }
  function anchorRect(a){ if(!a) return null; if(a.kind==='highlight') return findQuoteRect(a.quote); var el=resolvePin(a); return el?el.getBoundingClientRect():null; }

  // ── card lifecycle ──
  function clearOn(){ for(var i=0;i<layer.children.length;i++) layer.children[i].classList.remove('on'); }
  function syncSheetBottom(){ if(!vv||!pop.classList.contains('sheet')) return; var inset=Math.max(0, window.innerHeight-(vv.height+vv.offsetTop)); pop.style.bottom=inset+'px'; }
  function bindVV(){ if(vv){ vv.addEventListener('resize',syncSheetBottom); vv.addEventListener('scroll',syncSheetBottom); } }
  function unbindVV(){ if(vv){ vv.removeEventListener('resize',syncSheetBottom); vv.removeEventListener('scroll',syncSheetBottom); } }
  function hidePop(){ var was=pop.style.display!=='none'; pop.style.display='none'; pop.classList.remove('sheet'); pop.style.bottom=''; unbindVV(); sticky=null; clearOn(); hideOutline(); if(was) post({type:'card',open:false}); }
  function scheduleHide(){ clearTimeout(hideTimer); hideTimer=setTimeout(function(){ if(!sticky) hidePop(); },200); }
  function cancelHide(){ clearTimeout(hideTimer); }
  function place(x,y){
    pop.style.display='block';
    if(mobile()){ pop.classList.add('sheet'); pop.style.left=''; pop.style.top=''; pop.style.bottom='0px'; bindVV(); syncSheetBottom(); return; }
    pop.classList.remove('sheet'); pop.style.bottom=''; unbindVV();
    var pw=pop.offsetWidth||280, ph=pop.offsetHeight||0;
    var vw=window.innerWidth, vh=window.innerHeight, sx=window.scrollX, sy=window.scrollY;
    var left=x+8; if(left+pw>sx+vw-4) left=x-pw-8; if(left<sx+4) left=sx+4;
    var top=y+8; if(top+ph>sy+vh-4) top=y-ph-8; if(top<sy+4) top=sy+4;
    pop.style.left=left+'px'; pop.style.top=top+'px';
  }
  function addClose(){ var c=document.createElement('button'); c.type='button'; c.className='close'; c.setAttribute('aria-label','Close'); c.textContent='\xd7'; c.onclick=function(e){ e.stopPropagation(); hidePop(); }; pop.appendChild(c); }

  function showTooltip(c,x,y,makeSticky){
    cancelHide(); hideSelBtn();
    if(makeSticky) sticky=c.id;
    pop.innerHTML=''; addClose();
    var who=document.createElement('div'); who.className='who'; who.textContent=c.author_name||'someone'; pop.appendChild(who);
    if(c.anchor&&c.anchor.kind==='highlight'&&c.anchor.quote){ var q=document.createElement('div'); q.className='quote'; q.textContent='\\u201C'+c.anchor.quote+'\\u201D'; pop.appendChild(q); }
    var b=document.createElement('div'); b.className='body'; b.textContent=c.body; pop.appendChild(b);
    if(c.can_edit||c.can_resolve||c.can_delete){
      var row=document.createElement('div'); row.className='row';
      if(c.can_edit){ var ie=document.createElement('button'); ie.textContent='Edit'; ie.onclick=function(e){ e.stopPropagation(); showEditor(c,x,y); }; row.appendChild(ie); }
      if(c.can_resolve){ var rb=document.createElement('button'); rb.textContent='Resolve'; rb.onclick=function(e){ e.stopPropagation(); post({type:'resolve-comment',id:c.id}); hidePop(); }; row.appendChild(rb); }
      if(c.can_delete){ var db=document.createElement('button'); db.textContent='Delete'; db.onclick=function(e){ e.stopPropagation(); post({type:'delete-comment',id:c.id}); hidePop(); }; row.appendChild(db); }
      pop.appendChild(row);
    }
    place(x,y); post({type:'card',open:true});
  }

  function showEditor(c,x,y){
    cancelHide(); sticky=c.id; pop.innerHTML=''; addClose();
    var ta=document.createElement('textarea'); ta.value=c.body; pop.appendChild(ta);
    var row=document.createElement('div'); row.className='crow';
    var cancel=document.createElement('button'); cancel.className='cancel'; cancel.textContent='Cancel'; cancel.onclick=function(e){ e.stopPropagation(); showTooltip(c,x,y,true); };
    var save=document.createElement('button'); save.className='post'; save.textContent='Save';
    save.onclick=function(e){ e.stopPropagation(); var v=ta.value.trim(); if(!v) return; post({type:'edit-comment',id:c.id,body:v}); hidePop(); };
    row.appendChild(cancel); row.appendChild(save); pop.appendChild(row);
    place(x,y); post({type:'card',open:true}); ta.focus();
  }

  function openComposer(anchor,x,y){
    cancelHide(); hideSelBtn();
    pop.classList.remove('sheet'); pop.style.bottom=''; unbindVV();
    sticky='__composer__'; pop.innerHTML=''; addClose();
    if(!canPost){
      var s=document.createElement('div'); s.className='signin';
      s.appendChild(document.createTextNode('Sign in to comment. '));
      var a=document.createElement('button'); a.textContent='Sign in'; a.onclick=function(e){ e.stopPropagation(); post({type:'request-signin'}); }; s.appendChild(a);
      pop.appendChild(s); place(x,y); post({type:'card',open:true}); return;
    }
    var ta=document.createElement('textarea'); ta.placeholder='Add a comment\\u2026'; pop.appendChild(ta);
    var row=document.createElement('div'); row.className='crow';
    var cancel=document.createElement('button'); cancel.className='cancel'; cancel.textContent='Cancel'; cancel.onclick=function(e){ e.stopPropagation(); hidePop(); };
    var pb=document.createElement('button'); pb.className='post'; pb.textContent='Post';
    pb.onclick=function(e){ e.stopPropagation(); var v=ta.value.trim(); if(!v) return; post({type:'create-comment',body:v,anchor:anchor}); hidePop(); };
    row.appendChild(cancel); row.appendChild(pb); pop.appendChild(row);
    place(x,y); post({type:'card',open:true}); ta.focus();
  }

  // ── element outline (comment mode) ──
  function showOutline(el){ if(!el){ outline.style.display='none'; return; } var r=el.getBoundingClientRect(); outline.style.left=(r.left+window.scrollX)+'px'; outline.style.top=(r.top+window.scrollY)+'px'; outline.style.width=r.width+'px'; outline.style.height=r.height+'px'; outline.style.display='block'; }
  function hideOutline(){ outline.style.display='none'; }
  function onMove(ev){ if(mode!=='commenting'||sticky||rafPending) return; rafPending=true; var cx=ev.clientX, cy=ev.clientY; requestAnimationFrame(function(){ rafPending=false; if(mode!=='commenting'||sticky) return; var el=document.elementFromPoint(cx,cy); if(!el||el===host||el===document.documentElement){ hideOutline(); return; } showOutline(el); }); }

  // ── selection highlight ──
  function hideSelBtn(){ selBtn.style.display='none'; }
  function showSelBtn(rect){
    selBtn.style.display='block';
    var bw=selBtn.offsetWidth||120, bh=selBtn.offsetHeight||40;
    var sx=window.scrollX, sy=window.scrollY, vw=window.innerWidth;
    var cx=rect.left+sx+rect.width/2, top=rect.top+sy-bh-8;
    var left=cx-bw/2; if(left<sx+4) left=sx+4; if(left+bw>sx+vw-4) left=sx+vw-bw-4;
    if(rect.top-bh-8<4) top=rect.bottom+sy+8;
    selBtn.style.left=left+'px'; selBtn.style.top=top+'px';
  }
  function evalSelection(){
    if(mode!=='commenting'||sticky){ hideSelBtn(); pendingHL=null; return; }
    var sel=window.getSelection&&window.getSelection();
    if(!sel||sel.isCollapsed){ hideSelBtn(); pendingHL=null; return; }
    var q=String(sel).trim(); if(!q){ hideSelBtn(); pendingHL=null; return; }
    var rect=sel.getRangeAt(0).getBoundingClientRect();
    pendingHL={ quote:q.slice(0,280), px:rect.left+window.scrollX+rect.width/2, py:rect.top+window.scrollY };
    hideOutline(); showSelBtn(rect);
  }
  function onSelChange(){ clearTimeout(selTimer); selTimer=setTimeout(evalSelection,150); }
  selBtn.addEventListener('pointerdown',function(e){ e.preventDefault(); });
  selBtn.addEventListener('mousedown',function(e){ e.preventDefault(); });
  selBtn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(!pendingHL) return; var hl=pendingHL; pendingHL=null; try{ var sel=window.getSelection&&window.getSelection(); if(sel) sel.removeAllRanges(); }catch(_){} hideSelBtn(); openComposer({kind:'highlight',quote:hl.quote}, hl.px, hl.py); });

  // ── render ──
  function render(){
    layer.innerHTML='';
    comments.filter(isOpen).forEach(function(c){
      var rect=anchorRect(c.anchor); if(!rect) return;
      var px=rect.left+window.scrollX, py=rect.top+window.scrollY;
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

  function setMode(m){ mode=m; if(m!=='commenting'){ hideSelBtn(); hideOutline(); pendingHL=null; } try{ document.documentElement.style.cursor=(m==='commenting')?'crosshair':''; }catch(e){} }

  function onClick(ev){
    if(mode!=='commenting') return;
    if(sticky==='__composer__') return;
    var sel=window.getSelection&&window.getSelection(); if(sel&&!sel.isCollapsed) return;
    var path=ev.composedPath?ev.composedPath():[];
    for(var i=0;i<path.length;i++){ var n=path[i]; if(n&&(n===selBtn||n===pop||(n.nodeType===1&&n.hasAttribute&&n.hasAttribute('data-ah-pin')))) return; }
    ev.preventDefault(); ev.stopPropagation();
    var el=ev.target; if(el===document.documentElement||!el) el=document.body;
    showOutline(el);
    openComposer({kind:'pin',path:pinPath(el),context:describe(el)}, ev.pageX, ev.pageY);
  }
  function onOutside(ev){ if(sticky&&ev.target!==host) hidePop(); }

  function ready(){ if(document.body){ document.body.appendChild(host); } layer.classList.toggle('touch',mobile()); render(); post({type:'ready'}); }
  window.addEventListener('message',function(ev){
    var d=ev.data; if(!d||d.nonce!==NONCE) return;
    if(d.type==='render-comments'){ comments=Array.isArray(d.comments)?d.comments:[]; render(); }
    else if(d.type==='set-mode'){ setMode(d.mode); }
    else if(d.type==='auth-state'){ canPost=!!d.canPost; }
  });
  document.addEventListener('click',onClick,true);
  document.addEventListener('mousemove',onMove);
  document.addEventListener('selectionchange',onSelChange);
  document.addEventListener('pointerup',onSelChange);
  document.addEventListener('click',onOutside,false);
  window.addEventListener('keydown',function(e){ if(e.key==='Escape') hidePop(); });
  window.addEventListener('resize',function(){ layer.classList.toggle('touch',mobile()); render(); if(pop.style.display!=='none' && !pop.classList.contains('sheet') && sticky!=='__composer__') hidePop(); });
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',ready); } else { ready(); }
})();`;
}
```

- [ ] **Step 4: Run — pass.** `npx vitest run lib/comments/__tests__/annotation-runtime.test.ts` → PASS (5 tests). `npx tsc --noEmit` → only the 2 pre-existing errors.

- [ ] **Step 5: Commit.**
```bash
git add lib/comments/annotation-runtime.ts lib/comments/__tests__/annotation-runtime.test.ts
git commit -m "comments: element-anchored pins + quote re-find + element outline + inline edit (runtime)"
```

---

## Task 4: Parent — handle `edit-comment` + pass `can_edit`

**Files:** Modify `components/comments/CommentableArtifact.tsx`. (Integration-only; verified by tsc/build + the e2e in Task 6.)

- [ ] **Step 1: Edit the component.**

(a) Widen the `Comment` interface to include the new flag:
```tsx
interface Comment {
  id: string; body: string; anchor: Anchor; author_name: string; resolved: boolean;
  created_at: string; can_resolve?: boolean; can_delete?: boolean; can_edit?: boolean;
}
```

(b) In `pushComments`, include `can_edit` in the mapped payload:
```tsx
      comments: list.filter((c) => !c.resolved).map((c) => ({
        id: c.id, anchor: c.anchor, body: c.body, author_name: c.author_name,
        can_resolve: !!c.can_resolve, can_delete: !!c.can_delete, can_edit: !!c.can_edit,
      })),
```

(c) Add an `edit` callback next to `resolve`/`remove`:
```tsx
  const edit = useCallback(async (id: string, body: string) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${id}`, {
      method: 'PATCH', headers: await authHeaders(true), body: JSON.stringify({ body }),
    });
    if (res.ok) await load();
  }, [slug, authHeaders, load]);
```

(d) In the `d` cast inside `onMessage`, add `body?` (already present) — ensure the type includes `id` and `body`. Add an `edit-comment` branch after `delete-comment`:
```tsx
      else if (d.type === 'edit-comment' && d.id && typeof d.body === 'string') void edit(d.id, d.body);
```
Add `edit` to that effect's dependency array (alongside `resolve`, `remove`).

- [ ] **Step 2: Verify.** `npx tsc --noEmit` → only the 2 pre-existing errors. `npx run build` is not a command — run `npm run build` → succeeds.

- [ ] **Step 3: Commit.**
```bash
git add components/comments/CommentableArtifact.tsx
git commit -m "comments: wire in-page edit (edit-comment intent + can_edit)"
```

---

## Task 5: CLI — edit command + pin location shows context

**Files:** Modify `cli/src/commands.js`, `cli/src/cli.js`.

- [ ] **Step 1: Add the `editComment` command helper.** In `cli/src/commands.js`, after `comments(...)`, add:
```js
export async function editComment(host, token, slug, id, body) {
  return apiFetch(host, `/api/artifacts/${encodeURIComponent(slug)}/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH', token, body: { body },
  });
}
```

- [ ] **Step 2: Wire the CLI command + fix the pin location display.** In `cli/src/cli.js`:

(a) Add `editComment` to the import from `./commands.js`.

(b) In the `comments` case, change the `where` computation so pins show their `context` instead of the removed `x,y`:
```js
        const where = c.anchor?.kind === 'highlight'
          ? `"${String(c.anchor.quote || '').slice(0, 40)}"`
          : `[${String(c.anchor?.context || 'pin').slice(0, 40)}]`;
```

(c) Add a new `comment-edit` case (place it right after the `comments` case):
```js
    case 'comment-edit': {
      const [slug, id, ...rest2] = rest;
      const body = rest2.join(' ').trim();
      if (!slug || !id || !body) throw new Error('usage: artifact comment-edit <slug> <id> "<new body>"');
      const { host, token } = await ctx(flags);
      await editComment(host, requireToken(token), slug, id, body);
      process.stdout.write(`Updated comment ${id}.\n`);
      return;
    }
```

(d) In the `HELP` string, add a line under the comments-related commands:
```
  artifact comment-edit <slug> <id> "<body>"        Edit a comment's body (author only)
```

- [ ] **Step 3: Verify the CLI parses.** Run `node cli/bin/artifact.js --help` and confirm it prints the help including the new `comment-edit` line (exit 0). (No network call.)

- [ ] **Step 4: Commit.**
```bash
git add cli/src/commands.js cli/src/cli.js
git commit -m "cli: comment-edit command + show pin context in comments listing"
```

---

## Task 6: e2e — cross-width regression + edit + outline

**Files:** Modify `e2e-browser/comments.spec.mjs` (add a cross-width + edit test) and confirm `e2e-browser/mobile.spec.mjs` still passes (its selection-driven highlight is unchanged; its pin is created+viewed on mobile so it resolves).

- [ ] **Step 1: Add a cross-width + edit test.** Append to `e2e-browser/comments.spec.mjs`:

```js
test('comments: pin survives a width change, and author can edit', async ({ page }) => {
  const email = `e2e-xw-${Date.now()}@browser.test`;
  await page.setViewportSize({ width: 1024, height: 800 });

  // Sign up.
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /create one/i }).click();
  await page.getByPlaceholder(/you@example\.com/i).fill(email);
  await page.getByPlaceholder(/^password$/i).fill('browser-e2e-pass-123');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /your artifacts/i })).toBeVisible();

  // Deploy a comment-enabled artifact with a clear element to anchor to.
  await page.goto('/');
  await expect(page.getByText(/saved to your dashboard/i)).toBeVisible();
  await page.getByPlaceholder(/paste your html/i).fill('<h1 id="t">anchor target</h1><p>filler one</p><p>filler two</p>');
  await page.getByRole('button', { name: /allow comments/i }).click();
  await page.getByRole('button', { name: /deploy artifact/i }).click();
  const url = await page.getByRole('link', { name: /view artifact/i }).getAttribute('href');

  await page.goto(url);
  const frame = page.frameLocator('iframe[title="artifact"]');
  await expect(frame.getByText('anchor target')).toBeVisible();

  // Create a pin on the H1 (desktop width). Retry: set-mode is async.
  await expect(async () => {
    await page.getByRole('button', { name: /💬/ }).click();
    await frame.locator('#t').click();
    await expect(frame.getByPlaceholder(/add a comment/i)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await frame.getByPlaceholder(/add a comment/i).fill('on the heading');
  await frame.getByRole('button', { name: /^post$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(1);

  // The pin's marker should sit on the H1. Capture the H1's top, and the marker's top.
  async function topsClose() {
    const h1 = await frame.locator('#t').boundingBox();
    const pin = await frame.locator('[data-ah-pin]').boundingBox();
    return Math.abs((pin.y) - (h1.y)) < 60; // marker anchored near the element's top
  }
  expect(await topsClose()).toBe(true);

  // Shrink to a mobile width and reload — the pin must still resolve onto the H1 (the bug fix).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(1);
  expect(await topsClose()).toBe(true);

  // Author edits the comment (back at a desktop width for the popover path).
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.reload();
  await frame.locator('[data-ah-pin]').click();
  await frame.getByRole('button', { name: /^edit$/i }).click();
  const ta = frame.getByRole('textbox');
  await ta.fill('edited body');
  await frame.getByRole('button', { name: /^save$/i }).click();
  await frame.locator('[data-ah-pin]').click();
  await expect(frame.getByText('edited body')).toBeVisible();
});
```

- [ ] **Step 2: Build + run both projects.**
```bash
NEXT_PUBLIC_AUTH_PROVIDER=local-password AUTH_PROVIDER=local-password DB_DRIVER=sqlite npm run build
npm run e2e:browser
```
Expected: all desktop + mobile specs PASS, including the new cross-width/edit test. The `topsClose` heuristic asserts the marker tracks the H1 across the width change — that's the core regression guard. If a selector needs adjusting to match reality, adjust the selector (not the assertion's intent). If the cross-width assertion fails, that's a real bug — report it, don't loosen the threshold to force green.

- [ ] **Step 3: Commit.**
```bash
git add e2e-browser/comments.spec.mjs
git commit -m "test: cross-width pin-anchoring regression + in-page edit e2e"
```

---

## Task 7: Full verification

- [ ] **Step 1:** `npx vitest run` → 0 failures.
- [ ] **Step 2:** `npx tsc --noEmit` → only the 2 pre-existing `DeployPanel.test.tsx:73-74` errors; `NEXT_PUBLIC_AUTH_PROVIDER=local-password AUTH_PROVIDER=local-password DB_DRIVER=sqlite npm run build` → succeeds.
- [ ] **Step 3:** `npm run e2e:browser` → all projects green.
- [ ] **Step 4 (manual, post-deploy):** re-create the two demo pins on `8j3q4qv` (they're legacy `x,y`-only and won't render); verify a comment created at desktop width renders on its element at mobile width and vice-versa; the element outline appears in comment mode; edit a comment in-page and via `node cli/bin/artifact.js comment-edit <slug> <id> "…"`; `comments --json` shows pin `context` / highlight `quote`.

---

## Self-Review

**Spec coverage:** element/quote anchors, no x,y (Task 1) ✓; `context` for agents (Task 1 `coerceAnchor` + Task 3 `describe`) ✓; element resolution + quote TreeWalker re-find, marker at element top-left, re-resolve on render/resize (Task 3) ✓; element-outline UX desktop hover (`onMove`/`elementFromPoint`) + mobile tap (`onClick` `showOutline`) (Task 3) ✓; `can_edit` author-only + in-page edit (`edit-comment`) + CLI `comment-edit` (Tasks 2,3,4,5) ✓; pin location → context in CLI (Task 5) ✓; cross-width regression + edit e2e (Task 6) ✓; no DB migration (anchor JSON) ✓; legacy x,y → skip sentinel, demo pins re-created (Task 1 + Task 7 manual) ✓.

**Placeholder scan:** none — complete code/commands throughout. (Step in Task 4 fixed a typo: the build command is `npm run build`.)

**Type/name consistency:** `Anchor` = `pin{path,context}` | `highlight{quote}` used identically in comment-types, coerceAnchor/parseAnchor, runtime capture (`{kind:'pin',path,context}` / `{kind:'highlight',quote}`) and resolve (`resolvePin`/`findQuoteRect`). Caps `{canResolve,canDelete,canEdit}` consistent across `commentCaps`, `CommentWithCaps`, `commentToJson` (`can_edit`), runtime (`c.can_edit`) and parent (`can_edit`). Message types consistent: `edit-comment {id,body}` emitted by runtime, handled by parent. Selectors used by e2e (`[data-ah-pin]`, `^post$`, `^edit$`, `^save$`, `💬`, `add a comment`) match the runtime's emitted text.
