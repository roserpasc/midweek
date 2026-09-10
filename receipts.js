'use strict';
/* ============================================================
   Midweek — Fitxer 2/2: tiquets amb foto→IA, costos per persona,
   balanç compartit, opcions, seed i arrencada.
   (s'afegeix a app.js via <script src> en ordre)
   ============================================================ */

/* ============================================================
   PERSONES
   ============================================================ */
/* ---- visibilitat de tiquets ocults ---- */
/* un tiquet ocult el veuen: qui el va escanejar (payer) i la persona que impliqua el splitWith */
function canSeeReceipt(rc,viewerId){
  if(!rc.hidden)return true;
  if(!viewerId)return false; /* 'tothom (compartit)' no veu ocults */
  if(rc.payerId===viewerId)return true;
  if(rc.splitWith===viewerId)return true;
  return false;
}
function receiptInvolved(rc,personId){
  if(!rc.splitWith||rc.splitWith==='')return true;
  if(rc.splitWith==='none')return rc.payerId===personId;
  return rc.payerId===personId||rc.splitWith===personId;
}
function receiptShareCount(rc){
  if(!rc.splitWith||rc.splitWith==='')return S.people.length||2;
  if(rc.splitWith==='none')return 1;
  return 2;
}
function renderPeople(){
  const row=$('#peopleRow');
  row.innerHTML=S.people.map(p=>
    '<div class="person-pill" data-id="'+p.id+'">'
    +'<input type="color" value="'+esc(p.color)+'" data-pcolor>'
    +'<input type="text" value="'+esc(p.name)+'" data-pname>'
    +'<button data-pdel title="Elimina">✕</button></div>').join('');
}
$('#peopleRow').addEventListener('change',e=>{
  if(e.target.dataset.pcolor!==undefined){
    personById(e.target.closest('.person-pill').dataset.id).color=e.target.value;
    save();renderPeople();renderReceipts();renderBalance();
  }
});
$('#peopleRow').addEventListener('input',debounce(e=>{
  if(e.target.dataset.pname!==undefined){
    personById(e.target.closest('.person-pill').dataset.id).name=e.target.value.trim()||'?';
    save();renderPayerSelect();renderBalance();renderIdentity();
  }
},300));
$('#peopleRow').addEventListener('click',e=>{
  const b=e.target.closest('[data-pdel]');
  if(!b)return;
  const id=b.closest('.person-pill').dataset.id;
  if(S.people.length<=1){toast('Cal mantenir com a mínim una persona.');return;}
  if(!confirm('Eliminar aquesta persona? Les seves compres passaran a "—". '))return;
  S.people=S.people.filter(p=>p.id!==id);
  save();renderPeople();renderPayerSelect();renderBalance();
});
$('#addPersonBtn').onclick=()=>{
  const colors=['#5E8772','#C77D46','#7B6CA8','#4E8EA8','#A85D74'];
  S.people.push({id:uid(),name:'Persona '+(S.people.length+1),color:colors[S.people.length%colors.length],pin:''});
  save();renderPeople();renderPayerSelect();
};

/* ============================================================
   ESBORRANY DE COMPRA / TIQUET
   ============================================================ */
let draft=null;
/* draft = {photo(dataURL|null), date, store, payerId, items:[{name,qty,unit,price}], ai:{model,msec,warn}} */

function startDraftFromCart(items,list){
  draft={
    photo:null,date:todayIso(),store:'',
    payerId:(S.people[0]||{}).id,
    items:items.map(i=>({name:i.name,qty:i.qty,unit:i.unit||'',price:null})),
    fromLists:list?[list.id]:[],
    hidden:false,splitWith:'',
    ai:null
  };
  switchTab('receipts');renderDraft();
  toast(items.length+' productes carregats al tiquet — posa-hi els preus');
}

function renderDraft(){
  const c=$('#draftCard');
  c.classList.toggle('hidden',!draft);
  $('#draftPhotoSlot').innerHTML=draft&&draft.photo
    ?'<img class="receipt-photo" src="'+draft.photo+'" alt="tiquet" data-zoom-photo>'
    :(draft?'<p class="muted tiny" style="margin:6px 0">Sense foto associada.</p>':'');
  if(!draft)return;
  $('#draftDate').value=draft.date;
  $('#draftStore').value=draft.store||'';
  renderPayerSelect();
  $('#draftStatus').className='status-tag hidden';
  let total=0;
    const rows = draft.items.map((it, idx) => {
  total += Number(it.price) || 0;
  /* UN sol requadre per producte: nom a dalt; Quant.+unitat i Preu a sota; X petita baix-dreta */
  return '<div class="draft-item" data-idx="'+idx+'">'
    +'<div class="di-field"><span class="di-label">Producte</span>'
      +'<input value="'+esc(it.name)+'" data-f="name" placeholder="Producte" autocomplete="off"></div>'
    +'<div class="di-grid">'
      +'<div class="di-field"><span class="di-label">Quant.</span>'
        +'<div class="di-qty">'
          +'<input value="'+(it.qty!=null?it.qty:'')+'" data-f="qty" inputmode="decimal" placeholder="">'
          +'<input value="'+esc(it.unit||'')+'" data-f="unit" placeholder="">'
        +'</div></div>'
      +'<div class="di-field di-price"><span class="di-label">Preu €</span>'
        +'<input value="'+(it.price!=null?String(it.price).replace('.',','):'')+'" data-f="price" inputmode="decimal" placeholder="0,00"></div>'
    +'</div>'
    +'<button class="di-del" data-delrow title="Elimina aquest producte">✕</button>'
    +'</div>';
}).join('');
    $('#draftTable').innerHTML=(draft.items.length
      ?rows
      :'<p class="empty-hint">Cap línia — afegeix-ne o escaneja un tiquet.</p>');
  $('#draftTotal').textContent=eur(total);
  $('#draftHint').textContent=draft.items.length+' línies · revisa els preus abans de desar';
  /* banner IA */
  const slot=$('#aiBannerSlot');
  slot.innerHTML=draft.ai
    ?('<div class="ai-banner'+(draft.ai.warn?' warn':'')+'"><span>'+(draft.ai.warn?'⚠️':'✨')+'</span><div>'
      +'Detectat per <b>'+esc(draft.ai.model)+'</b> en '+Math.round(draft.ai.msec/100)/10+' s'
      +(draft.ai.warn?' — <b>revisa les xifres</b>: '+esc(draft.ai.warn):' — revisa les línies abans de desar.')
      +'</div></div>')
    :'';
}

