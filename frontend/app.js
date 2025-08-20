// Frontend application logic separated from HTML for maintainability
(function(){
  'use strict';
  // Configure your Render.com backend URL here
  const RENDER_API_URL = 'https://spotifyplaque.onrender.com/api'; // Your actual Render URL
  const API_BASE = (()=>{ 
    // If RENDER_API_URL is configured (not the placeholder), use it
    if(RENDER_API_URL && !RENDER_API_URL.includes('your-app-name')) {
      console.log('Using configured Render URL:', RENDER_API_URL);
      return RENDER_API_URL;
    }
    // Otherwise detect from current location
    try { 
      const o=location.origin||''; 
      if(!/^https?:/i.test(o)) return 'http://localhost:3001/api'; 
      return o.replace(/\/$/,'')+'/api'; 
    } catch { 
      return 'http://localhost:3001/api'; 
    } 
  })();
  console.log('Final API_BASE:', API_BASE);
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
    console.log('Fetching metadata for:', q);
    const body=JSON.stringify({query:q}); 
    console.log('API_BASE:', API_BASE);
    console.log('Request URL:', `${API_BASE}/spotify-metadata`);
    const r=await fetch(`${API_BASE}/spotify-metadata`,{method:'POST',headers:{'Content-Type':'application/json'},body}); 
    console.log('Metadata response status:', r.status);
    const j=await r.json(); 
    console.log('Metadata response:', j);
    if(!r.ok||!j.success) throw new Error(j.error||'Lookup failed'); 
    return j.data; 
  }
  async function fetchPreview(q,progressTime){
    console.log('Fetching preview for:', q, 'at time:', progressTime);
    const r=await fetch(`${API_BASE}/preview-plaque`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,progressTime})});
    console.log('Preview response status:', r.status);
    const ct=r.headers.get('content-type')||'';
    console.log('Preview content-type:', ct);
    const raw=await r.text();
    console.log('Preview response length:', raw.length);
    const trimmed=raw.trimStart();
    const isSvg=/<svg[\s>]/i.test(trimmed);
    console.log('Is SVG:', isSvg);
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
    console.log('Preview function called');
    const q=els.song().value.trim(); 
    console.log('Song input value:', q);
    if(!q){ setStatus('Enter a track (song + artist)'); return; } 
    setStatus('Searching track…'); 
    toggleLoading(els.previewBtn(),true); 
    isLoading=true; 
    showSkeleton(); 
    try{ 
      console.log('About to fetch metadata...');
      const meta=await fetchMetadata(q); 
      console.log('Got metadata:', meta);
      lastMeta=meta; 
      if(meta.duration){ 
        const [m,s]=meta.duration.split(':').map(Number); 
        trackDurationSec=m*60+s; 
        els.bar().setAttribute('aria-valuemax',trackDurationSec); 
        if(currentSec>trackDurationSec) currentSec=Math.round(trackDurationSec*0.4); 
        els.total().textContent=meta.duration; 
      } else { 
        trackDurationSec=0; 
        els.total().textContent='--:--'; 
      } 
      updateProgressUI(); 
      setStatus('Rendering preview…'); 
      console.log('About to fetch preview...');
      const svg=await fetchPreview(q,els.hidden().value); 
      console.log('Got SVG, length:', svg.length);
      lastSvg=svg; 
      renderSvg(svg); 
      setStatus('Preview ready'); 
      els.meta().textContent=`${meta.title} • ${meta.artist}`; 
      els.downloadBtn().disabled=false; 
      els.orderBtn()?.disabled=false; 
      setOrderStatus('Ready to order'); 
    } catch(e){ 
      console.error('Preview error:', e); 
      setStatus(e.message,true); 
      renderSvg(null); 
      els.downloadBtn().disabled=true; 
      els.orderBtn().disabled=true; 
      els.meta().textContent=''; 
      setOrderStatus('Awaiting valid preview',true); 
      toast('Preview failed','error'); 
    } finally { 
      toggleLoading(els.previewBtn(),false); 
      isLoading=false; 
    }
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
  function initEvents(){ els.song().addEventListener('input',previewDebounced); els.song().addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); preview(); }}); els.previewBtn().addEventListener('click',preview); els.downloadBtn().addEventListener('click',downloadSvg); els.orderBtn()?.addEventListener('click', placeOrder); }
  (function init(){ attachSlider(); initEvents(); updateProgressUI(); const y=document.getElementById('year'); if(y) y.textContent=new Date().getFullYear(); })();
})();
