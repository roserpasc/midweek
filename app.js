'use strict';
/* ============================================================
   Midweek — planificador de menú setmanal per a parelles
   Fitxer 1/2: estat, persistència, menú, receptes, llista compra
   ============================================================ */

/* ---------------- constants & helpers ---------------- */
const DAYS=['dl','dt','dc','dj','dv','ds','dg'];
const DAY_LONG={dl:'dilluns',dt:'dimarts',dc:'dimecres',dj:'dijous',dv:'divendres',ds:'dissabte',dg:'diumenge'};
const SLOTS=[{id:'dinars',l:'Dinar'},{id:'sopars',l:'Sopar'}];

function mondayOf(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x;}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function todayIso(){return iso(new Date());}
function fmtDate(d){return d.toLocaleDateString('ca-ES',{day:'numeric',month:'short'});}
function uid(){return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function eur(n){return (Number(n)||0).toLocaleString('ca-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function parseNum(s){if(typeof s==='number')return isFinite(s)?s:null;const n=parseFloat(String(s==null?'':s).replace(',','.'));return isNaN(n)?null:n;}
function debounce(fn,ms){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>fn.apply(this,a),ms);};}
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
function byId(arr,id){return arr.find(x=>x.id===id);}

function download(name,text,mime){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:mime||'application/json'}));
  a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}

/* toast */
function toast(msg,ms){
  const el=document.createElement('div');el.className='toast';el.textContent=msg;
  $('#toastSlot').appendChild(el);
  setTimeout(()=>el.remove(),ms||2600);
}

