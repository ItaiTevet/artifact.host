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
  var selBtn=document.createElement('button'); selBtn.type='button'; selBtn.className='selbtn'; selBtn.textContent='\u{1F4AC} Comment'; root.appendChild(selBtn);

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

  function addClose(){ var c=document.createElement('button'); c.type='button'; c.className='close'; c.setAttribute('aria-label','Close'); c.textContent='\xd7'; c.onclick=function(e){ e.stopPropagation(); hidePop(); }; pop.appendChild(c); }

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
    if(mode!=='commenting'||sticky){ hideSelBtn(); pendingHL=null; return; }
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
    for(var i=0;i<path.length;i++){ var n=path[i]; if(n&&(n===selBtn||n===pop||(n.nodeType===1&&n.hasAttribute&&n.hasAttribute('data-ah-pin')))) return; }
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
  window.addEventListener('resize',function(){ layer.classList.toggle('touch',mobile()); render(); if(pop.style.display!=='none' && !pop.classList.contains('sheet') && sticky!=='__composer__') hidePop(); });
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',ready); } else { ready(); }
})();`;
}
