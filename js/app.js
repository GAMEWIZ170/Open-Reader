const $=id=>document.getElementById(id);
const view=$('view'),home=$('home');
let fs=16, pdfScale=1;

// theme
$('th').onclick=()=>{
  const r=document.documentElement;
  const dark=getComputedStyle(r).getPropertyValue('--bg').trim()==='#111418';
  r.dataset.theme=dark?'light':'dark';
};
// text size
function setFs(d){fs=Math.min(30,Math.max(11,fs+d));view.style.fontSize=fs+'px';}
$('zi').onclick=()=>{ if(view.dataset.kind==='pdf'){pdfScale=Math.min(3,pdfScale+.25);renderPdfAgain();} else setFs(2);};
$('zo').onclick=()=>{ if(view.dataset.kind==='pdf'){pdfScale=Math.max(.5,pdfScale-.25);renderPdfAgain();} else setFs(-2);};

// open
$('f').onchange=e=>{ if(e.target.files[0]) openFile(e.target.files[0]); e.target.value=''; };
const drop=$('drop');
['dragover','dragenter'].forEach(t=>document.addEventListener(t,e=>{e.preventDefault();drop.classList.add('on')}));
['dragleave','drop'].forEach(t=>document.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('on')}));
document.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) openFile(f); });

const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function show(html,kind){
  home.style.display='none'; view.style.display='block'; view.dataset.kind=kind||'';
  $('zi').style.display=$('zo').style.display='';
  view.innerHTML=html; view.style.fontSize=kind==='pdf'?'':fs+'px'; window.scrollTo(0,0);
}
const doc=h=>'<div class="doc">'+h+'</div>';

async function openFile(file){
  $('title').textContent=file.name;
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  show('<div class="err" style="color:var(--mu)">Opening…</div>');
  try{
    if(ext==='pdf') return await openPdf(file);
    if(ext==='docx') return await openDocx(file);
    if(['xlsx','xls','xlsm','ods','csv','tsv'].includes(ext)) return await openSheet(file);
    if(ext==='pptx') return await openPptx(file);
    if(ext==='epub') return await openEpub(file);
    if(file.type.startsWith('image/')||['png','jpg','jpeg','gif','webp','svg','bmp'].includes(ext)){
      const u=URL.createObjectURL(file); return show(doc('<img src="'+u+'" alt="">'));
    }
    if(['md','markdown'].includes(ext)) return show(doc(marked.parse(await file.text())));
    if(['html','htm'].includes(ext)){
      const d=new DOMParser().parseFromString(await file.text(),'text/html');
      d.querySelectorAll('script,iframe,object,embed,link,style').forEach(n=>n.remove());
      d.querySelectorAll('*').forEach(n=>[...n.attributes].forEach(a=>{ if(/^on/i.test(a.name)) n.removeAttribute(a.name); }));
      return show(doc(d.body.innerHTML));
    }
    if(ext==='json'){
      const t=await file.text(); let o; try{o=JSON.stringify(JSON.parse(t),null,2)}catch(e){o=t}
      return show(doc('<pre>'+esc(o)+'</pre>'));
    }
    if(ext==='doc'){ const ps=Legacy.docText(await file.arrayBuffer());
      return show(doc(ps.map(p=>'<p style="white-space:pre-wrap;margin:0 0 .8em">'+esc(p)+'</p>').join(''))); }
    if(ext==='ppt') return show(doc(slideCards(Legacy.pptSlides(await file.arrayBuffer()))));
    // fallback: try as text
    const t=await file.text();
    if(/\u0000/.test(t.slice(0,2000))) throw new Error('This file type is not supported yet.');
    show(doc('<pre>'+esc(t)+'</pre>'));
  }catch(e){ show('<div class="err">Could not open this file.<br><small>'+esc(e.message||e)+'</small></div>'); }
}

// PDF
let pdfDoc=null;
async function openPdf(file){
  pdfScale=1;
  pdfDoc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  renderPdfAgain();
}
function renderPdfAgain(){
  show('<div id="pdf"></div>','pdf');
  const box=$('pdf');
  const io=new IntersectionObserver(es=>es.forEach(en=>{
    if(en.isIntersecting && !en.target.dataset.done){ en.target.dataset.done=1; drawPage(en.target); }
  }),{rootMargin:'600px'});
  for(let i=1;i<=pdfDoc.numPages;i++){
    const d=document.createElement('div'); d.className='pg'; d.dataset.n=i;
    d.style.width=Math.min(window.innerWidth-24,900)*pdfScale+'px'; d.style.aspectRatio='0.77';
    box.appendChild(d); io.observe(d);
  }
}
async function drawPage(d){
  const p=await pdfDoc.getPage(+d.dataset.n);
  const w=Math.min(window.innerWidth-24,900)*pdfScale;
  const vp0=p.getViewport({scale:1}), sc=w/vp0.width, dpr=window.devicePixelRatio||1;
  const vp=p.getViewport({scale:sc*dpr});
  const c=document.createElement('canvas'); c.width=vp.width; c.height=vp.height; c.style.width=w+'px';
  d.style.aspectRatio=''; d.style.minHeight='0'; d.appendChild(c);
  await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
}

