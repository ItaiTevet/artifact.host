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

  function setMode(m){ mode=m; try{ document.documentElement.style.cursor=(m==='commenting')?'crosshair':''; }catch(e){} }

  function onClick(ev){
    if(mode!=='commenting') return;
    var path=ev.composedPath?ev.composedPath():[];
    for(var i=0;i<path.length;i++){ var n=path[i]; if(n&&n.nodeType===1&&n.hasAttribute&&n.hasAttribute('data-ah-pin')) return; }
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