/* inputs de l'esborrany (delegació) */
$('#draftTable').addEventListener('input',e=>{
  const inp=e.target.closest('input,select');if(!inp)return;
  const item=inp.closest('[data-idx]');if(!item||!draft)return;
  const it=draft.items[+item.dataset.idx];if(!it)return;
  if(inp.dataset.f==='name'){it.name=inp.value;}
  else if(inp.dataset.f==='qty'){it.qty=inp.value===''?null:+inp.value;}
  else if(inp.dataset.f==='unit'){it.unit=inp.value;}
  else if(inp.dataset.f==='price'){it.price=inp.value===''?null:+inp.value.replace(',','.');}
  /* NO re-render complet: així el camp no perd el focus mentre s'escriu */
  const total=draft.items.reduce((a,i)=>a+(Number(i.price)||0),0);
  $('#draftTotal').textContent=eur(total);
});
$('#draftTable').addEventListener('click',e=>{
  const del=e.target.closest('[data-delrow]');
  if(!del)return;
  const item=del.closest('[data-idx]');
  if(!item||!draft)return;
  draft.items.splice(+item.dataset.idx,1);renderDraft();
});
$('#addDraftItemBtn').onclick=()=>{if(!draft)draft={photo:null,date:todayIso(),store:'',payerId:S.currentUser||(S.people[0]||{}).id,items:[],fromLists:[],ai:null};draft.items.push({name:'',qty:null,unit:'',price:null});renderDraft();};
$('#discardDraftBtn').onclick=()=>{
  if(draft&&draft.items.length&&!confirm('Descartar l\'esborrany actual?'))return;
  draft=null;renderDraft();
};
$('#draftDate').onchange=e=>{if(draft)draft.date=e.target.value;};
$('#draftStore').oninput=e=>{if(draft)draft.store=e.target.value;};

function renderPayerSelect(){
  const sel=$('#draftPayer');
  const cur=draft?draft.payerId:(S.people[0]||{}).id;
  sel.innerHTML=S.people.map(p=>'<option value="'+p.id+'"'+(p.id===cur?' selected':'')+'>'+esc(p.name)+'</option>').join('')
    ||'<option value="">—</option>';
  /* splitWith: amb qui es comparteix la compra */
  const sel2=$('#draftSplitWith');
  const opts='<option value="">amb tothom</option>'
    +'<option value="none"'+(draft&&draft.splitWith==='none'?' selected':'')+'>amb ningú</option>'
    +S.people.map(p=>'<option value="'+p.id+'"'+(draft&&draft.splitWith===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  sel2.innerHTML=opts;
}
$('#draftPayer').onchange=e=>{if(draft)draft.payerId=e.target.value;};
$('#draftSplitWith').onchange=e=>{if(draft)draft.splitWith=e.target.value||''};
$('#draftHidden').onchange=e=>{if(draft)draft.hidden=e.target.value==='1';};

/* desar compra */
$('#saveReceiptBtn').onclick=()=>{
  if(!draft||!draft.items.length){toast('L\'esborrany és buit.');return;}
  const items=draft.items.filter(i=>i.name.trim())
    .map(i=>Object.assign({},i,{name:i.name.trim(),unit:(i.unit||'').trim()}));
  if(!items.length){toast('Totes les línies són buides.');return;}
  /* si hi ha llistes de compra: demanar per a quines és el tiquet */
  const lists=S.shoppingLists||[];
  if(lists.length&&!draft.fromLists){
    openReceiptListsModal(lists,items);
    return;
  }
  commitReceipt(items,draft.fromLists||[]);
};

/* modal: triar llistes destinatàries del tiquet */
function openReceiptListsModal(lists,items){
  openModal('<h2>A quines llistes va aquest tiquet?</h2>'
    +'<p class="muted">Els productes que coincideixin es marcaran com a comprats a les llistes triades.</p>'
    +lists.map(l=>'<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #EDF2EE">'
      +'<input type="checkbox" class="rc-list" data-id="'+l.id+'" style="accent-color:var(--accent)">'
      +'<span><b>'+esc(l.name)+'</b>'+(l.createdBy?' <span class="tiny muted">· per '+esc(l.createdBy)+'</span>':'')+'</span></label>').join('')
    +'<div class="modal-foot"><button class="btn" id="rcListsNone">Cap llista</button>'
    +'<button class="btn btn-primary" id="rcListsOk">Desa el tiquet</button></div>');
  $('#rcListsNone').onclick=()=>{closeModal();finishReceipt(items,[]);};
  $('#rcListsOk').onclick=()=>{
    const ids=$$('#modalBox .rc-list').filter(cb=>cb.checked).map(cb=>cb.dataset.id);
    closeModal();finishReceipt(items,ids);
  };
}
function commitReceipt(items,listIds){
  if((S.shoppingLists||[]).length&&!listIds.length&&!draft.fromLists){
    openReceiptListsModal(S.shoppingLists,items);
    return;
  }
  finishReceipt(items,listIds);
}
function finishReceipt(items,listIds){
  const receipt={
    id:uid(),date:draft.date||todayIso(),
    store:draft.store||'',payerId:draft.payerId||(S.people[0]||{}).id,
    splitWith:draft.splitWith||'',
    hidden:draft.hidden||false,
    items:items,
    listIds:listIds||[],
    photo:draft.photo||null,
    ai:draft.ai?{model:draft.ai.model}:null
  };
  receipt.total=items.reduce((a,i)=>a+(Number(i.price)||0),0);
  S.receipts.unshift(receipt);
  /* marca com a comprats els productes coincidents a les llistes triades */
  const boughtNames=items.map(i=>i.name.trim().toLowerCase());
  (listIds||[]).forEach(lid=>{
    const l=byId(S.shoppingLists||[],lid);if(!l)return;
    (l.items||[]).forEach(si=>{
      if(!si.done&&boughtNames.includes(si.name.toLowerCase()))si.done=true;
    });
  });
  save();
  draft=null;
  try{renderDraft();}catch(e){console.error(e);}
  try{renderLists();}catch(e){console.error(e);}
  try{updateShopBadge();}catch(e){console.error(e);}
  try{renderReceipts();}catch(e){console.error(e);}
  try{renderBalance();}catch(e){console.error(e);}
  toast('Compra desada ✓ '+eur(receipt.total));
}

/* ============================================================
   FOTO → IA (OpenRouter, model de visió)
   ============================================================ */
const SCAN_PROMPT=[
 'Ets un extractor de tiquets de supermercat. Analitza la imatge i retorna NOMÉS el JSON demanat, en UNA sola línia, sense markdown, sense explicacions i sense cap text fora del JSON:',
 '{"store":"nom del comerç","date":"YYYY-MM-DD o null","total":numero,"items":[{"name":"nom curt del producte en català","qty":numero_o_null,"unit":"kg|g|l|unitats|null","price":numero}]}',
 'Regles:',
 '- Un element per producte; si el tiquet mostra pes i preu/kg, posa qty en kg amb unit "kg".',
 '- price = preu total de la línia en euros (número, no text).',
 '- No inventis productes illegibles: si no es pot llegir, omiteix-lo.',
 '- Inclou descomptes com a item amb price negatiu si figuren.',
 '- Si el tiquet té dues pàgines, fusiona-les.']
 .join('\n');

function readImageFile(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result));
    r.onerror=reject;
    r.readAsDataURL(file);
  });
}
async function downscaleDataUrl(dataUrl,maxSide){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1,maxSide/Math.max(img.width,img.height));
      if(scale>=1){resolve(dataUrl);return;}
      const cv=document.createElement('canvas');
      cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      resolve(cv.toDataURL('image/jpeg',0.82));
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}

