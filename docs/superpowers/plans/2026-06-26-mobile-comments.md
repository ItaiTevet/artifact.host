# Mobile Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the **frontend-design** skill mindset for the in-iframe sheet/selection-button visuals — match the brand palette already baked into the runtime (`--ink #0e0c09`, `--bg #fefdfb`, `--rule #e2dbd2`, `--amber #b36b20`).

**Goal:** Make the comments feature work well on touch/mobile — touch-friendly highlighting via a selection button, a bottom-sheet comment card, bigger tap targets — and add a dedicated Playwright mobile test project.

**Architecture:** All changes are in the injected iframe runtime plus a tiny parent tweak; the comment data model, REST API, CLI, and security boundary are unchanged. Highlight capture moves from `mouseup` to a selection-driven floating button. The comment card becomes a bottom sheet on mobile (detected via `matchMedia`), tracking the visual viewport so the keyboard never covers the composer. A new `card {open}` message lets the parent hide the pill behind an open sheet on mobile.

**Tech Stack:** TypeScript, the existing `buildAnnotationScript` DOM-JS runtime, React (Next.js client component), Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-06-26-mobile-comments-design.md`.

---

## File Structure

- `lib/comments/annotation-runtime.ts` — **rewritten** `buildAnnotationScript`: selection → "💬 Comment" button (replaces `onMouseUp`), responsive bottom-sheet in `place()` + stylesheet, ~44px pin hit area (touch only), larger mobile buttons, `visualViewport` keyboard tracking, `card {open}` emit, sheet Close (×) control.
- `lib/comments/__tests__/annotation-runtime.test.ts` — updated assertions for the new behaviors.
- `components/comments/CommentableArtifact.tsx` — handle inbound `card` message; hide the pill while a sheet is open **on mobile** (parent `matchMedia`).
- `playwright.config.mjs` — add `projects`: a `desktop` project (existing specs) and a `mobile` project (touch viewport, runs `mobile.spec.mjs`).
- `e2e-browser/mobile.spec.mjs` — **new**: general mobile smoke + comments mobile flow.
- `package.json` — add `e2e:browser:mobile` convenience script.

**Message protocol (delta):** add iframe→parent `card { open: boolean }`. Everything else identical (`render-comments`/`set-mode`/`auth-state` in; `ready`/`create-comment`/`resolve-comment`/`delete-comment`/`request-signin` out). The created-comment payload is unchanged.

---

## Task 1: Rewrite the annotation runtime (touch highlight + bottom sheet + hit areas)

**Files:**
- Modify (rewrite): `lib/comments/annotation-runtime.ts`
- Test: `lib/comments/__tests__/annotation-runtime.test.ts`

- [ ] **Step 1: Update the runtime unit test (failing)**

Replace the ENTIRE contents of `lib/comments/__tests__/annotation-runtime.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';

