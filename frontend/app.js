// Frontend application logic separated from HTML for maintainability
(function(){
  'use strict';
  let API_BASE = (()=>{ try { const stored=localStorage.getItem('plaque_api_base'); if(stored) return stored.replace(/\/$/,''); const o=location.origin||''; if(o.includes('github.io')) return 'https://YOUR-BACKEND.example.com/api'; if(!/^https?:/i.test(o)) return 'http://localhost:3001/api'; return o.replace(/\/$/,'')+'/api'; } catch { return 'http://localhost:3001/api'; } })();
  const qs=id=>document.getElementById(id);
  const els={ song:()=>qs('songInput'), knob:()=>qs('progressKnob'), bar:()=>qs('progressBar'), fill:()=>qs('progressFill'), cur:()=>qs('currentTime'), total:()=>qs('totalTime'), hidden:()=>qs('progressTime'), previewBtn:()=>qs('previewBtn'), downloadBtn:()=>qs('downloadBtn'), stage:()=>qs('previewStage'), status:()=>qs('statusBox'), meta:()=>qs('metaLine'), orderBtn:()=>qs('orderBtn'), orderStatus:()=>qs('orderStatus'), name:()=>qs('custName'), email:()=>qs('custEmail'), notes:()=>qs('custNotes') };
  let trackDurationSec=0,currentSec=0,dragging=false,lastSvg='',lastMeta=null,debounceId,isLoading=false;
  const format=sec=>{const m=Math.floor(sec/60);const s=sec%60;return `${m}:${String(s).padStart(2,'0')}`};
  function setStatus(msg,err=false){ const b=els.status(); b.textContent=msg; b.dataset.state=err?'error':'normal'; }
  function setOrderStatus(msg,err=false){ const b=els.orderStatus(); b.textContent=msg; b.dataset.state=err?'error':'normal'; }
  function toast(msg,type){ /* minimalist: use status areas only */ if(type==='error'){ setStatus(msg,true); } else { setStatus(msg); } }
  const pct=()=>trackDurationSec? currentSec/trackDurationSec : 0;
  function updateProgressUI(){ const p=(pct()*100).toFixed(3); els.knob().style.left=p+'%'; els.fill().style.width=p+'%'; els.cur().textContent=format(currentSec); els.hidden().value=format(currentSec); els.bar().setAttribute('aria-valuenow',currentSec); }
  function seek(clientX){ const rect=els.bar().getBoundingClientRect(); let x=Math.max(0,Math.min(rect.width,clientX-rect.left)); const frac=x/rect.width; currentSec=Math.min(trackDurationSec,Math.round(frac*trackDurationSec)); updateProgressUI(); }
  function attachSlider(){ const bar=els.bar(),knob=els.knob(); bar.addEventListener('mousedown',e=>{ if(e.target===knob){dragging=true;} else {seek(e.clientX); previewDebounced();}}); document.addEventListener('mousemove',e=>{ if(!dragging)return; seek(e.clientX);}); document.addEventListener('mouseup',()=>{ if(dragging){dragging=false; previewDebounced();}}); bar.addEventListener('keydown',e=>{ if(!trackDurationSec) return; let d=0; if(['ArrowRight','ArrowUp'].includes(e.key)) d=1; else if(['ArrowLeft','ArrowDown'].includes(e.key)) d=-1; else if(e.key==='Home'){currentSec=0;} else if(e.key==='End'){currentSec=trackDurationSec;} else return; currentSec=Math.min(trackDurationSec,Math.max(0,currentSec+d)); updateProgressUI(); previewDebounced(); e.preventDefault(); }); }
  async function fetchMetadata(q){
    const body=JSON.stringify({query:q});
    let r,j;
    try {
      r=await fetch(`${API_BASE}/spotify-metadata`,{method:'POST',headers:{'Content-Type':'application/json'},body});
      j=await r.json();
    } catch(e){
      throw new Error('Network error to API');
    }
    if(!r.ok||!j?.success) throw new Error(j?.error||`Lookup failed (HTTP ${r?.status||'?'})`);
    return j.data;
  }
  async function fetchPreview(q,progressTime){
    const r=await fetch(`${API_BASE}/preview-plaque`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,progressTime})});
    const ct=r.headers.get('content-type')||'';
    const raw=await r.text();
    const trimmed=raw.trimStart();
    const isSvg=/<svg[\s>]/i.test(trimmed);
    if(isSvg && r.ok) return raw;
    if(ct.includes('application/json')){
      try { const j=JSON.parse(raw); throw new Error(j.error||'Preview error'); } catch(e){ throw new Error(e.message||'Preview failed'); }
    }
    console.warn('Unexpected preview payload', { status:r.status, head:raw.slice(0,150) });
    throw new Error(`Preview failed${r.status?` (HTTP ${r.status})`:''}`);
  }
  function renderSvg(svg){ const stage=els.stage(); if(!svg){stage.innerHTML='<div class="placeholder">No preview</div>';return;} stage.innerHTML=svg; stage.classList.add('fade'); setTimeout(()=>stage.classList.remove('fade'),380); }
  function showSkeleton(){ els.stage().innerHTML='<div class="skeleton"></div>'; }
  async function preview(){
    const q=els.song().value.trim();
    if(!q){ setStatus('Enter a track (song + artist)'); return; }
    setStatus(`Searching track…\nAPI: ${API_BASE}`);
    toggleLoading(els.previewBtn(),true);
    isLoading=true;
    showSkeleton();
    try{
      const meta=await fetchMetadata(q);
      lastMeta=meta;
      if(meta.duration){
        const [m,s]=meta.duration.split(':').map(Number);
        trackDurationSec=m*60+s;
        els.bar().setAttribute('aria-valuemax',trackDurationSec);
        if(currentSec>trackDurationSec) currentSec=Math.round(trackDurationSec*0.4);
        els.total().textContent=meta.duration;
      } else { trackDurationSec=0; els.total().textContent='--:--'; }
      updateProgressUI();
      setStatus('Rendering preview…');
      const svg=await fetchPreview(q,els.hidden().value);
      lastSvg=svg; renderSvg(svg);
      setStatus('Preview ready');
      els.meta().textContent=`${meta.title} • ${meta.artist}`;
      els.downloadBtn().disabled=false; els.orderBtn()?.disabled=false; setOrderStatus('Ready to order');
    }
    catch(e){
      console.error('Preview error', e);
      setStatus(e.message,true);
      renderSvg(null);
      els.downloadBtn().disabled=true; els.orderBtn().disabled=true; els.meta().textContent='';
      setOrderStatus('Awaiting valid preview',true);
      toast('Preview failed','error');
    } finally { toggleLoading(els.previewBtn(),false); isLoading=false; }
  }
  const previewDebounced=()=>{ clearTimeout(debounceId); debounceId=setTimeout(preview,520); };
  async function downloadSvg(){
    const q=els.song().value.trim(); if(!q) return;
    try{
      setStatus('Generating clean SVG…');
      toggleLoading(els.downloadBtn(),true);
      const r=await fetch(`${API_BASE}/generate-plaque`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,progressTime:els.hidden().value,style:'minimal'})});
      const svg=await r.text();
      const trimmed=svg.trimStart();
      const isSvg=trimmed.startsWith('<?xml')||trimmed.startsWith('<svg');
      if(!r.ok || !isSvg){
        console.warn('Generate response not SVG:', { status:r.status, head:svg.slice(0,120) });
        throw new Error(`Generation failed${r.status?` (HTTP ${r.status})`:''}`);
      }
      const name=`spotify-plaque-${Date.now()}.svg`;
      const blob=new Blob([svg],{type:'image/svg+xml'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
      setStatus('SVG downloaded');
      toast('SVG downloaded','success');
    }catch(e){
      setStatus(e.message||'Download failed',true);
      toast('Download failed','error');
    } finally{
      toggleLoading(els.downloadBtn(),false);
    }
  }
  async function placeOrder(){ if(!lastMeta){ setOrderStatus('Preview first',true); return;} const name=els.name().value.trim(); const email=els.email().value.trim(); if(!name||!email){ setOrderStatus('Name & email required',true); return; } if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ setOrderStatus('Invalid email',true); return; } setOrderStatus('Placing order…'); toggleLoading(els.orderBtn(),true); try{ const body={ customer:{ name,email,notes:els.notes().value.trim() }, track:{ title:lastMeta.title, artist:lastMeta.artist, duration:lastMeta.duration, progress:els.hidden().value }, selection:{}, codes:[] }; const r=await fetch(`${API_BASE}/checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const j=await r.json(); if(!r.ok||!j.success) throw new Error(j.error||'Order failed'); setOrderStatus('Order placed #' + j.order.id); els.orderBtn().disabled=true; }catch(e){ setOrderStatus(e.message||'Order failed',true); } finally { toggleLoading(els.orderBtn(),false); }}
  function toggleLoading(btn,on){ if(!btn) return; const original=btn.dataset.originalText || btn.textContent; if(on){ if(!btn.dataset.originalText) btn.dataset.originalText=original; const loading=btn.getAttribute('data-loading-text')||'Working…'; btn.textContent=loading; btn.disabled=true; btn.classList.add('is-loading'); } else { if(btn.dataset.originalText){ btn.textContent=btn.dataset.originalText; } btn.disabled=false; btn.classList.remove('is-loading'); }}
  function initEvents(){
    els.song().addEventListener('input',previewDebounced);
    els.song().addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); preview(); }});
    els.previewBtn().addEventListener('click',preview);
    els.downloadBtn().addEventListener('click',downloadSvg);
    els.orderBtn()?.addEventListener('click', placeOrder);
    // API config events
    const apiInput=document.getElementById('apiEndpoint');
    const saveBtn=document.getElementById('saveApiBtn');
    const testBtn=document.getElementById('testApiBtn');
    const clearBtn=document.getElementById('clearApiBtn');
    const apiStatus=document.getElementById('apiStatus');
    if(apiInput){ apiInput.value=API_BASE; }
    function setApiStatus(msg,err=false){ if(apiStatus){ apiStatus.textContent=msg; apiStatus.dataset.state=err?'error':'normal'; }}
    saveBtn?.addEventListener('click',()=>{ const v=apiInput.value.trim().replace(/\/$/,''); if(!v){ setApiStatus('Enter URL',true); return;} API_BASE=v; localStorage.setItem('plaque_api_base',v); setApiStatus('Saved'); testApiBase(true); });
    clearBtn?.addEventListener('click',()=>{ localStorage.removeItem('plaque_api_base'); API_BASE='http://localhost:3001/api'; if(location.origin.includes('github.io')) API_BASE='https://YOUR-BACKEND.example.com/api'; apiInput.value=API_BASE; setApiStatus('Cleared to default'); testApiBase(true); });
    testBtn?.addEventListener('click',async()=>{ testApiBase(false); });
    setStatus(`Ready. API: ${API_BASE}`);
    testApiBase(true);
  }
  async function testApiBase(silent){
    const apiStatus=document.getElementById('apiStatus');
    const setApiStatus=(m,err)=>{ if(apiStatus){ apiStatus.textContent=m; apiStatus.dataset.state=err?'error':'normal'; } if(!silent){ setStatus(m,err); } };
    try {
      const controller=new AbortController();
      setTimeout(()=>controller.abort(),4000);
      const r=await fetch(`${API_BASE}/health`,{signal:controller.signal});
      if(!r.ok){ setApiStatus('Health HTTP '+r.status,true); return; }
      const t=await r.text();
      if(/healthy/i.test(t)){ setApiStatus('API OK'); }
      else { setApiStatus('Health unexpected',true); }
    } catch(e){
      console.warn('Health check failed', e);
      setApiStatus('API unreachable',true);
    }
  }
  (function init(){ console.log('[Plaque] Starting frontend'); console.log('[Plaque] Initial API_BASE=',API_BASE); attachSlider(); initEvents(); updateProgressUI(); const y=document.getElementById('year'); if(y) y.textContent=new Date().getFullYear(); })();
})();