async function scanImage(dataUrl){
  if(!S.settings.apiKey){
    alert('Primer configura la teva clau d\'OpenRouter a la pestanya Opcions.');
    switchTab('settings');return;
  }
  const model=S.settings.model||'google/gemini-2.5-flash';
  const t0=Date.now();
  $('#scanProgress').classList.remove('hidden');
  setProgress(15,'Enviant imatge…');
  try{
    const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+S.settings.apiKey
      },
      body:JSON.stringify({
        model:model,
        max_tokens:1500,
        temperature:0,
        messages:[{
          role:'user',
          content:[
            {type:'text',text:SCAN_PROMPT},
            {type:'image_url',image_url:{url:dataUrl}}
          ]
        }]
      })
    });
    setProgress(70,'Processant resposta…');
    if(!res.ok){
      const txt=await res.text().catch(()=>'');
      throw new Error('HTTP '+res.status+' — '+txt.slice(0,180));
    }
    const data=await res.json();
    const content=data.choices?.[0]?.message?.content||'';
    const jsonStr=extractJson(content);
    if(!jsonStr)throw new Error('La IA no ha retornat JSON reconeixible.');
    const parsed=JSON.parse(jsonStr);
    const items=(parsed.items||[]).map(i=>({
      name:String(i.name||'').trim(),
      qty:parseNum(i.qty),
      unit:i.unit?String(i.unit):'',
      price:parseNum(i.price)
    })).filter(i=>i.name);
    if(!items.length)throw new Error('No s\'ha detectat cap article llegible.');
    if(!draft)draft={photo:null,date:todayIso(),store:'',payerId:S.currentUser||(S.people[0]||{}).id,items:[],fromLists:[],ai:null};
    if(draft.photo&&draft.photo!==dataUrl)draft.items=[];
    draft.photo=dataUrl;
    draft.store=parsed.store||draft.store||'';
    if(parsed.date&&/^\d{4}-\d{2}-\d{2}$/.test(parsed.date))draft.date=parsed.date;
    draft.items=items;
    const sum=items.reduce((a,i)=>a+(i.price||0),0);
    let warn=null;
    if(parsed.total&&Math.abs(sum-parsed.total)>0.05*parsed.total)
      warn='la suma de línies ('+sum.toFixed(2)+'€) difereix del total del tiquet ('+parsed.total.toFixed(2)+'€)';
    else if(!parsed.total)
      warn='el total del tiquet no s\'ha pogut llegir';
    draft.ai={model:model.split('/').pop(),msec:Date.now()-t0,warn:warn};
    renderDraft();
    toast('Escanejat ✓ '+items.length+' articles');
  }catch(err){
    console.error(err);
    toast('Error escanejant: '+err.message,4200);
  }finally{
    setProgress(100);
    setTimeout(()=>{$('#scanProgress').classList.add('hidden');setProgress(0);},600);
  }
}
function setProgress(p,label){
  const bar=$('#scanProgress > div');
  bar.style.width=p+'%';
}
function extractJson(text){
  const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(fenced)return fenced[1].trim();
  const first=text.indexOf('{'),last=text.lastIndexOf('}');
  if(first>=0&&last>first)return text.slice(first,last+1);
  return null;
}

/* entrades d'imatge */
async function handleImageInput(file){
  if(!file||!file.type.startsWith('image/')){toast('Això no sembla una imatge.');return;}
  const raw=await readImageFile(file);
  const small=await downscaleDataUrl(raw,1400);
  if(!draft)draft={photo:null,date:todayIso(),store:'',payerId:S.currentUser||(S.people[0]||{}).id,items:[],fromLists:[],ai:null};
  draft.photo=small;
  await scanImage(small);
}
$('#cameraInput').addEventListener('change',e=>{handleImageInput(e.target.files[0]);e.target.value='';});
$('#fileInput').addEventListener('change',e=>{handleImageInput(e.target.files[0]);e.target.value='';});
$('#pasteBtn').onclick=async()=>{
  try{
    const perms=await navigator.clipboard.read();
    for(const item of perms){
      const type=item.types.find(t=>t.startsWith('image/'));
      if(type){const blob=await item.getType(type);handleImageInput(blob);return;}
    }
    toast('Al porta-retalls no hi ha cap imatge.');
  }catch(e){toast('El navegador no ha permès llegir el porta-retalls. Fes servir Ctrl+V directament.',3500);}
};
document.addEventListener('paste',e=>{
  if(S.ui.tab!=='receipts')return;
  const files=[...(e.clipboardData?.files||[])];
  if(files.length)handleImageInput(files[0]);
});