/* modal */
function openModal(html){
  $('#modalBox').innerHTML='<button class="modal-close" id="modalClose" aria-label="Tanca">✕</button>'+html;
  $('#modalClose').addEventListener('click',closeModal);
  $('#modalBg').classList.remove('hidden');
}
function closeModal(){$('#modalBg').classList.add('hidden');$('#modalBox').innerHTML='';}
$('#modalBg')?.addEventListener('click',e=>{if(e.target.id==='modalBg')closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

/* ---------------- estat + persistència ---------------- */
const LS_KEY='midweek_v1';
function defaultState(){
  return {
    version:1,
    people:[
      {id:uid(),name:'Roser',color:'#5E8772'},
      {id:uid(),name:'Paolo',color:'#C77D46'}
    ],
    diners:2,
    categories:['Fruita i verdura','Carn i peix','Làctics i ous','Pa i fornats','Despensa','Begudes','Congelats','Neteja','Altres'],
    recipes:[],
    menu:{},                 /* "YYYY-MM-DD|slot" -> [{recipeId,diners}] */
    shopping:{items:[],stale:false},
    receipts:[],             /* {id,date,store,payerId,total,items:[{name,qty,unit,price}],photo} */
    settlements:[],          /* {date,fromId,toId,amount} */
    settings:{apiKey:(window.MIDWEEK_OPENROUTER_KEY||''),model:'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'},
    ui:{tab:'menu',weekStart:null},
    seedDone:false
  };
}

/* ---------- estat inicial ---------- */
let S;
try {
  const raw = localStorage.getItem(LS_KEY);
  S = raw ? JSON.parse(raw) : defaultState();
} catch (e) {
  console.error(e);
  S = defaultState();
}

/* ---------- migracions defensives (estats vells del localStorage) ---------- */
try{
  if(!S.ui || typeof S.ui!=='object') S.ui={tab:'menu',weekStart:null};
  if(!S.shopping || !Array.isArray(S.shopping.items)) S.shopping={items:[],stale:false};
  if(!Array.isArray(S.people)) S.people=defaultState().people;
  if(!Array.isArray(S.categories)||!S.categories.length) S.categories=defaultState().categories;
  if(!Array.isArray(S.recipes)) S.recipes=[];
  if(typeof S.menu!=='object'||!S.menu) S.menu={};
  if(!Array.isArray(S.receipts)) S.receipts=[];
  if(!Array.isArray(S.settlements)) S.settlements=[];
  if(!S.settings||typeof S.settings!=='object') S.settings={};
}catch(e){console.error('migration error',e);}

/* ================= GITHUB GIST SYNC ================= */
/* Les credencials van incrustades aquí perquè config.js (amb .gitignore) no es
   publica a GitHub Pages: així la PWA desplegada també sincronitza. Si config.js
   existeix (dev local), s'utilitzen les seves credencials. */
/* Credencials Gist: es desen UN COP per dispositiu a localStorage (Opcions les pregunta).
   En dev local, config.js també funciona. Mai van incrustades al codi (GitHub ho bloqueja). */
function getGistCfg(){
  try{
    const ls=JSON.parse(localStorage.getItem('midweek_gist')||'null');
    if(ls&&ls.gistId&&ls.token)return ls;
  }catch(e){}
  if(typeof GIST_SYNC!=='undefined'&&GIST_SYNC&&GIST_SYNC.gistId&&GIST_SYNC.token)return GIST_SYNC;
  return null;
}
const GIST_CFG=getGistCfg();
const GIST_OK=!!(GIST_CFG&&GIST_CFG.gistId&&GIST_CFG.token&&typeof fetch==='function');

/* còpia lleugera per al gist (límit 1MB/fitxer):
   - les receptes de BIBLIOTECA (Corpus/Arguiñano/Gastroteca) NO viatgen:
     són idèntiques a tot arreu (cada dispositiu les importa de traditional-bank.js)
   - sense fotos ni passos; només dades pròpies de l'usuari */
function syncPayload(state){
  try{
    const p=JSON.parse(JSON.stringify(state));
    delete p.ui;
    delete p.seedDone;
    if(Array.isArray(p.recipes)) p.recipes=p.recipes.filter(r=>!r.book);
    (p.receipts||[]).forEach(r=>{if(r.photo)r.photo=null;});
    (p.recipes||[]).forEach(r=>{if(r.steps)delete r.steps;if(r.photo)r.photo=null;});
    /* mapa id->nom perquè l'altre dispositiu pugui resoldre recipeIds que no té
       (els IDs del banc de biblioteca són aleatoris per dispositiu) */
    p._recipeNames={};
    (state.recipes||[]).forEach(r=>{p._recipeNames[r.id]=r.name;});
    return p;
  }catch(e){return state;}
}

function pullFromGist() {
  if(!GIST_OK)return Promise.resolve(null);
  return fetch(`https://api.github.com/gists/${GIST_CFG.gistId}`, {
    headers: {
      Authorization: `Bearer ${GIST_CFG.token}`,
      Accept: 'application/vnd.github+json'
    }
  })
  .then(r => {
    if (!r.ok) throw new Error(`GitHub error ${r.status}`);
    return r.json();
  })
  .then(gist => {
    const content = gist.files['midweek-state.json']?.content;
    if (!content) return null;
    return JSON.parse(content);
  })
  .catch(err => {
    console.warn('Could not pull from Gist:', err);
    return null;
  });
}

function pushToGist(state) {
  if(!GIST_OK)return Promise.resolve(null);
  const data = JSON.stringify(syncPayload(state));
  return fetch(`https://api.github.com/gists/${GIST_CFG.gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${GIST_CFG.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: {
        'midweek-state.json': { content: data }
      }
    })
  })
  .then(r => {
    if (!r.ok) throw new Error(`GitHub error ${r.status}`);
    return r.json();
  })
  .catch(err => {
    console.warn('Could not push to Gist:', err);
    throw err;
  });
}

/* merge intel·ligent per claus: cap dispositiu esborra el que l'altre ha afegit */
function mergeStates(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const rNewer=(remote._syncedAt||0)>=(local._syncedAt||0);
  const out=JSON.parse(JSON.stringify(local));
  /* menú: unió de claus; mateixa clau modificada als dos -> guanya el més recent */
  const menu=Object.assign({},local.menu||{});
  Object.keys(remote.menu||{}).forEach(k=>{
    if(!menu[k])menu[k]=remote.menu[k];
    else if(JSON.stringify(menu[k])!==JSON.stringify(remote.menu[k])) menu[k]=rNewer?remote.menu[k]:menu[k];
  });
  out.menu=menu;
  /* receptes pròpies: unió per id (duplicat -> es queda la versió local).
     Les de biblioteca NO s'importen del gist (hi han pogut arribar en payloads vells). */
  const ids=new Set((local.recipes||[]).map(r=>r.id));
  const recipes=(local.recipes||[]).slice();
  (remote.recipes||[]).forEach(r=>{if(!ids.has(r.id)&&!r.book){recipes.push(r);ids.add(r.id);}});
  out.recipes=recipes;
  /* tiquets: unió per id */
  const rids=new Set((local.receipts||[]).map(r=>r.id));
  const receipts=(local.receipts||[]).slice();
  (remote.receipts||[]).forEach(r=>{if(!rids.has(r.id)){receipts.push(r);rids.add(r.id);}});
  receipts.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  out.receipts=receipts;
  /* liquidacions: unió */
  const skey=st=>[st.date,st.fromId,st.toId,st.amount].join('|');
  const skeys=new Set((local.settlements||[]).map(skey));
  const settlements=(local.settlements||[]).slice();
  (remote.settlements||[]).forEach(st=>{if(!skeys.has(skey(st))){settlements.push(st);skeys.add(skey(st));}});
  out.settlements=settlements;
  /* llista de la compra: unió per id; done si qualsevol dispositiu la marca */
  const iMap={};
  ((local.shopping&&local.shopping.items)||[]).forEach(i=>iMap[i.id]=i);
  ((remote.shopping&&remote.shopping.items)||[]).forEach(i=>{
    if(!iMap[i.id])iMap[i.id]=i;
    else if(i.done&&!iMap[i.id].done)iMap[i.id].done=true;
  });
  out.shopping={items:Object.values(iMap),stale:!!((local.shopping&&local.shopping.stale)||(remote.shopping&&remote.shopping.stale))};
  /* categories: unió */
  const cats=(local.categories||[]).slice();
  (remote.categories||[]).forEach(c=>{if(!cats.includes(c))cats.push(c);});
  out.categories=cats;
  /* camps simples: guanya l'estat més recent */
  out.diners=rNewer?(remote.diners||local.diners):local.diners;
  out.people=rNewer?(remote.people||local.people):local.people;
  out._syncedAt=Math.max(local._syncedAt||0,remote._syncedAt||0);
  /* mapa de noms: local + remot, per resoldre recipeIds aliens en render */
  const names=Object.assign({},remote._recipeNames||{},local._recipeNames||{});
  out._recipeNames=names;
  return out;
}

/* aplica l'estat remot fusionat; retorna true si hi ha hagut canvi real */
function applyRemote(remote){
  if(!remote)return false;
  const merged=mergeStates(S,remote);
  const sig=o=>JSON.stringify([o.menu,o.recipes&&o.recipes.length,o.receipts,o.settlements,o.shopping,o.categories,o.diners,(o.people||[]).map(p=>p.id+p.name)]);
  if(sig(merged)===sig(S))return false;
  Object.keys(merged).forEach(k=>{if(k!=='ui')S[k]=merged[k];});
  save(); /* desa localment + puja la fusió perquè l'altre dispositiu convergir */
  return true;
}

let syncIntervalId = null;
function startPeriodicSync(intervalMs = 30000) {
  stopPeriodicSync();
  syncIntervalId = setInterval(async () => {
    try {
      const remote = await pullFromGist();
      if (remote && applyRemote(remote)) {
        try{boot(false);}catch(e){}
      }
    } catch (e) {
      console.warn('Periodic sync error:', e);
    }
  }, intervalMs);
}
function stopPeriodicSync() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}
async function initialSync() {
  try {
    const remote = await pullFromGist();
    if (remote && applyRemote(remote)) {
      try{boot(false);}catch(e){}
    }
  } catch (e) {
    console.warn('Initial sync failed:', e);
  }
  startPeriodicSync();
}

/* ============ estat + persistència ============ */



S.shopping=S.shopping&&Array.isArray(S.shopping.items)?S.shopping:{items:[],stale:false};
S.settings=Object.assign({apiKey:(window.MIDWEEK_OPENROUTER_KEY||''),model:'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'},S.settings);

function save(){
  try{
    S._syncedAt=Date.now();
    localStorage.setItem(LS_KEY,JSON.stringify(S));
    flashSync(true);
    /* push al Gist només si hi ha credencials; mai bloqueja ni trenca el clic */
    if(GIST_OK)pushToGist(S).catch(e=>console.warn('Gist push failed:',e));
  }catch(e){console.error(e);try{flashSync(false);}catch(e2){}}
}
let flashT=null;
function flashSync(ok){
  const dot=$('#syncDot'),lab=$('#syncLabel');
  if(!dot)return;
  dot.classList.toggle('err',!ok);
  lab.textContent=ok?'Desat ✓':'Error!';
  clearTimeout(flashT);
  flashT=setTimeout(()=>{dot.classList.remove('err');lab.textContent='Local';},1400);
}

/* ============ ETIQUETES MÚLTIPLES DERIVADES DELS INGREDIENTS ============ */
const TAG_RULES=[
  {id:'🐟 Peix i marisc', re:/bacall[aà]|salm[oó]|tonyina|bon[ií]tol|llu[cç]|merlu[çz]|pescadill|rape|llenguado|llobarro|dorada|verat|jurel|sardin|seit[oó]|anxov|truita|gall de mar|galera|llam[aà]ntol|escamarlan|gamb|llagost[ií]n|muscle|clo[iï]ss|calamar|s[ií]pia|pop\b|popet|cigala|navall|berberec|marisc|peix|arengada/i},
  {id:'🍗 Aus i conill', re:/pollastre|conill|\baus\b|[àa]nec|guatlla|gall dindi|perdiu|gallina|pavo/i},
  {id:'🍖 Carn', re:/vedella|ternera|porc\b|llom\b|xai|corder|botifarr|pernil|fuet|salsitx|xori[cç]|morcilla|panceta|cansalada|bac[oó](?![a-zà-ÿ])|costell|xulleta|hamburgues|carn\b|capipota|cua de bou|cervell|fetge|ronyon|callos|llardons|sobrassada/i},
  {id:'🫘 Llegums', re:/cigron|llenti|fesol\b|fesols|monget(es|a) (blanqu|negre|roge|sequ)|jud[ií]a blanca|fava\b|faves\b|p[eè]sol(s)?\b/i},
  {id:'🥬 Verdures', re:/tom[aà]quet|ceb(a|es|olla)|all(s|\b)|pastanag|patat|pebrot|carbass[oó]?|alberg[ií]ni|espinac|bleda|enciam|escarol|end[ií]via|carxof|esp[aà]rrec|br[oò]quil|col\b|coliflor|porro|mongeta verda|jud[ií]a verde|champiny[oó]|xampiny[oó]|bolet|moixernon|cogombr|remolatx|api\b|cal[cç]ot|samfaina|escalivad|pisto|trinxat/i},
  {id:'🍝 Arròs i pasta', re:/arr[oò]s|espaguet|macarr[oó]|fideu|tallar[ií]n|canelon|lasany|cusc[uú]s|quinoa|pasta\b/i},
  {id:'🥔 Tubercles i cereals', re:/patat|moniato|trumfa|polenta|mill\b/i},
  {id:'🥚 Ous', re:/\bou(s)?\b|yema|clara de/i},
  {id:'🍰 Dolç', re:/sucre|xocolat|cacau|mel\b|canela|gelat[ií]|nata muntada|mascarpone|galeta|confitura|alm[ií]bar|van[ií]l|crema catalana/i},
  {id:'🌶️ Picant', re:/cayena|xili|chili|pebrot picant|harissa|tabasc|\bpicant/i},
];
const HEALTHY_FISH=/bacall[aà]|salm[oó]|tonyina|llu[cç]|merlu[çz]|rape|sardin|gamb|muscle|clo[iï]ss|peix|marisc/i;
const HEALTHY_FAT=/frit|arrebossat|panxeta|bacon|cansalada|foie|crema de llet|nata\b|xocolat|brandy|licor/i;
const FRIED=/bunyol|croquet|frit|arrebossat|past[ií]s|carbonara|fullada|brisé/i;

function computeTags(r){
  const ings=(r.ingredients||[]).map(i=>String(i.name||'').toLowerCase()).join(' · ');
  const hay=(r.name||'')+' '+ings;
  const tags=[];
  TAG_RULES.forEach(t=>{ if(t.re.test(hay)) tags.push(t.id); });
  if(!tags.includes('🍰 Dolç')&&/postres|dol[cç]/i.test(r.category||'')) tags.push('🍰 Dolç');
  const isDessert=tags.includes('🍰 Dolç');
  const isFried=FRIED.test(r.name||'');
  const isSauce=/salsa|alioli|alliol|beixamel|maionesa|romesco/i.test(r.name||'');
  const lean=HEALTHY_FISH.test(ings)||tags.includes('🫘 Llegums')||tags.includes('🥬 Verdures');
  const heavyFat=HEALTHY_FAT.test(ings)
    ||(r.ingredients||[]).some(i=>/oli|mantega|maionesa/i.test(i.name||'')&&typeof i.qty==='number'&&i.qty>=100);
  if(!isDessert&&!isFried&&!isSauce&&lean&&!heavyFat) tags.push('🥗 Saludable');
  const meaty=tags.some(t=>['🍖 Carn','🍗 Aus i conill','🐟 Peix i marisc'].includes(t));
  if(!meaty&&!isDessert&&!isSauce) tags.push('🌱 Vegetarià');
  if(r.time&&parseFloat(r.time)<=25) tags.push('⚡ Ràpid');
  return tags;
}
function ensureTags(r){
  if(!Array.isArray(r.tags)||!r.tags.length) r.tags=computeTags(r);
  return r.tags;
}

const recipeById=id=>byId(S.recipes,id);
const personById=id=>byId(S.people,id);
/* resol una recepta d'un àpat: primer per id; si no hi és (banc importat amb IDs
   aleatoris a cada dispositiu), busca-la pel nom recordat a _recipeNames */
function mealRecipe(m){
  if(!m)return null;
  let r=byId(S.recipes,m.recipeId);
  if(r)return r;
  const nm=(S._recipeNames||{})[m.recipeId];
  if(nm){
    r=S.recipes.find(x=>x.name===nm);
    if(r){
      /* re-liga la recepta local per evitar la cerca a cada render */
      m.recipeId=r.id;
      return r;
    }
    /* aquest dispositiu no té la recepta (banc no importat): mostra'n el nom,
       sense extracte ni fitxa; quan importi el banc es re-ligarà sola */
    return {name:nm,ingredients:[],steps:null,_ghost:true};
  }
  return null;
}

/* ---------------- pestanyes ---------------- */
function initTabs(){
  if(typeof S==='undefined' || !S.ui){
    // S no inicialitzat encara (receipts.js encara no ha cridat boot)
    setTimeout(initTabs, 50);
    return;
  }
  $$('nav.tabs button').forEach(b=>{
    b.style.touchAction = 'manipulation';
    b.addEventListener('click',()=>{
      /* cada pas protegit: cap excepció pot impedir el canvi de pestanya */
      try{S.ui.tab=b.dataset.tab;}catch(e){console.error(e);}
      try{save();}catch(e){console.error('save failed',e);}
      try{renderTabs();}catch(e){console.error('render failed',e);}
      try{window.scrollTo(0,0);}catch(e){}
    });
  });
}
// Assegura't que el DOM està llest (per si SW serveix HTML vell amb JS nou)
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initTabs);
}else{
  initTabs();
}
function switchTab(t){S.ui.tab=t;renderTabs();}
function renderTabs(){
  $$('nav.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===S.ui.tab));
  ['menu','recipes','shop','receipts','settings'].forEach(t=>{
    const el=document.getElementById('tab-'+t);
    if(el)el.classList.toggle('hidden',S.ui.tab!==t);
  });
  updateShopBadge();
}
function updateShopBadge(){
  const n=S.shopping.items.filter(i=>!i.done).length;
  $('#tabShopCount').textContent=n?(' '+n):'';
}

/* ============================================================
   MENÚ SETMANAL
   ============================================================ */
let weekStart=(S.ui.weekStart?new Date(S.ui.weekStart):mondayOf(new Date()));

function renderWeekBar(){
  const end=new Date(weekStart.getTime()+6*86400000);
  $('#weekLabel').textContent=fmtDate(weekStart)+' – '+fmtDate(end);
  $('#dinersVal').textContent=S.diners;
}

function renderMenu(){
  const tbl=$('#menuTable'),t=todayIso();
  let html='<tr><th style="width:74px"></th>'+DAYS.map((d,i)=>{
    const dt=new Date(weekStart.getTime()+i*86400000);
    const today=iso(dt)===t;
    return '<th class="'+(today?'today-col':'')+'">'+DAY_LONG[d]
      +'<br><span class="muted tiny" style="font-weight:400">'+fmtDate(dt)+'</span>'
      +(today?' 📍':'')+'</th>';
  }).join('')+'</tr>';
  for(const sl of SLOTS){
    html+='<tr><th style="text-align:left;font-size:14px">'+sl.l+'</th>';
    for(let i=0;i<7;i++){
      const key=iso(new Date(weekStart.getTime()+i*86400000))+'|'+sl.id;
      const meals=S.menu[key]||[];
      let chips='';
      meals.forEach((m,idx)=>{
        const r=mealRecipe(m);
        const name=r?r.name:(m.note||'(àpat lliure)');
        const emo=window.dishEmoji?dishEmoji(r):'🍽️';
        /* extracte: 2 primers ingredients; el nom és un enllaç a la fitxa */
        let excerpt='';
        if(r&&r.ingredients&&r.ingredients.length){
          excerpt=r.ingredients.slice(0,2).map(i=>i.name).join(' · ')
            +(r.ingredients.length>2?' · …':'');
        }
        chips+='<div class="meal-chip" draggable="true" data-key="'+key+'" data-idx="'+idx+'" data-id="open-meal">'
          +'<span class="t">'+emo+' '+((r&&!r._ghost)?'<a class="meal-link" data-recipe="'+r.id+'" title="Obre la fitxa de la recepta">'+esc(name)+'</a>':esc(name))+'</span>'
          +(excerpt?'<span class="x2 tiny muted">'+esc(excerpt)+'</span>':'')
          +'<span class="s">👥 '+m.diners+(r?'':' · 📝')+'</span>'
          +'<button class="x" data-del-key="'+key+'" data-del-idx="'+idx+'" title="Elimina">✕</button></div>';
      });
      html+='<td class="slot'+(meals.length?'':' empty')+'" data-drop-key="'+key+'">'+chips
        +'<button class="add-meal" data-add-key="'+key+'" title="Afegeix àpat">+</button></td>';
    }
    html+='</tr>';
  }
  tbl.innerHTML=html;
}

function pushMeal(key,meal){
  (S.menu[key]=S.menu[key]||[]).push(meal);
  save();renderMenu();markStale();
}
function removeMeal(key,idx){
  const arr=S.menu[key]||[];
  arr.splice(idx,1);
  if(!arr.length)delete S.menu[key];
  save();renderMenu();markStale();
}
function markStale(){
  if(S.shopping.items.length){
    S.shopping.stale=true;save();
    updateShopStatus();
  }
}
function updateShopStatus(){
  const el=$('#shopStatus');if(!el)return;
  if(S.shopping.stale&&S.shopping.items.length){
    el.textContent='⚠ El menú ha canviat — «Actualitza quantitats»';
    el.style.color='var(--danger)';
  }else if(S.shopping.items.length){
    el.textContent='✓ sincronitzada amb el menú';
    el.style.color='var(--accent)';
  }else{el.textContent='';}
}

/* etiqueta ràpida d'una recepta per als filtres del picker */
function quickTag(r){
  const t=recipeTraits(r);
  if(r.time&&r.time<=20)return '⚡ ràpid';
  if(t.legume)return '🫘 llegums';
  if(t.fish)return '🐟 peix';
  if(/pollastre|conill|ànec|gallina|gall |capó|perdiu/.test((r.name+' '+r.ingredients.map(i=>i.name).join(' ')).toLowerCase()))return '🍗 pollastre/conill';
  if(t.veggie&&!t.fish&&!t.redMeat&&r.ingredients.every(i=>!/carn|pollastre|peix|tonyina|llom|pernil|bacallà/i.test(i.name)))return '🥬 verdures';
  return null;
}

/* picker d'àpat */
function addMealFlow(key){
  openModal('<h2>Afegeix àpat</h2>'
    +'<div class="row" style="margin-bottom:10px">'
    +'<button class="btn btn-sm" id="pickerFree" style="border-style:dashed">📝 Àpat lliure</button>'
    +'<button class="btn btn-sm btn-primary" id="pickerRandom">🎲 Afegeix un àpat aleatori</button>'
    +'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px" id="tagFilters">'
    +'<button class="btn btn-sm tag-filter" data-tag="__all">Totes</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__healthy">🥗 saludable</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__fish">🐟 peix i marisc</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__meat">🍖 carn</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__poultry">🍗 aus i conill</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__legume">🫘 llegums</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__veg">🥬 verdures</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__rice">🍝 arròs i pasta</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__vegatarian">🌱 vegetarià</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__quick">⚡ ràpid</button>'
    +'<button class="btn btn-sm tag-filter" data-tag="__sweet">🍰 dolç</button>'
    +'</div>'
    +(S.recipes.length?'<input id="pickerSearch" placeholder="Cerca recepta…"><div id="pickerList" style="max-height:44vh;overflow-y:auto;margin-top:10px"></div>'
      :'<p class="muted">Encara no hi ha receptes. Pots afegir un àpat lliure o crear-ne una a la pestanya Receptes.</p>'));
  $('#pickerFree').onclick=()=>openFreeMeal(key,null);
  $('#pickerRandom').onclick=()=>{
    if(!S.recipes.length){toast('Encara no hi ha receptes.');return;}
    /* aleatori amb sentit: evita repetir la recepta ja posada al mateix dia (altre àpat) */
    const day=key.split('|')[0], slot=key.split('|')[1];
    const other=(S.menu[day+'|'+(slot==='dinars'?'sopars':'dinars')]||[])[0];
    let pool=S.recipes.filter(r=>!other||r.id!==other.recipeId);
    if(!pool.length)pool=S.recipes;
    const r=pool[Math.floor(Math.random()*pool.length)];
    pushMeal(key,{recipeId:r.id,diners:S.diners});
    closeModal();
    toast('🎲 '+r.name);
  };
  let activeTag='__all';
  $$('#tagFilters .tag-filter').forEach(b=>b.onclick=()=>{
    activeTag=b.dataset.tag;
    $$('#tagFilters .tag-filter').forEach(x=>x.style.background=(x===b)?'var(--verd-clar)':'');
    draw($('#pickerSearch')?$('#pickerSearch').value:'');
  });
  const first=$('#tagFilters .tag-filter');if(first)first.style.background='var(--verd-clar)';
  if(!S.recipes.length)return;
  const list=$('#pickerList');
  
/* ============ ETIQUETES MÚLTIPLES DERIVADES DELS INGREDIENTS ============ */
const TAG_RULES=[
  {id:'🐟 Peix i marisc', re:/bacall[aà]|salm[oó]|tonyina|bon[ií]tol|llu[cç]|merlu[çz]|pescadill|rape|llenguado|llobarro|dorada|verat|jurel|sardin|seit[oó]|anxov|truita|gall de mar|galera|llam[aà]ntol|escamarlan|gamb|llagost[ií]n|muscle|clo[iï]ss|calamar|s[ií]pia|pop\b|popet|cigala|navall|berberec|mariisc|peix|marisc|arengada|sardina/i},
  {id:'🍗 Aus i conill', re:/pollastre|conill|\baus\b|[àa]nec|guatlla|gall dindi|perdiu|gallina|pavo|pit de pollastre|muslos de pollastre/i},
  {id:'🍖 Carn', re:/vedella|ternera|porc\b|llom\b|xai|corder|cordero|botifarr|pernil|fuet|salchich|salsitx|chorizo|xori[cç]|morcilla|panceta|cansalada|bac[oó]|costell|costill|xulleta|chulet|hamburgues|carn\b|carn picada|cap i pota|capipota|rabo|cua de bou|cervell|fetge|ronyon|callos|llardons|sobrassada/i},
  {id:'🫘 Llegums', re:/cigron|llenti|fesol\b|fesols|monget(es|a) (blanqu|negre|roge|sequ)|jud[ií]a blanca|fava\b|faves\b|p[eè]sol(s)?\b/i},
  {id:'🥬 Verdures', re:/tom[aà]quet|ceb(a|es|olla)|all(s|\b)|pastanag|patat|pebrot|carbass[oó]|carbass|alberg[ií]ni|espinac|bleda|enciam|escarol|end[ií]via|carxof|esp[aà]rrec|br[oò]quil|col\b|coliflor|col llombard|porro|p[eè]sol|mongeta verda|jud[ií]a verde|champiny[oó]|xampiny[oó]|bolet|moixernon|cogombr|remolatx|rave\b|api\b|cal[cç]ot|sugar|carbass|ciurb|ble\b|ortig|samfaina|escalivad|pisto|trinxat/i},
  {id:'🍝 Arròs i pasta', re:/arr[oò]z?|arr[oò]s|espaguet|macarr[oó]|fideu|tallar[ií]n|canelon|lasany|lasa[nñ]|cusc[uú]s|quinoa|noodles|penne|pasta\b/i},
  {id:'🥔 Tubercles i cereals', re:/patat|moniato|boniato|trumfa|polenta|mill\b/i},
  {id:'🥚 Ous', re:/\bou(s)?\b|huevo|yema|clara de/i},
  {id:'🍰 Dolç', re:/sucre|xocolat|cacau|mel\b|canela|gelat[ií]|nata muntada|mascarpone|galeta|melmelada|melmelad|confitura|alm[ií]bar|van[ií]l·l|vanill|llimonada|crema catalana|mat[oó] de monja/i},
  {id:'🌶️ Picant', re:/cayena|xili|chili|pebrot picant|pebre de cayena|harissa|tabasc|\bpicant/i},
];
const HEALTHY_FISH=/bacall[aà]|salm[oó]|tonyina|llu[cç]|merlu[çz]|rape|sardin|gamb|muscle|clo[iï]ss|peix|marisc/i;
const HEALTHY_FAT=/frit|arrebossat|panxeta|bacon|cansalada|foie|crema de llet|nata|xocolat|manteiga|mantega|brandy|licor|alcohol/i;
const FRIED=/bunyol|croquet|frit|arrebossat|pastís|ensalada russa|carbonara|brisé|fullada/i;

function computeTags(r){
  const ings=(r.ingredients||[]).map(i=>String(i.name||'').toLowerCase()).join(' · ');
  const hay=r.name+' '+ings;
  const tags=[];
  TAG_RULES.forEach(t=>{ if(t.re.test(hay)) tags.push(t.id); });
  /* Dolç: també si la categoria ho diu */
  if(!tags.includes('🍰 Dolç')&&/postres|dol[cç]|postre/i.test(r.category||'')) tags.push('🍰 Dolç');
  /* Saludable: proteïna magra o verdura dominant + sense fregits/greixos/postres */
  const isDessert=tags.includes('🍰 Dolç')||/postres|dol[cç]/i.test(r.category||'');
  const isFried=FRIED.test(r.name);
  const lean=HEALTHY_FISH.test(ings)||tags.includes('🫘 Llegums')||tags.includes('🥬 Verdures');
  const heavyFat=HEALTHY_FAT.test(ings)
    ||(r.ingredients||[]).some(i=>/oli|mantega|maionesa/i.test(i.name||'')&&typeof i.qty==='number'&&i.qty>=100);
  const isSauce=/salsa|alioli|alliol|beixamel|bechamel|maionesa|romesco/i.test(r.name);
  if(!isDessert&&!isFried&&!isSauce&&lean&&!heavyFat) tags.push('🥗 Saludable');
  /* Vegetarià: cap carn, cap peix, cap aus */
  const meaty=tags.some(t=>['🍖 Carn','🍗 Aus i conill','🐟 Peix i marisc'].includes(t));
  if(!meaty&&!isDessert&&!isSauce) tags.push('🌱 Vegetarià');
  /* Ràpid: temps <=25 min */
  if(r.time&&parseFloat(r.time)<=25) tags.push('⚡ Ràpid');
  return tags;
}
function ensureTags(r){
  if(!Array.isArray(r.tags)||!r.tags.length) r.tags=computeTags(r);
  return r.tags;
}

const TAGS={__fish:'🐟 Peix i marisc',__meat:'🍖 Carn',__poultry:'🍗 Aus i conill',__legume:'🫘 Llegums',__veg:'🥬 Verdures',__rice:'🍝 Arròs i pasta',__healthy:'🥗 Saludable',__vegatarian:'🌱 Vegetarià',__quick:'⚡ Ràpid',__sweet:'🍰 Dolç',__spicy:'🌶️ Picant'};
  function matchTag(r){
    if(activeTag==='__all')return true;
    const tags=ensureTags(r);
    if(activeTag==='__corpus')return r.book==='CORPUS';
    const map={__fish:'🐟 Peix i marisc',__meat:'🍖 Carn',__poultry:'🍗 Aus i conill',__legume:'🫘 Llegums',
      __veg:'🥬 Verdures',__rice:'🍝 Arròs i pasta',__healthy:'🥗 Saludable',__vegatarian:'🌱 Vegetarià',
      __quick:'⚡ Ràpid',__sweet:'🍰 Dolç',__spicy:'🌶️ Picant'};
    const want=map[activeTag];
    return want?tags.includes(want):true;
  }
  function draw(f){
    f=(f||'').toLowerCase();
    const rs=S.recipes.filter(r=>{
      const okText=!f||r.name.toLowerCase().indexOf(f)>=0
        ||r.ingredients.some(i=>i.name.toLowerCase().indexOf(f)>=0);
      return okText&&matchTag(r);
    });
    list.innerHTML=rs.slice(0,60).map(r=>{
      const tag=quickTag(r);
      return '<div class="shop-item"><div style="flex:1"><b>'+esc(r.name)+'</b>'
      +'<div class="muted tiny">'+(tag?tag+' · ':'')+r.servings+' racions'+(r.time?' · '+r.time+' min':'')
      +(r.category?' · '+esc(r.category):'')+'</div></div>'
      +'<div style="display:flex;gap:6px;align-items:center"><span class="muted tiny">👥</span>'
      +'<input type="number" min="1" max="12" value="'+S.diners+'" style="width:58px;padding:4px" data-diners-input>'
      +'<button class="btn btn-primary btn-sm" data-pick="'+r.id+'">Afegeix</button></div></div>';
    }).join('')+(rs.length>60?'<p class="empty-hint">…i '+(rs.length-60)+' més. Afiltra o cerca.</p>':null)||'<p class="empty-hint">Cap resultat.</p>';
  }
  draw();
  $('#pickerSearch').oninput=debounce(e=>draw(e.target.value),120);
  list.addEventListener('click',e=>{
    const b=e.target.closest('[data-pick]');if(!b)return;
    const diners=Math.max(1,parseInt(b.closest('.shop-item').querySelector('[data-diners-input]').value,10)||S.diners);
    pushMeal(key,{recipeId:b.dataset.pick,diners:diners});
    closeModal();
  });
}

/* àpat lliure (sense recepta): crear o editar */
function openFreeMeal(key,idx){
  const editing=idx!=null?(S.menu[key]||[])[idx]:null;
  openModal('<h2>'+(editing?'Edita àpat lliure':'Àpat lliure')+'</h2>'
    +'<label>Què es menjarà? (ex. Sopar fora, Restes d\'arròs, Amanida gran…)</label>'
    +'<input id="freeNote" maxlength="60" value="'+esc(editing?editing.note||'':'')+'" placeholder="Sopar fora…">'
    +'<div class="row" style="margin-top:8px"><div style="width:120px"><label>Comensals</label>'
    +'<input type="number" min="1" max="12" id="freeDiners" value="'+(editing?editing.diners:S.diners)+'"></div></div>'
    +'<div class="modal-foot"><span class="muted tiny">No genera ingredients a la llista de compra</span>'
    +'<div style="display:flex;gap:8px">'
    +(editing?'<button class="btn btn-danger btn-sm" id="freeDel">Elimina</button>':'')
    +'<button class="btn btn-primary" id="freeOk">D\'acord</button></div></div>');
  $('#freeNote').focus();
  $('#freeOk').onclick=()=>{
    const note=$('#freeNote').value.trim();
    if(!note){alert('Escriu què es menjarà (ex. «Sopar fora»).');return;}
    const diners=Math.max(1,parseInt($('#freeDiners').value,10)||S.diners);
    if(editing){editing.note=note;editing.diners=diners;save();renderMenu();}
    else pushMeal(key,{recipeId:null,note:note,diners:diners});
    closeModal();
  };
  $('#freeNote').addEventListener('keydown',e=>{if(e.key==='Enter')$('#freeOk').click();});
  const del=$('#freeDel');
  if(del)del.onclick=()=>{removeMeal(key,idx);closeModal();};
}

/* editar àpat existent (recepta o lliure) */
function openMealEditor(key,idx){
  const m=(S.menu[key]||[])[idx];if(!m)return;
  if(!m.recipeId&&!m.note){openFreeMeal(key,idx);return;}
  const r=mealRecipe(m);
  openModal('<h2>'+(r?esc(r.name):'Àpat')+'</h2>'
    +'<label>Comensals d\'aquest àpat</label>'
    +'<input type="number" min="1" max="12" id="mealDiners" value="'+m.diners+'" style="max-width:110px">'
    +'<details class="steps"><summary>Ingredients ('+(r?r.ingredients.length:0)+')</summary>'
    +(r?'<ul>'+r.ingredients.map(i=>'<li>'+esc(i.qty||'')+' '+esc(i.unit||'')+' '+esc(i.name)+'</li>').join('')+'</ul>':'')
    +(r&&r.steps?'<ol>'+r.steps.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol>':'')
    +'</details>'
    +'<div class="modal-foot"><button class="btn btn-danger btn-sm" id="mealDel">Elimina àpat</button>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +(r&&!r._ghost?'<button class="btn" id="mealView">📖 Veure recepta</button>':'')
    +'<button class="btn btn-primary" id="mealOk">D\'acord</button></div></div>');
  $('#mealOk').onclick=()=>{m.diners=Math.max(1,parseInt($('#mealDiners').value,10)||2);save();renderMenu();markStale();closeModal();};
  $('#mealDel').onclick=()=>{removeMeal(key,idx);closeModal();};
  const mv=$('#mealView');
  if(mv)mv.onclick=()=>{closeModal();viewRecipe(r.id);};
}

/* events taula menú (delegació) */
$('#menuTable').addEventListener('click',e=>{
  const del=e.target.closest('[data-del-key]');
  if(del){removeMeal(del.dataset.delKey,+del.dataset.delIdx);return;}
  const add=e.target.closest('[data-add-key]');
  if(add){addMealFlow(add.dataset.addKey);return;}
  const mealLink=e.target.closest('.meal-link');
  if(mealLink){viewRecipe(mealLink.dataset.recipe);return;}
  const chip=e.target.closest('.meal-chip');
  if(chip&&!e.target.closest('.x'))openMealEditor(chip.dataset.key,+chip.dataset.idx);
});

/* drag & drop global */
let dragData=null;
document.addEventListener('dragstart',e=>{
  const chip=e.target.closest?e.target.closest('.meal-chip'):null;
  const rc=e.target.closest?e.target.closest('.recipe-card'):null;
  if(chip)dragData={type:'move',key:chip.dataset.key,idx:+chip.dataset.idx};
  else if(rc){dragData={type:'new',recipeId:rc.dataset.id};rc.classList.add('dragging');}
});
document.addEventListener('dragend',()=>{$$('.recipe-card.dragging').forEach(x=>x.classList.remove('dragging'));});
document.addEventListener('dragover',e=>{
  const slot=e.target.closest?e.target.closest('.slot'):null;
  if(slot&&dragData){e.preventDefault();slot.classList.add('dragover');}
});
document.addEventListener('dragleave',e=>{
  const s=e.target.closest?e.target.closest('.slot'):null;
  if(s)s.classList.remove('dragover');
});
document.addEventListener('drop',e=>{
  const slot=e.target.closest?e.target.closest('.slot'):null;
  if(!slot||!dragData)return;
  e.preventDefault();slot.classList.remove('dragover');
  const key=slot.dataset.dropKey;
  if(dragData.type==='new'){
    pushMeal(key,{recipeId:dragData.recipeId,diners:S.diners});
  }else if(dragData.type==='move'&&dragData.key!==key){
    const arr=S.menu[dragData.key]||[];
    const m=arr.splice(dragData.idx,1)[0];
    if(arr&&!arr.length)delete S.menu[dragData.key];
    (S.menu[key]=S.menu[key]||[]).push(m);
    save();renderMenu();markStale();
  }
  dragData=null;
});

/* navegació setmanal */
$('#prevWeek').onclick=()=>{weekStart=new Date(weekStart.getTime()-7*86400000);S.ui.weekStart=iso(weekStart);save();renderWeekBar();renderMenu();};
$('#nextWeek').onclick=()=>{weekStart=new Date(weekStart.getTime()+7*86400000);S.ui.weekStart=iso(weekStart);save();renderWeekBar();renderMenu();};
$('#todayWeek').onclick=()=>{weekStart=mondayOf(new Date());S.ui.weekStart=iso(weekStart);save();renderWeekBar();renderMenu();};
$('#dinersBtn').onclick=()=>{
  openModal('<h2>Comensals per defecte</h2><p class="muted">S\'aplica quan afegeixes receptes al menú.</p>'
    +'<input type="number" min="1" max="12" id="dinersInput" value="'+S.diners+'" style="max-width:120px">'
    +'<div class="modal-foot"><span></span><button class="btn btn-primary" id="dinersOk">D\'acord</button></div>');
  $('#dinersOk').onclick=()=>{S.diners=Math.max(1,parseInt($('#dinersInput').value,10)||2);save();renderWeekBar();closeModal();};
};

/* buidar el menu de la setmana visible */
$('#clearMenuBtn').onclick=()=>{
  const mon=mondayOf(weekStart);
  const days=[...Array(7)].map((_,i)=>iso(new Date(mon.getTime()+i*86400000)));
  const n=days.reduce((a,d)=>a+['dinars','sopars'].reduce((b,sl)=>b+((S.menu[d+'|'+sl]||[]).length),0),0);
  if(!n){toast('Aquesta setmana ja està buida.');return;}
  if(!confirm('Esborrar els '+n+' àpats de la setmana del '+fmtDate(mon)+'?'))return;
  days.forEach(d=>{delete S.menu[d+'|dinars'];delete S.menu[d+'|sopars'];});
  save();renderMenu();markStale();
  toast('Setmana esborrada ('+n+' àpats)');
};

/* imprimir menú */
$('#printMenuBtn').onclick=()=>{
  let rows='';
  for(const sl of SLOTS){
    let cells='';
    for(let i=0;i<7;i++){
      const key=iso(new Date(weekStart.getTime()+i*86400000))+'|'+sl.id;
      const txt=(S.menu[key]||[]).map(m=>{const r=mealRecipe(m);return r?(r.name+' (×'+m.diners+')'):('📝 '+esc(m.note||'Àpat')+' (×'+m.diners+')');}).join('<br>')||'—';
      cells+='<td style="border:1px solid #999;padding:4px 6px;font-size:12px">'+txt+'</td>';
    }
    rows+='<tr><td style="border:1px solid #999;padding:4px 6px;font-weight:bold">'+sl.l+'</td>'+cells+'</tr>';
  }
  $('#printArea').innerHTML='<h2>Midweek — Menú '+fmtDate(weekStart)+' – '+fmtDate(new Date(weekStart.getTime()+6*86400000))+'</h2>'
    +'<table style="border-collapse:collapse;min-width:90%"><tr><th></th>'+DAYS.map(d=>'<th style="padding:4px 6px">'+DAY_LONG[d]+'</th>').join('')+'</tr>'+rows+'</table>';
  window.print();
};

/* ============================================================
   RECEPTES
   ============================================================ */
function renderRecipeFilters(){
  const sel=$('#recipeCatFilter');
  const cur=sel.value;
  sel.innerHTML='<option value="">Totes les categories</option>'
    +S.categories.map(c=>'<option'+(c===cur?' selected':'')+' value="'+esc(c)+'">'+esc(c)+'</option>').join('');
  /* chips de filtre per llibre/col·lecció */
  const wrap=$('#bookFilters');
  if(!wrap)return;
  const books=Object.keys(BOOK_LABEL).filter(b=>S.recipes.some(r=>r.book===b));
  const curB=window.__bookFilter||'';
  wrap.innerHTML=books.map(b=>'<button class="pill book-filter'+(curB===b?' active':'')+'" data-book="'+esc(b)+'">'+BOOK_LABEL[b]+'</button>').join('')
    +(curB?'<button class="pill book-filter" data-book="">✕ Treu el filtre</button>':'');
}
document.addEventListener('click',e=>{
  const bf=e.target.closest('.book-filter');
  if(bf){window.__bookFilter=bf.dataset.book||'';renderRecipes();}
});
function renderRecipes(){
  renderRecipeFilters();
  const q=($('#recipeSearch').value||'').toLowerCase();
  const catF=$('#recipeCatFilter').value;
  const list=S.recipes.filter(r=>{
    if(catF&&r.category!==catF)return false;
    if(!q)return true;
    return r.name.toLowerCase().indexOf(q)>=0||r.ingredients.some(i=>i.name.toLowerCase().indexOf(q)>=0);
  });
  $('#recipesEmpty').classList.toggle('hidden',S.recipes.length>0);
  $('#recipesGrid').innerHTML=list.map(r=>
    '<div class="recipe-card" draggable="true" data-id="'+r.id+'">'
    +(r.image?'<img class="card-thumb" src="'+esc(r.image)+'" alt="" loading="lazy">':'')
    +'<h3>'+esc(r.name)+'</h3>'
    +'<div class="meta"><span class="tag cat">'+esc(r.category||'Altres')+'</span><span class="tag">👥 '+r.servings+'</span>'
    +(r.time?'<span class="tag">⏱ '+esc(r.time)+' min</span>':'')
    +(r.book==='CORPUS'?'<span class="tag book-chip">🏛️ CORPUS</span>':r.book==='ARGUIÑANO'?'<span class="tag book-chip">📖 ARGUIÑANO</span>':r.book==='GASTROTECA'?'<span class="tag book-chip">🌿 GASTROTECA</span>':'')
    +'</div>'
    +'<div class="card-tags">'+(ensureTags(r)||[]).slice(0,3).map(t=>'<span class="tag tag-auto">'+esc(t)+'</span>').join('')+'</div>'
    +'<div class="ings">'+r.ingredients.slice(0,4).map(i=>esc([i.qty,i.unit,i.name].filter(Boolean).join(' '))).join(' · ')
    +(r.ingredients.length>4?' …':'')+'</div>'
    +'<div class="recipe-actions">'
    +'<button class="btn btn-sm" data-view="'+r.id+'">Veure</button>'
    +'<button class="btn btn-sm" data-edit="'+r.id+'">Edita</button>'
    +'<button class="btn btn-sm btn-danger" data-del="'+r.id+'">✕</button>'
    +'</div></div>'
  ).join('');
}

$('#recipesGrid').addEventListener('click',e=>{
  const v=e.target.closest('[data-view]');
  if(v){viewRecipe(v.dataset.view);return;}
  const ed=e.target.closest('[data-edit]');
  if(ed){openRecipeModal(ed.dataset.edit);return;}
  const dl=e.target.closest('[data-del]');
  if(dl){
    const r=recipeById(dl.dataset.del);
    if(r&&confirm('Eliminar la recepta «'+r.name+'»? També desapareixerà del menú.')){
      S.recipes=S.recipes.filter(x=>x.id!==r.id);
      Object.keys(S.menu).forEach(k=>{S.menu[k]=(S.menu[k]||[]).filter(m=>m.recipeId!==r.id);if(!S.menu[k].length)delete S.menu[k];});
      save();renderRecipes();renderMenu();markStale();
    }
  }
});
$('#recipeSearch').oninput=debounce(renderRecipes,150);
$('#recipeCatFilter').onchange=renderRecipes;

const BOOK_LABEL={CORPUS:'🏛️ CORPUS',ARGUIÑANO:'📖 ARGUIÑANO',GASTROTECA:'🌿 GASTROTECA'};
function viewRecipe(id){
  const r=recipeById(id);if(!r)return;
  const bookChip=r.book&&BOOK_LABEL[r.book]?'<span class="tag book-chip">'+BOOK_LABEL[r.book]+'</span>':(r.source?'<span class="tag">'+esc(String(r.source).split('·')[0].trim())+'</span>':'');
  openModal('<h2>'+esc(r.name)+'</h2>'
    +(r.image?'<img class="recipe-photo" src="'+esc(r.image)+'" alt="'+esc(r.name)+'" loading="lazy">':'')
    +'<div class="meta" style="margin:10px 0;flex-wrap:wrap">'
    +(ensureTags(r)||[]).map(t=>'<span class="tag tag-auto">'+esc(t)+'</span>').join('')
    +'<span class="tag">👥 '+r.servings+' racions</span>'+(r.time?'<span class="tag">⏱ '+esc(r.time)+' min</span>':'')+bookChip+'</div>'
    +'<h3>Ingredients</h3><ul>'+r.ingredients.map(i=>'<li>'+esc([i.qty,i.unit,i.name].filter(Boolean).join(' '))+'</li>').join('')+'</ul>'
    +(r.steps&&r.steps.length?'<h3>Preparació</h3><ol>'+r.steps.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol>':'')
    +(r.advice?'<div class="ai-banner"><span>💡</span><div>'+esc(r.advice)+'</div></div>':'')
    +(r.youtube?'<a class="btn btn-youtube" href="'+esc(r.youtube)+'" target="_blank" rel="noopener">▶ Veure el vídeo a YouTube</a>':'')
    +(r.url?'<a class="muted tiny" style="display:block;margin-top:6px" href="'+esc(r.url)+'" target="_blank" rel="noopener">Font original ↗</a>':'')
    +'<div class="modal-foot"><button class="btn btn-sm" id="dupR">Duplica</button><button class="btn btn-primary" id="okR">Tanca</button></div>');
  $('#okR').onclick=closeModal;
  $('#dupR').onclick=()=>{
    const c=JSON.parse(JSON.stringify(r));c.id=uid();c.name=r.name+' (còpia)';
    S.recipes.push(c);save();renderRecipes();closeModal();toast('Recepta duplicada');
  };
}

function openRecipeModal(id,onSaved){
  const r=id?recipeById(id):null;
  const cats=S.categories;
  openModal('<h2>'+(r?'Edita recepta':'Recepta nova')+'</h2>'
    +'<div class="row"><div class="grow"><label>Nom</label><input id="rName" value="'+esc(r?r.name:'')+'"></div>'
    +'<div style="width:110px"><label>Racions</label><input type="number" min="1" max="12" id="rServ" value="'+(r?r.servings:S.diners)+'"></div>'
    +'<div style="width:100px"><label>Minuts</label><input type="number" min="0" id="rTime" value="'+(r&&r.time?r.time:'')+'"></div></div>'
    +'<div class="row" style="margin-top:8px"><div style="min-width:180px"><label>Categoria</label>'
    +'<select id="rCat">'+cats.map(c=>'<option'+(r&&r.category===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'
    +'<div style="min-width:190px"><label>Llibre / col·lecció</label>'
    +'<select id="rBook"><option value="">— Cap —</option>'
    +Object.keys(BOOK_LABEL).map(b=>'<option value="'+b+'"'+(r&&r.book===b?' selected':'')+'>'+BOOK_LABEL[b]+'</option>').join('')
    +'</select></div></div>'
    +'<h3 style="margin-top:14px">Ingredients</h3>'
    +'<div id="ingRows"></div>'
    +'<button class="btn btn-sm" id="addIng">+ ingredient</button>'
    +'<details class="steps"><summary>Passos de preparació (opcional)</summary>'
    +'<textarea id="rSteps" rows="5" style="width:100%;margin-top:8px" placeholder="Un pas per línia…">'+esc(r?(r.steps||[]).join('\n'):'')+'</textarea></details>'
    +'<div class="modal-foot"><span class="muted tiny">Arrossegable al menú un cop desada</span>'
    +'<div style="display:flex;gap:8px"><button class="btn" id="rCancel">Cancel·la</button>'
    +'<button class="btn btn-primary" id="rSave">Desa</button></div></div>');

  const rows=$('#ingRows');
  function addIngRow(ing){
    const div=document.createElement('div');
    div.className='frow ing-row';
    div.innerHTML='<input placeholder="Ingredient" value="'+esc(ing?ing.name:'')+'" data-f="name">'
      +'<input placeholder="Qty" value="'+esc(ing&&ing.qty!=null?ing.qty:'')+'" data-f="qty" inputmode="decimal">'
      +'<select data-f="unit">'+['','g','kg','ml','l','unitats','cdsp','cspt','llauna','paquet'].map(u=>'<option'+(ing&&ing.unit===u?' selected':'')+'>'+u+'</option>').join('')+'</select>'
      +'<button class="del-ing" title="Elimina" style="color:var(--danger);background:none;border:none;font-size:15px">✕</button>';
    div.querySelector('.del-ing').onclick=()=>div.remove();
    rows.appendChild(div);
  }
  if(!r||!r.ingredients.length)addIngRow(null);else r.ingredients.forEach(addIngRow);
  $('#addIng').onclick=()=>addIngRow(null);

  $('#rCancel').onclick=closeModal;
  $('#rSave').onclick=()=>{
    const name=$('#rName').value.trim();
    if(!name){alert('Posa-li un nom a la recepta.');return;}
    const ingredients=$$('#ingRows .ing-row').map(row=>({
      name:row.querySelector('[data-f=name]').value.trim(),
      qty:parseNum(row.querySelector('[data-f=qty]').value),
      unit:row.querySelector('[data-f=unit]').value
    })).filter(i=>i.name);
    if(!ingredients.length){alert('Afegeix com a mínim un ingredient.');return;}
    const steps=$('#rSteps').value.split('\n').map(x=>x.trim()).filter(Boolean);
    const bookSel=$('#rBook');
    const data={
      name:name,
      servings:Math.max(1,parseInt($('#rServ').value,10)||2),
      time:parseInt($('#rTime').value,10)||null,
      category:$('#rCat').value,
      book:$('#rBook').value||null,
      ingredients:ingredients,
      steps:steps
    };
    if(r)Object.assign(r,data);
    else S.recipes.push(Object.assign({id:uid()},data));
    save();renderRecipes();closeModal();
    toast(r?'Recepta actualitzada ✓':'Recepta creada ✓');
    if(onSaved)onSaved();
  };
}
$('#newRecipeBtn').onclick=()=>openRecipeModal(null);

/* ============================================================
   LLISTA DE LA COMPRA
   ============================================================ */
/* acumula ingredients de totes les receptes del menú sencer */

/* ================= MOTOR DE LLISTA v2 =================
   1) Agrupació per ALIMENT BASE: "tomàquet triturat", "tomàquets cherry" i "2 tomàquets"
      es fusionen en una sola entrada "Tomàquets" amb les variants com a nota.
   2) Despensa (ingredients que sempre hi ha a casa): no generen ítem; surten
      en UNA sola línia al final de la llista. */

const PANTRY_DEFAULT=["sal","sucre","oli","pebre","orenga","alfàbrega","llorer","farina","pebre vermell","clau","vinagre"];
function pantryList(){
  if(!S.settings.pantry||!Array.isArray(S.settings.pantry)||!S.settings.pantry.length)
    S.settings.pantry=PANTRY_DEFAULT.slice();
  return S.settings.pantry;
}
/* arrel d'aliment: treu plurals, articles, qualifiers i mapatja sinònims a base canònica */
const FOOD_BASE=[
  /* [regex sobre el nom sencer en minúscula, nom base canònic] — ordre MATTER: primer els específics */
  [/tom[aà]quet[s]?\s+(triturat|frit|ratllat|concentrat|sec|cherry|pera|de penjar)/,'tomàquet'],
  [/tom[aà]quet|tomassada/,'tomàquet'],
  [/ceba\s*(de figuera|tendra|dolça|morada|roja)?/,'ceba'],
  [/all(s|i)?\s*(fresc|tendr|sec|en pols)?/,'all'],
  [/patat(a|es)|patata/,'patata'],
  [/pastanag(a|ues)/,'pastanaga'],
  [/pebrot(s)?\s*(vermell|verd|choricero|piquillo)?/,'pebrot'],
  [/carbass(o|ó|ons)/,'carbassó'],
  [/alberg[ií]ni(a|es)/,'albergínia'],
  [/espinac(s)?/,'espinacs'],
  [/bled(es|a)/,'bledes'],
  [/enciam(s)?/,'enciam'],
  [/ruca|rúcula/,'ruca'],
  [/porro(s)?/,'porro'],
  [/api/,'api'],
  [/carxof(a|es)/,'carxofa'],
  [/bolets|champiny[oó]ns|xampinyons|rossinyols|trompetes|camagrocs|cames de perdiu/,'bolets'],
  [/monget(es|a|es)\s*(verdes|tendres)?|jud[ií]es verdes/,'mongetes tendres'],
  [/monget(es|a|es)\s*(blanques|negres|roges|seques)?/,'mongetes seques'],
  [/p[èe]sol(s)?/,'pèsols'],
  [/llent(i|í)(es|a)s?/,'llenties'],
  [/cigron(s)?/,'cigrons'],
  [/fesol(s)?/,'fesols'],
  [/arr[oò]z?|arr[oò]s/,'arròs'],
  [/esparguetis|macarrons|fideus|tallarins|noodles|penne|pasta\b/,'pasta'],
  [/pa\b|pan\b|molla|brioix|baguet/,'pa'],
  [/llet\b(entera|semidesnatada|desnatada|de coco)?/,'llet'],
  [/mantega/,'mantega'],
  [/formatge\s*(fresc|de cabra|blau|crema|ratllat|manxego|parmesà|mozzarella|mató)?|parmesà|mozzarella|mascarpone/,'formatge'],
  [/iou?rt?|iogurt|yogur/,'iogurt'],
  [/ou(s)?\b|ous/,'ous'],
  [/nata/,'nata'],
  [/pollastre|pit de pollastre|muslos de pollastre|aletes de pollastre/,'pollastre'],
  [/conill/,'conill'],
  [/vedella|ternera|carn picada|hamburguesa/,'vedella'],
  [/porc|llom|xoriço|botifarra|pernil|bacó|panceta|costel·la|xulleta/,'carn de porc'],
  [/xai|corder/,'xai'],
  [/bacallà/,'bacallà'],
  [/salm[oó]/,'salmó'],
  [/tonyina|bon[ií]tol/,'tonyina'],
  [/lluç|merluça|pescadilla/,'lluç'],
  [/gamb(es|a)|llagostins|gambes/,'gambes i llagostins'],
  [/muscle(s)?|mejillones/,'muscles'],
  [/clo[iï]ss(es|a)/,'cloïsses'],
  [/calamar(s)?|s[ií]pia|pop\b/,'calamar i sípia'],
  [/sardin(es|a)|seitons|anxov(es|a)/,'sardines'],
  [/rape|llenguado|llobarro|dorada|verat|jurel|truita|galera|gamba blanca/,'peix blanc i blau'],
  [/ametl·la|ametlla|avellana|nou\b|nous|pinyons|pistatx|llavors/,'fruits secs'],
  [/panses|prunes seques|orejones|figues seques|d[aà]tils/,'fruita seca'],
  [/oli d'?oliva|oli de gira-sol|^oli$|oli vegetal/,'oli'],
  [/vinagre/,'vinagre'],
  [/sucre\s*(blanc|morè|glas)?|^sucre$/,'sucre'],
  [/farina\b/,'farina'],
  [/sal\b/,'sal'],
  [/pebre vermell|paprika/,'pebre vermell'],
  [/pebre\b( negre| blanc)?/,'pebre'],
  [/orenga|farigola|roman[ií]|julivert|alf[aà]brega|llorer|anet|com[ií]|safr[aà]|cura[cç]ao|herbes/,'herbes i espècies'],
  [/caldo|brou|fumet/,'brou'],
  [/vi blanc|vi negre|vi ranci|xerès|cava|cervesa/,'begudes alcohòliques'],
  [/aigua/,'aigua'],
];
function foodBase(rawName){
  const n=String(rawName||'').toLowerCase().trim();
  for(const [re,base] of FOOD_BASE){ if(re.test(n)) return base; }
  /* sense regla: retalla qualifiers freqüents i retorna el substantiu principal */
  const cleaned=n.replace(/\b(fresc|fresca|frescos|fresques|picat|picada|trossejat|ratllat|pelat|en\s+\w+|de\s+la\s+casa|extra)\b/g,'').trim();
  const first=cleaned.split(/[\s,]+/).slice(0,2).join(' ');
  return first||cleaned||n;
}
function isPantryItem(name){
  const base=foodBase(name);
  return pantryList().some(p=>{
    const pb=p.toLowerCase().trim();
    return base===pb||base.indexOf(pb)>=0||pb.indexOf(base)>=0&&base.length>3;
  });
}

function collectMenuIngredients(){
  const map=new Map(); /* key base|unit -> {qty total, variants[], recipes[]} */
  Object.keys(S.menu).forEach(key=>{
    (S.menu[key]||[]).forEach(meal=>{
      const r=mealRecipe(meal);if(!r)return; /* àpats lliures: res a comprar */
      const factor=meal.diners/(r.servings||meal.diners||2);
      r.ingredients.forEach(ing=>{
        const rawName=ing.name.trim();
        if(isPantryItem(rawName))return; /* despesa: va a la línia final, no és ítem */
        const base=foodBase(rawName);
        const unit=(ing.unit||'').trim();
        const k=base+'|'+unit;
        const cur=map.get(k)||{name:capFirst(base),unit:unit,qty:0,variants:new Map(),from:new Set()};
        const q=(typeof ing.qty==='number'&&isFinite(ing.qty))?ing.qty*factor:0;
        cur.qty+=q;
        if(rawName.toLowerCase()!==base.toLowerCase())cur.variants.set(rawName.toLowerCase(),rawName);
        cur.from.add(r.name);
        map.set(k,cur);
      });
    });
  });
  /* nota de variants: fins a 3 noms originals diferents */
  return Array.from(map.values()).map(c=>({
    name:c.name,unit:c.unit,qty:c.qty,from:c.from,
    note:Array.from(c.variants.values()).slice(0,3)
  }));
}
function capFirst(x){return x?x.charAt(0).toUpperCase()+x.slice(1):x;}

function regenerateShoppingList(){
  const prev=new Map(S.shopping.items.map(i=>[i.name.toLowerCase()+'|'+(i.unit||''),i]));
  const collected=collectMenuIngredients();
  const items=[];
  collected.forEach(c=>{
    const key=c.name.toLowerCase()+'|'+c.unit;
    const old=prev.get(key);
    const cat=guessCategory(c.name);
    items.push({
      id:old?old.id:uid(),
      name:c.name,unit:c.unit,
      qty:roundQty(c.qty),
      category:old?old.category:cat,
      done:old?old.done:false,
      from:Array.from(c.from),
      note:c.note||[]
    });
  });
  /* recompte de despensa (no són ítems): per a la línia final */
  const pantryUsed=new Set();
  Object.keys(S.menu).forEach(key=>{
    (S.menu[key]||[]).forEach(meal=>{
      const r=mealRecipe(meal);if(!r)return;
      (r.ingredients||[]).forEach(ing=>{ if(isPantryItem(ing.name)) pantryUsed.add(foodBase(ing.name)); });
    });
  });
  S.shopping.pantry=[...pantryUsed];
  /* mantén els extra manuals que ja no venen del menú */
  S.shopping.items.forEach(o=>{
    if(o.extra){
      const still=items.some(i=>i.id===o.id);
      if(!still)items.push(o);
    }
  });
  S.shopping.items=items;
  S.shopping.stale=false;
  save();renderShopping();updateShopBadge();updateShopStatus();
  toast('Llista generada: '+items.length+' productes');
}
function roundQty(q){
  if(!q)return null;
  if(q>=100)return Math.round(q);
  if(q>=10)return Math.round(q*2)/2;
  return Math.round(q*4)/4;
}
function guessCategory(name){
  const n=name.toLowerCase();
  const rules=[
    [/tomàquet|enciam|ceb|pastanaga|patata|plàtan|poma|pera|tarong|llimona|albercoc|cirera|maduix|espina|bleda|carbass|pebrot|allo|ceba|fruit|verdur|mongeta verda|api|porr|all|iogurt grenc/i,'Fruita i verdura'],
    [/pollastre|vedella|porc|llom|bacallà|salmó|tonyina|lluç|gamb|musclo|carn|peix|truita fuma|hamburgues|botifar|pernil|fuet|xicra/i,'Carn i peix'],
    [/llet|mantega|formatge|iogurt|ou|kefir|nata|mozzarella|ratatouille|parmesà/i,'Làctics i ous'],
    [/pa|croissant|baguet|magdalena|brio|xocolata|galeta|farina|pasta espagueti|macarró|arròs|quinoa|cuscús|llegum|llentia|cigron|fesol sec|café|cafè|sucre|oli|vinagre|sal|espècia|llauna|tomàquet triturat|mel|crema de/i,'Despensa'],
    [/aigua|suc|refresc|vi |vi$|cervesa|cava|tònica|beguda/i,'Begudes'],
    [/congel|gelat|pèsol congel|verdura congel|pizza congel/i,'Congelats'],
    [/paper|detergent|netej|estropall|lavavajilles|rentadora|aixeta|esponja|llençol|gel hidro/i,'Neteja'],
  ];
  for(const [re,cat] of rules)if(re.test(n))return cat;
  return 'Altres';
}

function renderShopping(){
  const wrap=$('#shopList');
  const items=S.shopping.items;
  $('#shopEmpty').classList.toggle('hidden',items.length>0);
  updateShopStatus();
  const cats=S.categories.filter(c=>items.some(i=>(i.category||'Altres')===c));
  const otherItems=items.filter(i=>!cats.includes(i.category||'Altres'));
  const groups=[...cats.map(c=>[c,items.filter(i=>(i.category||'Altres')===c)]),...(otherItems.length?[['Altres',otherItems]]:[])];
  wrap.innerHTML=groups.map(([cat,list])=>{
    list.sort((a,b)=>(a.done-b.done)||a.name.localeCompare(b.name));
    return '<div style="break-inside:avoid;margin-bottom:14px"><h3 style="margin:0 0 4px">'+esc(cat)+'</h3>'
      +list.map(i=>
        '<div class="shop-item'+(i.done?' done':'')+'" data-id="'+i.id+'">'
        +'<input type="checkbox"'+(i.done?' checked':'')+' data-check="'+i.id+'">'
        +'<label data-check="'+i.id+'">'+esc(i.name)
        +(i.note&&i.note.length?' <span class="src-note">('+esc(i.note.join(' · '))+')</span>':'')
        +(i.from&&i.from.length?' <span class="src-note">('+esc(i.from.join(', '))+')</span>':'')
        +(i.extra?' <span class="src-note">· extra</span>':'')+'</label>'
        +(i.qty?'<span class="qty-badge">'+fmtQty(i)+(i.unit?' '+esc(i.unit):'')+'</span>':'')
        +'<button class="del-shop" data-delshop="'+i.id+'" title="Elimina" style="color:var(--danger);background:none;border:none;font-size:13px;padding:2px 4px">✕</button>'
        +'</div>').join('')
      +'</div>';
  }).join('');
  const pan=(S.shopping.pantry||[]).filter(Boolean);
  if(pan.length){
    wrap.innerHTML+='<div class="pantry-line"><b>No cal comprar (despensa):</b> '
      +esc(capFirst(pan.join(' · ')))+'</div>';
  }
}
function fmtQty(i){return String(i.qty).replace('.',',');}

$('#shopList').addEventListener('click',e=>{
  const chk=e.target.closest('[data-check]');
  if(chk){
    const it=byId(S.shopping.items,chk.dataset.check);
    it.done=!it.done;save();renderShopping();updateShopBadge();return;
  }
  const del=e.target.closest('[data-delshop]');
  if(del){
    S.shopping.items=S.shopping.items.filter(i=>i.id!==del.dataset.delshop);
    save();renderShopping();updateShopBadge();
  }
});
$('#genShopBtn').onclick=regenerateShoppingList;
$('#clearShopBtn').onclick=()=>{
  if(confirm('Buidar tota la llista de la compra?')){
    S.shopping={items:[],stale:false};save();renderShopping();updateShopBadge();
  }
};
$('#updateQtyBtn').onclick=regenerateShoppingList;
$('#printShopBtn').onclick=()=>{
  const items=S.shopping.items;
  if(!items.length){toast('La llista és buida.');return;}
  $('#printArea').innerHTML='<h2>Midweek — Llista de la compra</h2><ul style="font-size:14px;line-height:1.9">'
    +items.map(i=>'<li'+(i.done?' style="opacity:.45;text-decoration:line-through"':'')+'>'
      +(i.qty?'<b>'+fmtQty(i)+(i.unit?' '+esc(i.unit):'')+'</b> ':'')+esc(i.name)
      +(i.from&&i.from.length?' <small>('+esc(i.from.join(', '))+')</small>':'')+'</li>').join('')+'</ul>';
  window.print();
};
$('#toReceiptBtn').onclick=()=>{
  const pending=S.shopping.items.filter(i=>!i.done);
  if(!pending.length){toast('Marca primer els productes que has comprat.');switchTab('receipts');return;}
  startDraftFromCart(pending);
};

/* extra manual */
function fillExtraCat(){
  const sel=$('#extraCat');
  sel.innerHTML=S.categories.map(c=>'<option>'+esc(c)+'</option>').join('');
}
$('#addExtraBtn').onclick=()=>{
  const name=$('#extraName').value.trim();
  if(!name)return;
  S.shopping.items.push({id:uid(),name:name,qty:null,unit:'',category:$('#extraCat').value,done:false,extra:true,from:[]});
  $('#extraName').value='';save();renderShopping();updateShopBadge();
  toast('Afegit a la llista');
};
$('#extraName').addEventListener('keydown',e=>{if(e.key==='Enter')$('#addExtraBtn').click();});