describe('buildAnnotationScript', () => {
  it('embeds the nonce as a JSON string literal', () => {
    expect(buildAnnotationScript('abc-123')).toContain('"abc-123"');
  });
  it('is a self-invoking IIFE referencing the full message protocol', () => {
    const s = buildAnnotationScript('n');
    expect(s.trim().startsWith('(function')).toBe(true);
    for (const t of ['render-comments', 'create-comment', 'resolve-comment', 'delete-comment', 'set-mode', 'auth-state', 'request-signin', 'card']) {
      expect(s).toContain(t);
    }
  });
  it('uses a shadow root and tags markers with data-ah-pin', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('attachShadow');
    expect(s).toContain('data-ah-pin');
  });
  it('captures highlights via selection (not mouseup) with a Comment button', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('selectionchange');
    expect(s).toContain('💬 Comment');
    expect(s).not.toContain("addEventListener('mouseup'");
  });
  it('supports a mobile bottom sheet that tracks the keyboard, with a touch hit area', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('sheet');
    expect(s).toContain('visualViewport');
    expect(s).toContain('inset:-13px');
  });
  it('cannot break out of the host <script>', () => {
    expect(buildAnnotationScript('n').toLowerCase()).not.toContain('</script>');
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run lib/comments/__tests__/annotation-runtime.test.ts`
Expected: FAIL (current runtime has `mouseup`, no `selectionchange`/`card`/`sheet`).

- [ ] **Step 3: Rewrite `lib/comments/annotation-runtime.ts`**

Replace the ENTIRE file with EXACTLY (DOM-JS string; only single-quoted JS strings inside — CSS uses double quotes for `content:""`; the only interpolation is `${N}`; the 💬 and × are literal characters):

```ts
/** Builds the annotation runtime injected into a comment-enabled artifact's sandboxed iframe.
 *  Plain DOM JS (no imports). Renders pin markers, a hover/tap comment card (a bottom sheet on
 *  touch/mobile), and a selection-driven "Comment" button for highlights — all inside a Shadow
 *  root isolated from the artifact's CSS. Talks to the parent over postMessage tagged with `nonce`;
 *  never holds the auth token (emits write intents the parent executes).
 *  In: render-comments / set-mode / auth-state. Out: ready / create-comment / resolve-comment /
 *  delete-comment / request-signin / card. */
export function buildAnnotationScript(nonce: string): string {
  const N = JSON.stringify(nonce);
  return `(function(){
  var NONCE=${N};
  var mode='idle', comments=[], canPost=false, sticky=null, hideTimer=null, selTimer=null, pendingHL=null;
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
    +'.selbtn{position:absolute;pointer-events:auto;background:#0e0c09;color:#fefdfb;border:none;border-radius:8px;padding:9px 14px;font:13px ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3);display:none;min-height:40px;white-space:nowrap}';
  root.appendChild(style);
  var layer=document.createElement('div'); layer.className='layer'; root.appendChild(layer);
  var pop=document.createElement('div'); pop.className='pop'; pop.style.display='none'; root.appendChild(pop);
  var selBtn=document.createElement('button'); selBtn.type='button'; selBtn.className='selbtn'; selBtn.textContent='💬 Comment'; root.appendChild(selBtn);

  function post(m){ try{ m.nonce=NONCE; parent.postMessage(m,'*'); }catch(e){} }
  function docSize(){ var de=document.documentElement,b=document.body; return {w:Math.max(de.scrollWidth,b?b.scrollWidth:0,de.clientWidth), h:Math.max(de.scrollHeight,b?b.scrollHeight:0,de.clientHeight)}; }
  function clamp01(n){ return Math.min(1,Math.max(0,n)); }
  function isOpen(c){ return !c.resolved; }
  function mobile(){ try{ return window.matchMedia('(max-width:600px), (pointer:coarse)').matches; }catch(e){ return false; } }

  function clearOn(){ for(var i=0;i<layer.children.length;i++) layer.children[i].classList.remove('on'); }
  function syncSheetBottom(){ if(!vv||!pop.classList.contains('sheet')) return; var inset=Math.max(0, window.innerHeight-(vv.height+vv.offsetTop)); pop.style.bottom=inset+'px'; }
  function bindVV(){ if(vv){ vv.addEventListener('resize',syncSheetBottom); vv.addEventListener('scroll',syncSheetBottom); } }
  function unbindVV(){ if(vv){ vv.removeEventListener('resize',syncSheetBottom); vv.removeEventListener('scroll',syncSheetBottom); } }

  function hidePop(){ var was=pop.style.display!=='none'; pop.style.display='none'; pop.classList.remove('sheet'); pop.style.bottom=''; unbindVV(); sticky=null; clearOn(); if(was) post({type:'card',open:false}); }
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

  function addClose(){ var c=document.createElement('button'); c.type='button'; c.className='close'; c.setAttribute('aria-label','Close'); c.textContent='×'; c.onclick=function(e){ e.stopPropagation(); hidePop(); }; pop.appendChild(c); }

  function showTooltip(c,x,y,makeSticky){
    cancelHide(); hideSelBtn();
    if(makeSticky) sticky=c.id;
    pop.innerHTML=''; addClose();
    var who=document.createElement('div'); who.className='who'; who.textContent=c.author_name||'someone'; pop.appendChild(who);
    if(c.anchor&&c.anchor.kind==='highlight'&&c.anchor.quote){ var q=document.createElement('div'); q.className='quote'; q.textContent='\\u201C'+c.anchor.quote+'\\u201D'; pop.appendChild(q); }
    var b=document.createElement('div'); b.className='body'; b.textContent=c.body; pop.appendChild(b);
    if(c.can_resolve||c.can_delete){
      var row=document.createElement('div'); row.className='row';
      if(c.can_resolve){ var rb=document.createElement('button'); rb.textContent='Resolve'; rb.onclick=function(e){ e.stopPropagation(); post({type:'resolve-comment',id:c.id}); hidePop(); }; row.appendChild(rb); }
      if(c.can_delete){ var db=document.createElement('button'); db.textContent='Delete'; db.onclick=function(e){ e.stopPropagation(); post({type:'delete-comment',id:c.id}); hidePop(); }; row.appendChild(db); }
      pop.appendChild(row);
    }
    place(x,y); post({type:'card',open:true});
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

  function hideSelBtn(){ selBtn.style.display='none'; }
  function showSelBtn(rect){
    selBtn.style.display='block';
    var bw=selBtn.offsetWidth||120, bh=selBtn.offsetHeight||40;
    var sx=window.scrollX, sy=window.scrollY, vw=window.innerWidth, vh=window.innerHeight;
    var cx=rect.left+sx+rect.width/2, top=rect.top+sy-bh-8;
    var left=cx-bw/2; if(left<sx+4) left=sx+4; if(left+bw>sx+vw-4) left=sx+vw-bw-4;
    if(rect.top-bh-8<4) top=rect.bottom+sy+8;
    selBtn.style.left=left+'px'; selBtn.style.top=top+'px';
  }
  function evalSelection(){
    if(mode!=='commenting'||sticky==='__composer__'){ hideSelBtn(); pendingHL=null; return; }
    var sel=window.getSelection&&window.getSelection();
    if(!sel||sel.isCollapsed){ hideSelBtn(); pendingHL=null; return; }
    var q=String(sel).trim(); if(!q){ hideSelBtn(); pendingHL=null; return; }
    var rect=sel.getRangeAt(0).getBoundingClientRect(), s=docSize();
    pendingHL={ quote:q.slice(0,280), x:clamp01((rect.left+window.scrollX+rect.width/2)/(s.w||1)), y:clamp01((rect.top+window.scrollY)/(s.h||1)) };
    showSelBtn(rect);
  }
  function onSelChange(){ clearTimeout(selTimer); selTimer=setTimeout(evalSelection,150); }
  selBtn.addEventListener('pointerdown',function(e){ e.preventDefault(); }); // keep the page selection alive
  selBtn.addEventListener('mousedown',function(e){ e.preventDefault(); });
  selBtn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(!pendingHL) return; var hl=pendingHL; pendingHL=null; try{ var sel=window.getSelection&&window.getSelection(); if(sel) sel.removeAllRanges(); }catch(_){} hideSelBtn(); var s=docSize(); openComposer({kind:'highlight',x:hl.x,y:hl.y,quote:hl.quote}, hl.x*s.w, hl.y*s.h); });

  function render(){
    layer.innerHTML='';
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

  function setMode(m){ mode=m; if(m!=='commenting'){ hideSelBtn(); pendingHL=null; } try{ document.documentElement.style.cursor=(m==='commenting')?'crosshair':''; }catch(e){} }

  function onClick(ev){
    if(mode!=='commenting') return;
    if(sticky==='__composer__') return;
    var sel=window.getSelection&&window.getSelection(); if(sel&&!sel.isCollapsed) return; // a selection → highlight, not a pin
    var path=ev.composedPath?ev.composedPath():[];
    for(var i=0;i<path.length;i++){ var n=path[i]; if(n&&n.nodeType===1&&n.hasAttribute&&(n.hasAttribute('data-ah-pin')||n.className==='selbtn')) return; }
    ev.preventDefault(); ev.stopPropagation();
    var s=docSize(), x=ev.pageX, y=ev.pageY;
    openComposer({kind:'pin',x:clamp01(x/(s.w||1)),y:clamp01(y/(s.h||1))},x,y);
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
  document.addEventListener('selectionchange',onSelChange);
  document.addEventListener('pointerup',onSelChange);
  document.addEventListener('click',onOutside,false);
  window.addEventListener('keydown',function(e){ if(e.key==='Escape') hidePop(); });
  window.addEventListener('resize',function(){ layer.classList.toggle('touch',mobile()); render(); });
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',ready); } else { ready(); }
})();`;
}
```

- [ ] **Step 4: Run — verify the runtime test passes**

Run: `npx vitest run lib/comments/__tests__/annotation-runtime.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/comments/annotation-runtime.ts lib/comments/__tests__/annotation-runtime.test.ts
git commit -m "comments: touch-friendly highlight + bottom-sheet card + mobile hit areas in the runtime"
```
(End every commit body in this plan with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.)

---

## Task 2: Parent — hide the pill behind an open sheet on mobile

**Files:**
- Modify: `components/comments/CommentableArtifact.tsx`

> Integration-only; covered by the mobile e2e in Task 3. Verification = tsc + build.

- [ ] **Step 1: Add mobile detection + card state, handle the `card` message, gate the pill**

Edit `components/comments/CommentableArtifact.tsx` as follows.

(a) Add two state hooks after the existing `const [mode, setMode] = useState<'idle' | 'commenting'>('idle');` line:

```tsx
  const [cardOpen, setCardOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
```

(b) Add a mobile-detection effect. Place it next to the other effects (e.g., right after the `useEffect(() => { void load(); }, [load]);` line):

```tsx
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px), (pointer: coarse)');
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
```

(c) In the `onMessage` handler, add a `card` branch and include `cardOpen`-free deps. The handler's `else if` chain should gain (after the `request-signin` branch):

```tsx
      else if (d.type === 'card' && typeof (d as { open?: unknown }).open === 'boolean') setCardOpen((d as { open: boolean }).open);
```

Also widen the `d` cast type at the top of `onMessage` to include `open`:
```tsx
      const d = ev.data as { type?: string; nonce?: string; body?: string; anchor?: Anchor; id?: string; open?: boolean } | null;
```

(d) Gate the pill so it hides while a sheet is open on mobile. Replace the pill `<button>` JSX with a conditional:

```tsx
      {!(mobile && cardOpen) && (
        <button
          type="button"
          className={`${styles.pill} ${mode === 'commenting' ? styles.pillOn : ''}`}
          aria-pressed={mode === 'commenting'}
          onClick={toggleMode}
        >
          💬 {pillLabel}
        </button>
      )}
```

(The `onMessage` effect dependency array already re-subscribes on state changes; leave its deps as they are — `setCardOpen`/`setMobile` are stable setters and need not be listed.)

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: only the 2 pre-existing `components/home/DeployPanel.test.tsx:73-74` errors.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/comments/CommentableArtifact.tsx
git commit -m "comments: hide the pill while a comment sheet is open on mobile"
```

---

## Task 3: Playwright mobile project + mobile e2e

**Files:**
- Modify: `playwright.config.mjs`
- Create: `e2e-browser/mobile.spec.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a mobile project to the Playwright config**

Replace the ENTIRE contents of `playwright.config.mjs` with:

```js
import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Browser-level e2e in self-host mode (sqlite + local-password). Boots `next start` against
// an ephemeral DB. IMPORTANT: the app must be built with NEXT_PUBLIC_AUTH_PROVIDER=local-password
// (the auth provider is baked into the client bundle) — see `npm run e2e:browser`.
const PORT = 3399;
const BASE = `http://127.0.0.1:${PORT}`;

// Emulated mobile: a phone viewport with touch enabled, on chromium (we only install chromium,
// so we avoid the webkit-defaulting device descriptors and set the mobile traits inline).
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

export default defineConfig({
  testDir: './e2e-browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec\.mjs/ },
    { name: 'mobile', testMatch: /mobile\.spec\.mjs/, use: MOBILE },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DB_DRIVER: 'sqlite',
      AUTH_PROVIDER: 'local-password',
      NEXT_PUBLIC_AUTH_PROVIDER: 'local-password',
      AUTH_SECRET: randomBytes(24).toString('hex'),
      COOKIE_SECRET: randomBytes(24).toString('hex'),
      SQLITE_PATH: join(tmpdir(), `ah-browser-${randomBytes(4).toString('hex')}.db`),
      APP_BASE_URL: BASE,
    },
  },
});
```

- [ ] **Step 2: Create the mobile e2e spec**

Create `e2e-browser/mobile.spec.mjs` with:

```js
import { test, expect } from '@playwright/test';