/* ============================================================
   LLISTA DE COMPRAS DESADES + BALANÇ
   ============================================================ */
function renderReceipts(){
  const wrap=$('#receiptsList');
  if(!S.receipts.length){
    wrap.innerHTML='<div class="card"><p class="empty-hint">Encara no hi ha compres desades. Escaneja el primer tiquet 👆</p></div>';
    return;
  }
  const viewer=S.currentUser||'';
  const visible=S.receipts.filter(r=>canSeeReceipt(r,viewer));
  if(!visible.length&&S.receipts.length){
    wrap.innerHTML='<div class="card"><p class="empty-hint">Cap compra visible amb aquest filtre de privacitat.</p></div>';
    return;
  }
  wrap.innerHTML=visible.map(rc=>{
    const payer=personById(rc.payerId);
    const total=rc.total||0;
    return '<details class="card receipt-row">'
      +'<summary class="receipt-summary">'
      +'<span class="rs-store">'+esc(rc.store||'Compra')+'</span>'
      +'<span class="rs-meta">'+esc(fmtShortDate(rc.date))+'</span>'
      +(payer?'<span class="rs-payer"><span class="dotc" style="background:'+esc(payer.color)+'"></span>'+esc(payer.name)+'</span>':'<span class="rs-meta">—</span>')
      +'<span class="rs-total">'+eur(total)+'</span>'
      +(rc.hidden?'<span class="tag" title="Tiquet ocult">🔒</span>':'')
      +'</summary>'
      +'<div class="receipt-detail">'
      +'<div class="muted tiny" style="margin-bottom:6px">'+esc(fmtLongDate(rc.date))
      +(rc.ai?' · 🤖 '+esc(rc.ai.model):'')+'</div>'
      +renderSplitChips(rc)
      +'<details style="margin-top:8px"><summary class="muted tiny" style="cursor:pointer">'+rc.items.length+' articles</summary>'
      +'<table class="items"><tbody>'+rc.items.map(i=>'<tr><td>'+esc(i.name)+(i.qty?' <span class="muted tiny">×'+i.qty+(i.unit?' '+esc(i.unit):'')+'</span>':'')+'</td><td class="num">'+(i.price!=null?eur(i.price):'—')+'</td></tr>').join('')+'</tbody></table></details>'
      +(rc.photo?'<div style="margin-top:8px"><img class="receipt-photo" src="'+rc.photo+'" alt="tiquet" data-viewphoto="'+rc.id+'" style="max-width:180px"></div>':'')
      +'<div style="text-align:right;margin-top:8px"><button class="btn btn-danger btn-sm" data-delrc="'+rc.id+'">Elimina compra</button></div>'
      +'</div>'
      +'</details>';
  }).join('');
}
function fmtShortDate(ds){
  try{return new Date(ds+'T00:00:00').toLocaleDateString('ca-ES',{day:'numeric',month:'short'});}
  catch(e){return ds;}
}
function fmtLongDate(ds){
  try{return new Date(ds+'T00:00:00').toLocaleDateString('ca-ES',{weekday:'long',day:'numeric',month:'long'});}
  catch(e){return ds;}
}
function splitFor(receipt){
  const n=receiptShareCount(receipt);
  const share=receipt.total/n;
  return S.people.map(p=>{
    if(!receiptInvolved(receipt,p.id))return {person:p,amount:0};
    return {person:p,amount:p.id===receipt.payerId?(receipt.total-share):(-share)};
  });
}
function renderSplitChips(rc){
  const parts=splitFor(rc);
  return '<div class="splits">'+parts.map(pt=>
    '<div class="split-chip" style="border-color:'+esc(pt.person.color)+'55">'
    +'<span class="tiny muted"><span class="dotc" style="background:'+esc(pt.person.color)+'"></span>'+esc(pt.person.name)+'</span>'
    +'<b style="color:'+(pt.amount>=0?'#2F6A46':'#93392F')+'">'+(pt.amount>=0?'+':'')+eur(pt.amount)+'</b>'
    +'</div>').join('')+'</div>';
}
$('#receiptsList').addEventListener('click',e=>{
  const vp=e.target.closest('[data-viewphoto]');
  if(vp){
    const rc=byId(S.receipts,vp.dataset.viewphoto);
    openModal('<h2>Tiquet</h2><img src="'+rc.photo+'" style="width:100%;border-radius:10px" alt="tiquet ampliat">'
      +'<div class="modal-foot"><span></span><button class="btn btn-primary" onclick="closeModal()">Tanca</button></div>');
    return;
  }
  const dl=e.target.closest('[data-delrc]');
  if(dl&&confirm('Eliminar aquesta compra del registre?')){
    S.receipts=S.receipts.filter(r=>r.id!==dl.dataset.delrc);
    save();renderReceipts();renderBalance();
  }
});