// DOCX
async function openDocx(file){
  const r=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});
  show(doc('<div class="wrap">'+r.value+'</div>'));
}

// Spreadsheets
async function openSheet(file){
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
  const names=wb.SheetNames;
  const html=names.map(n=>XLSX.utils.sheet_to_html(wb.Sheets[n],{header:'',footer:''}));
  show('<div class="doc"><div class="tabs" id="tabs"></div><div id="sh" class="wrap"></div></div>');
  const sh=$('sh'),tabs=$('tabs');
  names.forEach((n,i)=>{
    const b=document.createElement('button'); b.textContent=n; b.className=i?'g':'';
    b.onclick=()=>{ [...tabs.children].forEach(x=>x.className='g'); b.className=''; sh.innerHTML=html[i]; };
    tabs.appendChild(b);
  });
  sh.innerHTML=html[0];
}

// PPTX + shared slide renderer
function slideCards(sl){
  return sl.map((s,i)=>'<div class="slide"><h3>Slide '+(i+1)+'</h3>'
    +(s.title?'<h2 style="margin:0 0 8px;font-size:1.15em">'+esc(s.title)+'</h2>':'')
    +s.paras.map(p=>'<p style="margin:4px 0">'+esc(p)+'</p>').join('')+(s.imgs||'')
    +(!s.title&&!s.paras.length&&!s.imgs?'<em style="color:var(--mu)">No text</em>':'')+'</div>').join('')||'No slides found.';
}
async function openPptx(file){
  const z=await JSZip.loadAsync(await file.arrayBuffer());
  const names=Object.keys(z.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a,b)=>parseInt(a.match(/(\d+)\.xml/)[1])-parseInt(b.match(/(\d+)\.xml/)[1]));
  const slides=[], xml=s=>new DOMParser().parseFromString(s,'text/xml');
  for(const n of names){
    const x=xml(await z.file(n).async('string')), s={title:'',paras:[],imgs:''};
    for(const sp of [...x.getElementsByTagName('p:sp'),...x.getElementsByTagName('p:graphicFrame')]){
      const ph=sp.getElementsByTagName('p:ph')[0], ty=ph&&ph.getAttribute('type');
      const ps=[...sp.getElementsByTagName('a:p')].map(p=>[...p.getElementsByTagName('a:t')].map(t=>t.textContent).join('')).filter(Boolean);
      if(ty==='title'||ty==='ctrTitle') s.title=ps.join(' '); else s.paras.push(...ps);
    }
    const rf=z.file(n.replace('slides/','slides/_rels/')+'.rels');
    if(rf) for(const e of xml(await rf.async('string')).getElementsByTagName('Relationship')){
      const m=(e.getAttribute('Target')||'').match(/([^/]+\.(png|jpe?g|gif|webp|bmp))$/i), f=m&&z.file('ppt/media/'+m[1]);
      if(!f) continue;
      const b=new Blob([await f.async('arraybuffer')],{type:'image/'+m[2].toLowerCase().replace('jpg','jpeg')});
      s.imgs+='<img src="'+URL.createObjectURL(b)+'" alt="">';
    }
    slides.push(s);
  }
  show(doc(slideCards(slides)));
}

// EPUB
async function openEpub(file){
  const z=await JSZip.loadAsync(await file.arrayBuffer());
  const xml=async p=>new DOMParser().parseFromString(await z.file(p).async('string'),'text/xml');
  const cont=await xml('META-INF/container.xml');
  const opfPath=cont.querySelector('rootfile').getAttribute('full-path');
  const base=opfPath.includes('/')?opfPath.replace(/[^/]*$/,''):'';
  const opf=await xml(opfPath);
  const man={}; opf.querySelectorAll('manifest > item').forEach(i=>man[i.getAttribute('id')]=i.getAttribute('href'));
  let out='';
  for(const ref of opf.querySelectorAll('spine > itemref')){
    const href=man[ref.getAttribute('idref')]; if(!href) continue;
    const f=z.file(decodeURIComponent(base+href)); if(!f) continue;
    const d=new DOMParser().parseFromString(await f.async('string'),'text/html');
    d.querySelectorAll('script,style,link,img,svg,image').forEach(n=>n.remove());
    out+=d.body.innerHTML+'<hr>';
  }
  show(doc(out||'Empty book.'));
}

// back to home on title tap
$('title').onclick=()=>{ view.style.display='none'; view.innerHTML=''; home.style.display=''; $('title').textContent='Open Reader'; $('zi').style.display=$('zo').style.display='none'; };
