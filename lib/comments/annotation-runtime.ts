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