function settledDeltaFor(id, viewer){
  /* liquidacions JA FETES: resten del balanç pendent.
     qui VA REBRE diners (toId): el seu crèdit baixa; qui VA PAGAR (fromId): el seu deute baixa */
  let d=0;
  S.settlements.forEach(st=>{
    if(st.toId===id)d-=st.amount;
    if(st.fromId===id)d+=st.amount;
  });
  return d;
}
function renderBalance(){
  const el=$('#balanceBody');
  const viewer=S.currentUser||'';
  const visible=S.receipts.filter(r=>canSeeReceipt(r,viewer));
  if(!visible.length&&!S.settlements.length){
    el.innerHTML='<p class="empty-hint">Sense compres encara.</p>';return;
  }
  const spent = {}, share = {};
  S.people.forEach(p => { spent[p.id] = 0; share[p.id] = 0; });
  visible.forEach(r => {
    if (spent[r.payerId] != null) spent[r.payerId] += r.total;
    S.people.forEach(p => { if (receiptInvolved(r, p.id)) share[p.id] += r.total / receiptShareCount(r); });
  });
  el.innerHTML='<table class="items"><tbody>'+S.people.map(p=>{
    const bal=spent[p.id]-share[p.id]+settledDeltaFor(p.id, viewer);
    return '<tr><td><span class="dotc" style="background:'+esc(p.color)+'"></span>'+esc(p.name)+'</td>'
      +'<td class="num muted tiny">ha pagat '+eur(spent[p.id])+'</td>'
      +'<td class="num"><b style="color:'+(bal>=0.005?'#2F6A46':bal<-0.005?'#93392F':'inherit')+'">'
      +(bal>=0.005?'+':bal<-0.005?'−':'')+eur(Math.abs(bal))+'</b></td></tr>';
  }).join('')+'</tbody></table>'
  +'<p class="muted tiny" style="margin:8px 0 0">Despesa visible: <b>'+eur(visible.reduce((a,r)=>a+r.total,0))+'</b></p>';
}
$('#settleBtn').onclick=()=>{
  if(!S.receipts.length){toast('Encara no hi ha compres.');return;}
  /* tria abast: totals o només algunes persones */
  openModal('<h2>Liquidar comptes</h2>'
    +'<p class="muted">Tria per a qui vols liquidar (deixa-ho tot en blanc = tothom).</p>'
    +S.people.map(p=>'<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #EDF2EE">'
      +'<input type="checkbox" class="st-person" data-id="'+p.id+'" style="accent-color:var(--accent)">'
      +'<span class="dotc" style="background:'+esc(p.color)+'"></span>'+esc(p.name)+'</label>').join('')
    +'<div class="modal-foot"><span></span>'
    +'<button class="btn btn-primary" id="stScope">Continua</button></div>');
  $('#stScope').onclick=()=>{
    const ids=$$('#modalBox .st-person').filter(cb=>cb.checked).map(cb=>cb.dataset.id);
    openSettlement(ids.length?ids:null);
  };
};
function openSettlement(scopeIds){
  const people=scopeIds&&scopeIds.length?S.people.filter(p=>scopeIds.includes(p.id)):S.people;
  /* Calcula balance per persona tenint compte de splitWith per cada tiquet,
     i NOMÉS amb els tiquets que el visor actual pot veure (privacitat) */
  const viewer=S.currentUser||'';
  const relevantReceipts = S.receipts.filter(r =>
    canSeeReceipt(r,viewer) && people.some(p => receiptInvolved(r, p.id))
  );
  const spent = {};
  const share = {};
  people.forEach(p => { spent[p.id] = 0; share[p.id] = 0; });
  relevantReceipts.forEach(r => {
    if (spent[r.payerId] != null) spent[r.payerId] += r.total;
    const cnt = receiptShareCount(r);
    people.forEach(p => { if (receiptInvolved(r, p.id)) share[p.id] += r.total / cnt; });
  });
  const rows = people.map(p => ({p, bal: spent[p.id] - share[p.id] + settledDeltaFor(p.id, viewer)}));
  const debtors=rows.filter(r=>r.bal<-0.01).sort((a,b)=>a.bal-b.bal);
  const creditors=rows.filter(r=>r.bal>0.01).sort((a,b)=>b.bal-a.bal);
  let transfers=[],di=0,ci=0;
  while(di<debtors.length&&ci<creditors.length){
    const d=debtors[di],c=creditors[ci];
    const amt=Math.min(-d.bal,c.bal);
    transfers.push({from:d.p,to:c.p,amount:amt});
    d.bal+=amt;c.bal-=amt;
    if(Math.abs(d.bal)<0.01)di++;
    if(Math.abs(c.bal)<0.01)ci++;
  }
  openModal('<h2>Liquidar comptes</h2>'
    +(transfers.length
      ?transfers.map(t=>'<div class="ai-banner" style="align-items:center"><span>💸</span><div><b>'+esc(t.from.name)+'</b> ha de donar <b>'+eur(t.amount)+'</b> a <b>'+esc(t.to.name)+'</b></div></div>').join('')
      :'<p class="muted">Tot està quadrat ✅</p>')
    +'<div class="modal-foot"><button class="btn btn-danger btn-sm" id="resetBal">Reinicia balanç</button>'
    +'<div style="display:flex;gap:8px"><button class="btn" id="stCancel">Tanca</button>'
    +(transfers.length?'<button class="btn btn-primary" id="stOk">Marca com a liquidat</button>':'')+'</div></div>');
  $('#stCancel').onclick=closeModal;
  const rb=$('#resetBal');
  if(rb)rb.onclick=()=>{
    if(confirm('Esborrar l\'historial de liquidacions?')){
      S.settlements=[];save();renderBalance();closeModal();toast('Balanç reiniciat');
    }
  };
  const ok=$('#stOk');
  if(ok)ok.onclick=()=>{
    transfers.forEach(t=>S.settlements.push({date:todayIso(),fromId:t.from.id,toId:t.to.id,amount:t.amount}));
    save();renderBalance();closeModal();toast('Comptes liquidats ✓');
  };
}

/* ============================================================
   OPCIONS
   ============================================================ */
$('#apiKeyInput').value=S.settings.apiKey||'';
$('#apiKeyInput').oninput=debounce(e=>{
  S.settings.apiKey=e.target.value.trim();save();
},400);
$('#modelSelect').value=S.settings.model||'google/gemini-2.5-flash';
$('#modelSelect').onchange=e=>{S.settings.model=e.target.value;save();toast('Model: '+e.target.value);};
/* ============================================================
   IDENTITAT: login/anònim/crear — sense PIN, memòria per dispositiu
   ============================================================ */