const PASSWORD = 'browser-e2e-pass-123';

test('mobile smoke: home renders and a public artifact deploys + renders full-width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /share what your ai built/i })).toBeVisible();
  await page.getByPlaceholder(/paste your html/i).fill('<h1>mobile smoke</h1>');
  await page.getByRole('button', { name: /deploy artifact/i }).click();

  const viewLink = page.getByRole('link', { name: /view artifact/i });
  await expect(viewLink).toBeVisible();
  const url = await viewLink.getAttribute('href');
  await page.goto(url);

  const frame = page.frameLocator('iframe[title="artifact"]');
  await expect(frame.getByText('mobile smoke')).toBeVisible();
  // Full-width: the artifact iframe spans ~the whole 390px viewport.
  const box = await page.locator('iframe[title="artifact"]').boundingBox();
  expect(box.width).toBeGreaterThan(380);
});

test('mobile comments: pin sheet, composer sheet post, selection highlight, resolve', async ({ page }) => {
  const email = `e2e-m-${Date.now()}@browser.test`;

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
  await page.getByPlaceholder(/paste your html/i).fill('<h1>mobile comments</h1><p id="para">The quick brown fox jumps over the lazy dog.</p>');
  await page.getByRole('button', { name: /allow comments/i }).click();
  await page.getByRole('button', { name: /deploy artifact/i }).click();
  const url = await page.getByRole('link', { name: /view artifact/i }).getAttribute('href');

  await page.goto(url);
  const frame = page.frameLocator('iframe[title="artifact"]');
  await expect(frame.getByText('mobile comments')).toBeVisible();
  const pill = page.getByRole('button', { name: /💬/ });
  await expect(pill).toBeVisible();

  // Enter comment mode, tap the page → composer sheet appears. Retry: set-mode is async.
  await expect(async () => {
    await pill.click();
    await frame.locator('h1').click();
    await expect(frame.getByPlaceholder(/add a comment/i)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await frame.getByPlaceholder(/add a comment/i).fill('pin via sheet');
  await frame.getByRole('button', { name: /^post$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(1);

  // Highlight: drive a real selection inside the iframe, then the "Comment" button appears.
  await frame.locator('#para').evaluate((el) => {
    const d = el.ownerDocument, w = d.defaultView;
    const r = d.createRange(); r.selectNodeContents(el);
    const s = w.getSelection(); s.removeAllRanges(); s.addRange(r);
    d.dispatchEvent(new w.Event('selectionchange'));
    d.dispatchEvent(new w.Event('pointerup'));
  });
  const commentBtn = frame.getByRole('button', { name: /💬 Comment/ });
  await expect(commentBtn).toBeVisible({ timeout: 5000 });
  await commentBtn.click();
  await frame.getByPlaceholder(/add a comment/i).fill('highlight via selection');
  await frame.getByRole('button', { name: /^post$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(2);

  // Tap a pin → the bottom sheet shows the comment; resolve hides it.
  await frame.locator('[data-ah-pin]').first().click();
  await expect(frame.getByText('pin via sheet')).toBeVisible();
  await frame.getByRole('button', { name: /^resolve$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(1);
});
```

- [ ] **Step 3: Add the convenience script**

In `package.json`, add to `scripts` (after `"e2e:browser": "playwright test"`):

```json
    "e2e:browser:mobile": "playwright test --project=mobile"
```

- [ ] **Step 4: Run the e2e (desktop + mobile)**

Build the local-password bundle first (the config's webServer runs `next start`, which serves whatever is in `.next`):

Run: `NEXT_PUBLIC_AUTH_PROVIDER=local-password AUTH_PROVIDER=local-password DB_DRIVER=sqlite npm run build`
Then: `npm run e2e:browser`
Expected: all projects PASS — `desktop` (core.spec + comments.spec) and `mobile` (mobile.spec, 2 tests).

If the mobile selection step is flaky (the 150ms debounce + async render), the `toBeVisible({ timeout: 5000 })` on the Comment button already absorbs it; if needed, re-dispatch the events inside a `toPass` retry block (mirror the comment-mode retry above). Do not weaken assertions.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.mjs e2e-browser/mobile.spec.mjs package.json
git commit -m "test: add a Playwright mobile project + mobile comments e2e"
```

---

## Task 4: Full verification

- [ ] **Step 1: Unit suite**

Run: `npx vitest run`
Expected: 0 failures (the runtime test now has 6; everything else unchanged).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` (only the 2 pre-existing `DeployPanel.test.tsx:73-74` errors) and `NEXT_PUBLIC_AUTH_PROVIDER=local-password AUTH_PROVIDER=local-password DB_DRIVER=sqlite npm run build` (succeeds).

- [ ] **Step 3: Browser e2e (both projects)**

Run: `npm run e2e:browser`
Expected: desktop specs + mobile specs all green.

- [ ] **Step 4: Manual mobile smoke (optional, post-deploy)**

On a phone (or devtools device mode) against the deployed site: tap a pin → bottom sheet; toggle the pill → long-press select text → "💬 Comment" button → composer sheet stays above the keyboard → post; resolve hides the pin; the pill reappears after the sheet closes.

---

## Self-Review

**Spec coverage:** touch highlight via selection button replacing `mouseup` (Task 1 — `onSelChange`/`selBtn`, `mouseup` removed) ✓; bottom-sheet card on mobile + visualViewport keyboard tracking (Task 1 — `place()` sheet branch, `syncSheetBottom`/`bindVV`) ✓; ~44px pin hit area touch-only (Task 1 — `.layer.touch .pin::after{inset:-13px}`) ✓; bigger mobile buttons + Close control (Task 1 — `.pop.sheet` button rules, `.close`) ✓; selection button gated to comment mode (Task 1 — `evalSelection` mode check) ✓; pill hidden behind sheet on mobile via `card` message (Task 1 emit + Task 2 handler/gate) ✓; dedicated mobile Playwright project + smoke + comments flow (Task 3) ✓; no API/CLI/schema change (payloads unchanged) ✓; regression green (Task 4) ✓.

**Placeholder scan:** none — all steps contain complete code/commands.

**Type/name consistency:** message types consistent (`card` emitted in runtime `hidePop`/`showTooltip`/`openComposer`; handled in `CommentableArtifact` `onMessage`). Selectors consistent across runtime + e2e: pins `[data-ah-pin]`, composer placeholder `Add a comment…`, selection button text `💬 Comment`, Post button `^post$`, Resolve `^resolve$`, pill `💬`. `mobile()` (runtime) and `matchMedia('(max-width:600px), (pointer:coarse)')` (parent) use the same breakpoint. The runtime test asserts the exact tokens the runtime emits (`selectionchange`, `💬 Comment`, `sheet`, `visualViewport`, `inset:-13px`, `card`, and the absence of `addEventListener('mouseup'`).
