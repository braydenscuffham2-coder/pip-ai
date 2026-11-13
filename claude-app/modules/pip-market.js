// Extracted from claude-app/pip.html (<script id="pip-market">). Edit the build, not this copy.
/* Pip Market: where the business really shows up on Google Maps, how many people around it search for
   what it does, and (once Google's PageSpeed API is on) how fast its site is on a phone. Fetched once per
   scan from site-kit through the Pip Reader connector, and shown as cards on the "You" page. */
(()=>{
const KIT="https://YOUR-PROJECT-REF.supabase.co/functions/v1/site-kit";
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH=["January","February","March","April","May","June","July","August","September","October","November","December"];
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const dom=d=>String(d||"").toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").split(/[/?#]/)[0];
const num=n=>Number(n).toLocaleString("en-US");
const an=w=>/^(hour|honest)/i.test(w)||/^[aeio]/i.test(w)||/^u(?!ni|s[aeu])/i.test(w)?"an":"a";
const S=new Map(),L=new Set();
const ping=()=>L.forEach(f=>{try{f()}catch{}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function read(url){
  const m=await globalThis.claude?.use?.("mcp");
  if(!m||typeof globalThis.__pipRead!=="function")return null;
  const o=await globalThis.__pipRead(m,url,4e5);
  const t=typeof o?.payload==="string"?o.payload:(Array.isArray(o?.content)?o.content.map(b=>b&&b.text||"").join(""):"");
  try{return JSON.parse(t)}catch{}
  const i=t.indexOf("{"),j=t.lastIndexOf("}");
  if(i>=0&&j>i)try{return JSON.parse(t.slice(i,j+1))}catch{}
  return null;
}
// What the page already knows, in case the scan's own row is missing it (when Google was read another way).
function hints(g){
  const p=g?.place&&typeof g.place==="object"?g.place:null,at=g?.presence?.at,q=[];
  const add=(k,v)=>{v!=null&&v!==""&&q.push(`&${k}=${encodeURIComponent(String(v).slice(0,80))}`)};
  add("kind",g?.industry?.type||p?.primaryType);add("kname",g?.industry?.name);add("city",g?.industry?.city);
  if(Number.isFinite(at?.lat)&&Number.isFinite(at?.lng)){add("lat",at.lat);add("lng",at.lng)}
  add("place",p?.id);add("name",p?.name);
  return q.join("");
}
// The two example businesses on Pip's home screen carry their numbers with them: opening a demo is
// instant and costs nothing. (Filled in from real lookups; see BAKED below.)
const BAKED=/*BAKED*/{}/*END*/;
function want(g){
  const d=dom(g?.domain);
  if(!d||S.has(d))return;
  const st={insight:null,speed:null};S.set(d,st);
  const b=BAKED[d];
  if(b){st.insight=b.insight||null;st.speed=b.speed||null}
  const u=`${KIT}?d=${encodeURIComponent(d)}`;
  if(!st.insight)(async()=>{
    for(let k=0;k<3;k++){
      let r=null;try{r=await read(`${u}&insight=1${hints(g)}&t=${Date.now()}`)}catch{}
      if(r&&r.ok&&(r.maps?.length||r.demand)){st.insight=r;ping();return}
      if(!r||!(r.pending||r.error==="no_scan"))return;
      await wait(r.pending?12000:6000);
    }
  })();
  if(!st.speed)(async()=>{
    for(let k=0;k<2;k++){
      let r=null;try{r=await read(`${u}&speed=1&t=${Date.now()}`)}catch{}
      if(r&&r.ok&&Number.isFinite(r.score)){st.speed=r;ping();return}
      if(!r||!r.pending)return;
      await wait(15000);
    }
  })();
}
const got=g=>S.get(dom(g?.domain))||null;

// The presence card's Maps line uses the same search, so every page quotes the same number.
function mapsRow(g){
  want(g);
  const m=got(g)?.insight?.maps?.[0];
  if(!m||!Array.isArray(m.top)||m.top.length<3)return null;
  return{dfs:!0,query:m.query,rank:m.rank||null,checked:m.checked,ahead:m.top.filter(t=>!t.you).map(t=>t.name)};
}

function cards(g,arr){
  if(!g)return;
  want(g);
  const st=got(g);if(!st)return;
  const ins=st.insight,m=ins?.maps?.[0],dm=ins?.demand,sp=st.speed;
  if(m&&Array.isArray(m.top)&&m.top.length>=3){
    const r=m.rank,q=m.query,lead=m.top.find(t=>!t.you),two=ins.maps[1];
    arr.push({id:"ladder",kind:"ladder",score:.955,map:m,source:"Google Maps",
      big:r?`#${r}`:m.listed?`${m.checked}+`:"Not listed",
      label:r?`on Google Maps for “${q}”`:m.listed?`not in the first ${m.checked} on Google Maps for “${q}”`:`not on Google Maps, so you can't come up for “${q}”`,
      badge:r===1?"Number one on Maps":r&&r<=3?"In Google's top 3":null,
      chips:two?[`${two.rank?"#"+two.rank:"not in top "+two.checked} · ${two.query}`]:null,
      say:r===1?`You're the first business Google Maps shows for ${q}.`:(r?`You come up number ${r} on Google Maps for ${q}.`:m.listed?`You're not in the first ${m.checked} on Google Maps for ${q}.`:`You're not on Google Maps, so you can't come up for ${q}.`)+(lead&&r!==1?` ${lead.name} is first.`:"")});
  }
  if(dm&&dm.total>=10&&Array.isArray(dm.months)){
    const w=String(dm.word||ins.words?.[0]||"").toLowerCase(),city=dm.scope==="city",where=city?String(dm.area).replace(/,\s*[A-Z]{2}$/,""):dm.area;
    const pk=dm.peak&&MONTH[dm.peak.m-1],top=dm.top?.[0]?.q;
    const cpc=Number(dm.cpc)>=2?(dm.cpc>=10?String(Math.round(dm.cpc)):Number(dm.cpc).toFixed(2)):null;
    arr.push({id:"demand",kind:"demand",score:.935,dem:dm,source:"Google searches",
      big:num(dm.total),
      label:`searches a month for ${an(w)} ${w} ${city?"around":"across"} ${where}`,
      badge:cpc?`Ads cost $${cpc} a click`:null,
      say:`About ${num(dm.total)} searches a month for ${an(w)} ${w} ${city?"around":"across"} ${where}.`+(top?` Most people type “${top}”.`:"")+(pk?` ${pk} is the busiest month.`:"")});
  }
  if(sp&&Number.isFinite(sp.score)){
    const s=sp.score;
    arr.push({id:"speed",kind:"speed",score:s<50?.84:.7,sp,source:"Google PageSpeed",big:String(s),unit:"of 100",
      label:`speed on a phone, scored by Google${Number.isFinite(sp.lcp)?`. Your page takes ${sp.lcp}s to show`:""}`,
      say:s<50?`Your site is slow on phones: ${s} out of 100.`:s>=90?`Your site is fast on phones: ${s} out of 100.`:`Your site scores ${s} out of 100 for speed on phones.`});
  }
}

// Slots on the page: 1 hangs off the photo, 2 is the wide open one, 3 is the right-hand column.
// The tall cards get the slots with room below them.
function place(u){
  if(!u.some(c=>c.id==="ladder"||c.id==="demand"))return;
  const pref={demand:1,ladder:2,presence:u.some(c=>c.id==="ladder")?3:2};
  const n=u.length,out=new Array(n).fill(null),rest=[];
  for(const c of u){const i=pref[c.id];if(i!=null&&i<n&&!out[i])out[i]=c;else rest.push(c)}
  for(let i=0;i<n;i++)if(!out[i])out[i]=rest.shift();
  u.splice(0,n,...out);
}

const stars=r=>Number.isFinite(r)?`<span class="pm-st">${Number(r).toFixed(1)}</span>`:"<span></span>";
function ladder(n){
  const m=n.map,r=m.rank;let k=0;
  const row=(pos,name,rating,you)=>`<li class="pm-row${you?" is-you":""}" style="--k:${k++}"><span class="pm-pos">${pos}</span><span class="pm-name">${you?"<b>You</b>":esc(name)}</span>${stars(rating)}</li>`;
  const gap=t=>`<li class="pm-gap" style="--k:${k++}"><i></i><span>${t}</span><i></i></li>`;
  const rows=m.top.slice(0,3).map(t=>row(t.pos,t.name,t.rating,t.you));
  if(r&&r>3){if(r>4)rows.push(gap(`${r-4} more`));rows.push(row(r,"",m.you?.rating,!0))}
  else if(!r){rows.push(gap(m.listed?`${Math.max(0,m.checked-3)} more`:"and the rest"));rows.push(`<li class="pm-row is-miss" style="--k:${k++}"><span class="pm-pos">—</span><span class="pm-name"><b>You</b></span><span class="pm-tag">${m.listed?`past #${m.checked}`:"no listing"}</span></li>`)}
  const head=`<div class="pm-head${String(n.big).length>5?" pm-stack":""}"><p class="pt-big pt-num${String(n.big).length>5?" pm-sm":""}">${esc(n.big)}</p><p class="pm-for">${r||m.listed?"on Google Maps for":"on Google Maps. You're missing from"} <b>“${esc(m.query)}”</b></p></div>`;
  const also=n.chips?.length?`<p class="pt-chips"><span>also</span>${n.chips.map(c=>`<b>${esc(c)}</b>`).join("")}</p>`:"";
  return head+`<ol class="pm-ladder" aria-label="Google Maps results">${rows.join("")}</ol>`+also;
}
function demand(n){
  const d=n.dem,ms=d.months.filter(x=>Number.isFinite(x?.v)&&x.m>=1&&x.m<=12);
  const head=`<p class="pt-big pt-num">${esc(n.big)}</p><p class="pt-lab">${esc(n.label)}</p>`;
  if(ms.length<4)return head;
  const W=240,H=58,P=4,vs=ms.map(x=>x.v),max=Math.max(...vs),min=Math.min(...vs),lo=Math.max(0,min-(max-min||max*.2));
  const X=i=>P+i*(W-2*P)/(ms.length-1),Y=v=>H-P-((v-lo)/((max-lo)||1))*(H-2*P-8);
  const pts=ms.map((x,i)=>[X(i),Y(x.v)]),f=v=>v.toFixed(1);
  let dl=`M${f(pts[0][0])} ${f(pts[0][1])}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
    dl+=`C${f(p1[0]+(p2[0]-p0[0])/6)} ${f(p1[1]+(p2[1]-p0[1])/6)} ${f(p2[0]-(p3[0]-p1[0])/6)} ${f(p2[1]-(p3[1]-p1[1])/6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  const da=`${dl}L${f(pts.at(-1)[0])} ${H}L${f(pts[0][0])} ${H}Z`;
  const pk=vs.indexOf(max),[px,py]=pts[pk];
  const svg=`<svg class="pm-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="pmL" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#3fd6c4"/><stop offset=".55" stop-color="#9b86ff"/><stop offset="1" stop-color="#ff7d98"/></linearGradient><linearGradient id="pmA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9b86ff" stop-opacity=".24"/><stop offset="1" stop-color="#9b86ff" stop-opacity="0"/></linearGradient></defs><path class="pm-area" d="${da}" fill="url(#pmA)"/><line class="pm-pk" x1="${f(px)}" y1="${f(py)}" x2="${f(px)}" y2="${H}"/><path class="pm-line" d="${dl}" pathLength="1" stroke="url(#pmL)"/><circle class="pm-dot" cx="${f(px)}" cy="${f(py)}" r="3.6"/></svg>`;
  const nm=x=>`${MON[x.m-1]} ’${String(x.y).slice(-2)}`;
  const tag=`<span class="pm-tag-pk" style="left:${Math.min(84,Math.max(16,px/W*100)).toFixed(1)}%;top:${(py/H*100).toFixed(1)}%">${MON[ms[pk].m-1]} · busiest</span>`;
  const axis=`<p class="pm-axis"><span>${nm(ms[0])}</span><span>${nm(ms.at(-1))}</span></p>`;
  return head+`<div class="pm-chart">${svg}${tag}</div>`+axis;
}
function speed(n){
  const s=Math.max(0,Math.min(100,Number(n.sp.score)||0)),tone=s>=90?"g":s>=50?"m":"d";
  return `<div class="pm-gauge pm-${tone}"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="pm-g0" cx="24" cy="24" r="20"/><circle class="pm-g1" cx="24" cy="24" r="20" pathLength="100" style="--off:${100-s}"/></svg><p class="pt-big pt-num">${s}<small>${esc(n.unit)}</small></p></div><p class="pt-lab">${esc(n.label)}</p>`;
}
function html(n){
  try{return n.kind==="ladder"?ladder(n):n.kind==="demand"?demand(n):speed(n)}
  catch{return `<p class="pt-big pt-num">${esc(n.big)}</p><p class="pt-lab">${esc(n.label)}</p>`}
}

globalThis.__pipMarket={want,cards,place,html,mapsRow,get:d=>S.get(dom(d))||null,kinds:{ladder:1,demand:1,speed:1},
  on:f=>{if(typeof f!=="function")return()=>{};L.add(f);return()=>{L.delete(f)}}};
// Start as soon as the scan's Google read lands (the same moment Pip starts studying the business).
const B=globalThis.__pipBrain;
if(B&&typeof B.prepare==="function"&&!B.__pm){const p0=B.prepare;B.prepare=(a,b)=>{try{want(a)}catch{}return p0(a,b)};B.__pm=1}
})();