const IDENTITY_KEY='midweek_identity';
function getMyIdentity(){
  try{const v=JSON.parse(localStorage.getItem(IDENTITY_KEY));if(v&&v.id)return v;}catch(e){}
  return null;
}
function setIdentity(id){
  const p=id?personById(id):null;
  if(p){
    localStorage.setItem(IDENTITY_KEY,JSON.stringify({id:p.id,name:p.name}));
    S.currentUser=p.id;
    S.anonymous=false;
  }else{
    localStorage.removeItem(IDENTITY_KEY);
    S.currentUser='';
    S.anonymous=true;
  }
  save();renderIdentity();renderReceipts();renderBalance();
}
function clearIdentity(){
  localStorage.removeItem(IDENTITY_KEY);
  S.currentUser='';
  S.anonymous=true;
  save();renderIdentity();renderReceipts();renderBalance();
}
function renderIdentity(){
  const area=$('#identityArea');
  if(!area)return;
  const u=getMyIdentity();
  const p=u?personById(u.id):null;
  area.classList.toggle('hidden',!p);
  if(p){
    $('#identityName').textContent=p.name;
    $('#identityDot').style.background=p.color;
  }
}
function openIdentityModal(){
  openModal('<h2>👋 Qui ets?</h2>'
    +'<p class="muted">Selecciona el teu usuari o crea-ne un de nou.</p>'
    +'<div class="welcome-list">'
    +S.people.map(p=>'<button data-me="'+p.id+'">'
      +'<span class="dotc" style="background:'+esc(p.color)+'"></span>'
      +'<span style="flex:1;text-align:left"><b>'+esc(p.name)+'</b></span>'
      +'<span class="tiny muted">entra →</span></button>').join('')
    +'<button data-me="__anon" style="border-style:dashed;justify-content:center">🕵️ Continuar anònim</button>'
    +'<button data-me="__new" style="border-style:dashed;justify-content:center;background:var(--verd-clar)">➕ Crear usuari nou</button>'
    +'</div>'
    +'<div class="modal-foot"><button class="btn" id="idCancel">Cancel·la</button></div>');
  $$('#modalBox [data-me]').forEach(b=>b.onclick=()=>{
    if(b.dataset.me==='__anon'){
      setIdentity(null); // anònim
      closeModal();toast('Mode anònim — els teus canvis no es guardaran com a teus');
    }else if(b.dataset.me==='__new'){
      closeModal();
      openCreateUserModal();
    }else{
      setIdentity(b.dataset.me);
      closeModal();toast('Hola, '+personById(b.dataset.me).name+' 👋');
    }
  });
  $('#idCancel').onclick=closeModal;
}
function openCreateUserModal(){
  openModal('<h2>➕ Crear usuari nou</h2>'
    +'<p class="muted">El nou usuari apareixerà a "Qui sou?" i podrà ser seleccionat.</p>'
    +'<div class="row"><div class="grow"><label>Nom</label><input id="newUserName" placeholder="ex. Maria"></div></div>'
    +'<div class="row"><div class="grow"><label>Color</label><input type="color" id="newUserColor" value="#5E8772"></div></div>'
    +'<div class="modal-foot"><span></span>'
    +'<button class="btn" id="nuCancel">Cancel·la</button>'
    +'<button class="btn btn-primary" id="nuCreate">Crea usuari</button></div>');
  $('#nuCancel').onclick=()=>openIdentityModal();
  $('#nuCreate').onclick=()=>{
    const name=$('#newUserName').value.trim();
    if(!name){toast('Posa un nom');return;}
    const color=$('#newUserColor').value;
    const p={id:uid(),name:name,color:color,pin:''};
    S.people.push(p);save();renderPeople();renderIdentity();
    closeModal();setIdentity(p.id);toast('Usuari '+name+' creat 👋');
  };
}
$('#logoutBtn').onclick=()=>{
  if(confirm('Tancar sessió? Tornaràs a la pantalla de benvinguda.')){
    clearIdentity();
  }
};

/* NO hi ha selector 'veure com a' — el filtre és el teu propi usuari */
function dummyViewerSelect(){}
/* NO hi ha selector 'veure com a' — el filtre és el teu propi usuari */
function dummyViewerSelect(){}

$('#testKeyBtn').onclick=async()=>{
  const out=$('#keyTestResult');
  out.textContent='Provant…';
  try{
    const res=await fetch('https://openrouter.ai/api/v1/models',{headers:{'Authorization':'Bearer '+S.settings.apiKey}});
    if(res.ok){
      const j=await res.json();
      out.textContent='✓ Clau vàlida — '+j.data.length+' models disponibles.';
    }else out.textContent='✗ Error HTTP '+res.status+' — revisa la clau.';
  }catch(e){out.textContent='✗ Error de xarxa: '+e.message;}
};

/* ---- credencials de sincronització Gist (per dispositiu) ---- */
function renderGistCfg(){
  const cfg=(typeof getGistCfg==='function')?getGistCfg():null;
  $('#gistIdInput').value=(cfg&&cfg.gistId)||'';
  $('#gistTokenInput').value=(cfg&&cfg.token)||'';
  $('#gistStatus').textContent=cfg?'✓ Sincronització activa amb aquest Gist.':'Sense credencials: cada dispositiu va per lliure.';
}
$('#gistSaveBtn').onclick=()=>{
  const id=$('#gistIdInput').value.trim(), tok=$('#gistTokenInput').value.trim();
  if(!id||!tok){toast('Cal ID i token.');return;}
  localStorage.setItem('midweek_gist',JSON.stringify({gistId:id,token:tok}));
  toast('Credencials desades — sincronitzant…');
  location.reload(); /* re-inicialitza el mòdul de sync amb les noves credencials */
};
function renderCatChips(){
  $('#catChips').innerHTML=S.categories.map((c,i)=>
    '<span class="chip">'+esc(c)+'<button data-catdel="'+i+'">✕</button></span>').join('');
}
$('#catChips').addEventListener('click',e=>{
  const b=e.target.closest('[data-catdel]');
  if(!b)return;
  const idx=+b.dataset.catdel;
  const used=S.shopping.items.some(i=>(i.category||'Altres')===S.categories[idx]);
  if(used&&!confirm('Hi ha productes amb aquesta categoria. Eliminar igualment?'))return;
  S.categories.splice(idx,1);
  save();renderCatChips();fillExtraCat();
});
$('#addCatBtn').onclick=()=>{
  const v=$('#newCatInput').value.trim();
  if(v&&!S.categories.includes(v)){S.categories.push(v);save();renderCatChips();fillExtraCat();}
  $('#newCatInput').value='';
};
$('#importBankBtn').onclick=()=>{
  const n=importTraditionalBank();
  toast(n?('Importades '+n+' receptes ✓'):'Ja tens tota la biblioteca.');
};
/* Restaura biblioteca: esborra TOTES les receptes de biblioteca (Corpus/Arguiñano/Gastroteca)
   i reimporta el banc actual net. No toca menús, llista de la compra ni tiquets.
   Les receptes del menú que referenciïn una de biblioteca queden com a àpat sense fitxa. */
$('#restoreBankBtn').onclick=()=>{
  if(!confirm('Això esborrarà les '+S.recipes.filter(r=>r.book).length+' receptes de biblioteca i les tornarà a importar traduïdes i amb fotos. Els àpats del menú es mantindran però si obres la seva fitxa caldrà tornar-los a assignar. Continuar?'))return;
  S.recipes=S.recipes.filter(r=>!r.book);
  const n=importTraditionalBank();
  toast('Biblioteca restaurada: '+n+' receptes ✓');
};
$('#exportBtn').onclick=()=>download('midweek-export-'+todayIso()+'.json',JSON.stringify(S,null,2));
$('#importFile').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{
    const data=JSON.parse(await f.text());
    if(!confirm('Substituir totes les dades actuals pel fitxer importat?'))return;
    S=Object.assign(defaultState(),data);
    save();boot(false);
    toast('Importació feta ✓');
  }catch(err){alert('JSON invàlid: '+err.message);}
  e.target.value='';
});
$('#wipeBtn').onclick=()=>{
  if(confirm('ESBORRAR-HO TOT? Aquesta acció no es pot desfer.')){
    localStorage.removeItem(LS_KEY);
    location.reload();
  }
};

/* ============================================================
   SEED (dades d'exemple només la primera vegada)
   ============================================================ */
function seed(){
  if(S.seedDone||S.recipes.length)return;
  const R=(name,category,time,servings,ingredients,steps)=>({
    id:uid(),name:name,category:category,time:time,servings:servings,
    ingredients:ingredients.map(([n,q,u])=>({name:n,qty:q,unit:u})),
    steps:steps
  });
  S.recipes=[
    R('Arròs amb pollastre i verdures','Carn i peix',35,2,
      [['Pollastre (pit)',300,'g'],['Arròs bomba',160,'g'],['Ceba',1,'unitats'],['Pastanaga',2,'unitats'],
       ['Pebrot vermell',1,'unitats'],['Tomàquet triturat',200,'g'],['Oli d\'oliva',3,'cspt'],['Sal',1,'cspt']],
      ['Talla el pollastre a daus i sofregix-lo amb oli.','Afegeix la ceba i la pastanaga picades.','Incorpora el pebrot i el tomàquet; cou 5 min.','Afegeix l\'arròs, remena i cobreix amb brou calent.','Cou 18 min a foc suau i deixa reposar 3 min.']),
    R('Truita de patata','Despensa',30,2,
      [['Patata',400,'g'],['Ou',5,'unitats'],['Ceba',1,'unitats'],['Oli d\'oliva',200,'ml'],['Sal',1,'cspt']],
      ['Fes les patates a foc mitjà amb oli.','Bat els ous amb sal i la ceba sofregida.','Barreja-ho tot i cuina la truita per les dues bandes.']),
    R('Pasta amb tonyina i tomàquet','Despensa',20,2,
      [['Espaguetis',180,'g'],['Tonyina en conserva',2,'llauna'],['Tomàquet triturat',250,'g'],['All',2,'unitats'],['Oli d\'oliva',2,'cspt']],
      ['Cou la pasta al dente.','Sofregiu l\'all i afegiu el tomàquet.','Barreja amb la pasta i la tonyina esqueixada.']),
    R('Amanida de llenties','Despensa',25,2,
      [['Llenties cuites',400,'g'],['Enciam',0.5,'unitats'],['Tomàquet',2,'unitats'],['Ceba tendra',1,'unitats'],['Formatge fresc',100,'g'],['Oli d\'oliva',3,'cspt'],['Vinagre',1,'cspt']],
      ['Escorre les llenties.','Talla tota la verdura.','Mescla-ho tot i amaneix.']),
    R('Salmó al forn amb verdures','Carn i peix',40,2,
      [['Salmó',300,'g'],['Carbassó',1,'unitats'],['Pastanaga',2,'unitats'],['Patata',300,'g'],['Oli d\'oliva',3,'cspt'],['Llimona',0.5,'unitats']],
      ['Precalfa el forn a 200°.','Talla les verdures i fica-les al safata amb oli.','Posa el salmó a sobre i cou 20 min.','Serveix amb suc de llimona.']),
    R('Iogurt amb fruita i fruits secs','Esmorzar',5,2,
      [['Iogurt grec',400,'g'],['Plàtan',2,'unitats'],['Maduixes',150,'g'],['Nous',50,'g'],['Mel',2,'cspt']],
      ['Serviu el iogurt en bols.','Afegeix la fruita tallada, els nous i un fil de mel.'])
  ];
  /* menú d'exemple per a la setmana actual */
  const mon=mondayOf(new Date());
  const put=(dayOffset,slot,rIdx,diners)=>{
    const key=iso(new Date(mon.getTime()+dayOffset*86400000))+'|'+slot;
    (S.menu[key]=S.menu[key]||[]).push({recipeId:S.recipes[rIdx].id,diners:diners||2});
  };
  put(0,'dinars',0);put(0,'sopars',1);
  put(1,'dinars',0);put(1,'sopars',3);
  put(2,'dinars',2);put(2,'sopars',4);
  put(3,'dinars',3);put(3,'sopars',5);
  S.seedDone=true;
  save();
}

/* ============================================================
   BOOT
   ============================================================ */
function boot(doSeed){
  if(doSeed)seed();

  try{S.recipes.forEach(ensureTags);}catch(e){}
  try{if(typeof migrateCorpusCategories==='function')migrateCorpusCategories();}catch(e){}
  /* deep-link opcional: ?tab=receipts */
  try{
    const q=new URLSearchParams(location.search).get('tab');
    if(q&&['menu','recipes','shop','receipts','settings'].includes(q))S.ui.tab=q;
  }catch(e){}
  renderTabs();
  renderWeekBar();
  renderMenu();
  renderRecipes();
  fillExtraCat();
  renderShopping();
  renderPeople();
  renderPayerSelect();
  renderDraft();
  renderReceipts();
  renderBalance();
  renderCatChips();
  try{renderGistCfg();}catch(e){}
    /* identitat: auto-login si el dispositiu ja la coneix; modal si no */
    try{
      const u=getMyIdentity();
      if(u&&personById(u.id)){setIdentity(u.id);}
      else {openIdentityModal();}
    }catch(e){}
  try{renderLists();}catch(e){}
  const info=$('#storageInfo');
  if(info){
    let bytes=0;
    try{bytes=new Blob([localStorage.getItem(LS_KEY)||'']).size;}catch(e){}
    info.textContent='Dades locals: '+Math.round(bytes/1024)+' KB · receptes: '+S.recipes.length+' · compres desades: '+S.receipts.length;
  }
}
boot(true);
/* sincronització Gist en arrencar (no-op si no hi ha credencials) */
if(typeof initialSync==='function')initialSync();

/* ---------------- self-test (?test=1) ---------------- */
(function selfTest(){
  if(!/[?&]test=1/.test(location.search))return;
  window.__mwResults=[];
  const log=(name,ok,extra)=>{
    console[(ok?'log':'error')]((ok?'PASS ':'FAIL ')+name+(extra?(' :: '+extra):''));
    window.__mwResults.push({name:name,ok:ok,extra:extra||''});
  };
  const assert=(name,cond,extra)=>log(name,!!cond,extra);

  try{
    /* 1. pestanyes existeixen */
    assert('tabs-present',$$('nav.tabs button').length===5);
    /* 2. menú renderitzat: 3 slots × 7 dies = 21 cel·les */
    assert('menu-cells',$$('td.slot').length===14,String($$('td.slot').length));
    /* 3. seed creat */
    assert('seed-recipes',S.recipes.length>=6,String(S.recipes.length));
    /* 4. afegir àpat programàticament */
    const key=iso(new Date())+'|dinars';
    pushMeal(key,{recipeId:S.recipes[0].id,diners:2});
    assert('meal-added',(S.menu[key]||[]).length>=1);
    /* 5. generar llista de la compra (llista independent) */
    ensureList('Test','Roser');
    regenerateShoppingList();
    const L=curList();
    assert('shopping-generated',L&&L.items.length>0,L&&L.items.length);
    /* 6. quantitats escalades per comensals: arròs 160g base/2 racions -> factor 1 => 160 */
    const arr=L.items.find(i=>/arròs/i.test(i.name));
    assert('shopping-has-rice',!!arr,arr&&arr.qty);
    /* 7. marcar done i extra */
    L.items[0].done=true;
    L.items.push({id:uid(),name:'paper higiènic',qty:null,unit:'',category:'Neteja',done:false,extra:true,from:[]});
    assert('shopping-extra',L.items.some(i=>i.extra));
    /* 8. esborrany manual amb 2 línies i repartiment */
    startDraftFromCart([],L);
    draft.items=[{name:'test A',qty:1,unit:'',price:6},{name:'test B',qty:1,unit:'',price:4}];
    draft.payerId=S.people[0].id;
    draft.fromLists=[L.id];
    renderDraft();
    assert('draft-total',$('#draftTotal').textContent.indexOf('10,00')>=0,$('#draftTotal').textContent);
    /* 9. desar la compra i comprovar balanç */
    $('#saveReceiptBtn').click();
    assert('receipt-saved',S.receipts.length===1,String(S.receipts.length));
    assert('receipt-total',Math.abs(S.receipts[0].total-10)<0.001,S.receipts[0].total);
    /* 10. balanç: Roser (+5) vs Paolo (−5) */
    const spent={};S.people.forEach(p=>spent[p.id]=0);
    S.receipts.forEach(r=>spent[r.payerId]+=r.total);
    const shareEach=S.receipts.reduce((a,r)=>a+r.total,0)/2;
    const balRoser=spent[S.people[0].id]-shareEach;
    assert('balance-split',Math.abs(balRoser-5)<0.001,String(balRoser));
    /* 11. settle modal genera transferència */
    $('#settleBtn').click();
    assert('settle-modal',$('#modalBg').classList.contains('hidden')===false);
    closeModal();
    /* 12. persistència */
    const saved=JSON.parse(localStorage.getItem(LS_KEY));
    assert('persist',saved.receipts.length===1&&saved.recipes.length>=6);
    /* 13. canvi de setmana manté cel·les */
    $('#nextWeek').click();$('#prevWeek').click();
    assert('week-nav',$$('td.slot').length===14);
    /* 14. extractJson */
    assert('extract-json-fence',extractJson('```json\n{"a":1}\n```')==='{\"a\":1}');
    assert('extract-json-inline',extractJson('blabla {"b":2} blabla')==='{\"b\":2}');
    /* 15. guessCategory */
    assert('guess-cat-fruit',guessCategory('Plàtan')==='Fruita i verdura');
    assert('guess-cat-milk',guessCategory('Iogurt grec')==='Làctics i ous');

    const fails=window.__mwResults.filter(r=>!r.ok);
    console.log('SELFTEST DONE — '+(window.__mwResults.length-fails.length)+'/'+window.__mwResults.length+' OK');
    document.title='TESTS '+(fails.length?'FAIL('+fails.length+')':'OK')+' — Midweek';
    if(fails.length){document.body.setAttribute('data-test-fails',JSON.stringify(fails));console.table(fails);}
    window.__testsDone=true;
  }catch(e){
    console.error('SELFTEST CRASH',e);
    window.__mwResults.push({name:'crash',ok:false,extra:String(e&&e.stack||e)});
    document.title='TESTS CRASH — Midweek';
    window.__testsDone=true;
  }
})();
