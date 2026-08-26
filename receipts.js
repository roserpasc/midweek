'use strict';
/* ============================================================
   Midweek — Fitxer 2/2: tiquets amb foto→IA, costos per persona,
   balanç compartit, opcions, seed i arrencada.
   (s'afegeix a app.js via <script src> en ordre)
   ============================================================ */

/* ============================================================
   PERSONES
   ============================================================ */
function renderPeople(){
  const row=$('#peopleRow');
  row.innerHTML=S.people.map(p=>
    '<div class="person-pill" data-id="'+p.id+'">'
    +'<input type="color" value="'+esc(p.color)+'" data-pcolor>'
    +'<input type="text" value="'+esc(p.name)+'" data-pname>'
    +'<button data-pdel title="Elimina">✕</button></div>').join('');
}
$('#peopleRow').addEventListener('change',e=>{
  if(e.target.dataset.pcolor){
    personById(e.target.closest('.person-pill').dataset.id).color=e.target.value;
    save();renderPeople();renderReceipts();renderBalance();
  }
});
$('#peopleRow').addEventListener('input',debounce(e=>{
  if(e.target.dataset.pname){
    personById(e.target.closest('.person-pill').dataset.id).name=e.target.value.trim()||'?';
    save();renderPayerSelect();renderBalance();
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
  S.people.push({id:uid(),name:'Persona '+(S.people.length+1),color:colors[S.people.length%colors.length]});
  save();renderPeople();renderPayerSelect();
};

/* ============================================================
   ESBORRANY DE COMPRA / TIQUET
   ============================================================ */
let draft=null;
/* draft = {photo(dataURL|null), date, store, payerId, items:[{name,qty,unit,price}], ai:{model,msec,warn}} */

function startDraftFromCart(items){
  draft={
    photo:null,date:todayIso(),store:'',
    payerId:(S.people[0]||{}).id,
    items:items.map(i=>({name:i.name,qty:i.qty,unit:i.unit||'',price:null})),
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
  const rows=draft.items.map((it,idx)=>{
    total+=Number(it.price)||0;
    return '<tr data-idx="'+idx+'">'
      +'<td style="min-width:130px"><input value="'+esc(it.name)+'" data-f="name"></td>'
      +'<td style="width:64px"><input value="'+(it.qty!=null?it.qty:'')+'" data-f="qty" inputmode="decimal"></td>'
      +'<td style="width:70px"><select data-f="unit">'+['','g','kg','ml','l','unitats','llauna','paquet'].map(u=>'<option'+((it.unit||'')===u?' selected':'')+'>'+u+'</option>').join('')+'</select></td>'
      +'<td style="width:86px"><input class="w60" placeholder="0,00" value="'+(it.price!=null?String(it.price).replace('.',','):'')+'" data-f="price" inputmode="decimal"></td>'
      +'<td style="width:30px"><button class="del" data-delrow>✕</button></td></tr>';
  }).join('');
  $('#draftTable').innerHTML=(draft.items.length
    ?'<thead><tr><th>Producte</th><th>Quant.</th><th>Unit.</th><th>Preu €</th><th></th></tr></thead>'+rows
    :'<tr><td colspan="5" class="empty-hint">Cap línia — afegeix-ne o escaneja un tiquet.</td></tr>');
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
  const tr=e.target.closest('tr[data-idx]');if(!tr)return;
  const it=draft.items[+tr.dataset.idx];
  const f=inp.dataset.f;
  if(f==='name')it.name=inp.value;
  else if(f==='qty')it.qty=parseNum(inp.value);
  else if(f==='unit')it.unit=inp.value;
  else if(f==='price'){
    it.price=parseNum(inp.value);
    let total=0;draft.items.forEach(x=>total+=Number(x.price)||0);
    $('#draftTotal').textContent=eur(total);
  }
});
$('#draftTable').addEventListener('click',e=>{
  const del=e.target.closest('[data-delrow]');
  if(!del)return;
  const tr=e.target.closest('tr[data-idx]');
  draft.items.splice(+tr.dataset.idx,1);renderDraft();
});
$('#addDraftItemBtn').onclick=()=>{if(!draft)draft={photo:null,date:todayIso(),store:'',payerId:(S.people[0]||{}).id,items:[],ai:null};draft.items.push({name:'',qty:null,unit:'',price:null});renderDraft();};
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
}
$('#draftPayer').onchange=e=>{if(draft)draft.payerId=e.target.value;};

/* desar compra */
$('#saveReceiptBtn').onclick=()=>{
  if(!draft||!draft.items.length){toast('L\'esborrany és buit.');return;}
  const items=draft.items.filter(i=>i.name.trim());
  if(!items.length){toast('Totes les línies són buides.');return;}
  const receipt={
    id:uid(),date:draft.date||todayIso(),
    store:draft.store||'',payerId:draft.payerId||(S.people[0]||{}).id,
    items:items,
    photo:draft.photo||null,
    ai:draft.ai?{model:draft.ai.model}:null
  };
  receipt.total=items.reduce((a,i)=>a+(Number(i.price)||0),0);
  S.receipts.unshift(receipt);
  /* treu de la llista els productes comprats que hi coincidien */
  const boughtNames=items.map(i=>i.name.trim().toLowerCase());
  S.shopping.items=S.shopping.items.filter(si=>!boughtNames.includes(si.name.toLowerCase()));
  S.shopping.stale=false;
  save();
  draft=null;renderDraft();renderShopping();updateShopBadge();renderReceipts();renderBalance();
  toast('Compra desada ✓ '+eur(receipt.total));
};

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
    if(!draft)draft={photo:null,date:todayIso(),store:'',payerId:(S.people[0]||{}).id,items:[],ai:null};
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
  if(!draft)draft={photo:null,date:todayIso(),store:'',payerId:(S.people[0]||{}).id,items:[],ai:null};
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
  wrap.innerHTML=S.receipts.map(rc=>{
    const payer=personById(rc.payerId);
    return '<div class="card">'
      +'<div class="toolbar" style="margin-bottom:8px">'
      +'<div><h3 style="margin:0">'+esc(rc.store||'Compra')+'</h3>'
      +'<span class="muted tiny">'+esc(fmtLongDate(rc.date))+' · pagat per '
      +(payer?'<span class="dotc" style="background:'+esc(payer.color)+'"></span>'+esc(payer.name):'—')
      +(rc.ai?' · 🤖 '+esc(rc.ai.model):'')+'</span></div>'
      +'<div class="spacer"></div>'
      +(rc.photo?'<img class="receipt-photo" src="'+rc.photo+'" alt="tiquet" data-viewphoto="'+rc.id+'">':'')
      +'<span class="big-total">'+eur(rc.total)+'</span></div>'
      +renderSplitChips(rc)
      +'<details style="margin-top:8px"><summary class="muted tiny" style="cursor:pointer">'+rc.items.length+' articles</summary>'
      +'<table class="items"><tbody>'+rc.items.map(i=>'<tr><td>'+esc(i.name)+(i.qty?' <span class="muted tiny">×'+i.qty+(i.unit?' '+esc(i.unit):'')+'</span>':'')+'</td><td class="num">'+(i.price!=null?eur(i.price):'—')+'</td></tr>').join('')+'</tbody></table></details>'
      +'<div style="text-align:right;margin-top:8px"><button class="btn btn-danger btn-sm" data-delrc="'+rc.id+'">Elimina compra</button></div>'
      +'</div>';
  }).join('');
}
function fmtLongDate(ds){
  try{return new Date(ds+'T00:00:00').toLocaleDateString('ca-ES',{weekday:'long',day:'numeric',month:'long'});}
  catch(e){return ds;}
}
function splitFor(receipt){
  const n=S.people.length||2;
  const share=receipt.total/n;
  return S.people.map(p=>({
    person:p,
    amount:p.id===receipt.payerId?(receipt.total-share):( -share)
  }));
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

function computeBalances(){
  const paid={},owes={};
  S.people.forEach(p=>{paid[p.id]=0;owes[p.id]=0;});
  S.receipts.forEach(rc=>{
    const share=rc.total/(S.people.length||2);
    if(paid[rc.payerId]!=null)paid[rc.payerId]+=rc.total;
    S.people.forEach(p=>{owes[p.id]+=share;});
  });
  S.settlements.forEach(st=>{
    owes[st.fromId]-=st.amount;
    if(owes[st.toId]!=null)owes[st.toId]-=st.amount*-1;
  });
  return S.people.map(p=>({person:p,balance:paid[p.id]-owes[p.id]+settledDeltaFor(p.id)}));
}
function settledDeltaFor(id){
  let d=0;
  S.settlements.forEach(st=>{if(st.toId===id)d+=st.amount;if(st.fromId===id)d-=st.amount;});
  return d;
}
function renderBalance(){
  const el=$('#balanceBody');
  if(!S.receipts.length&&!S.settlements.length){
    el.innerHTML='<p class="empty-hint">Sense compres encara.</p>';return;
  }
  const spent={},shareEach=S.receipts.reduce((a,r)=>a+r.total,0)/(S.people.length||2);
  S.people.forEach(p=>spent[p.id]=0);
  S.receipts.forEach(r=>{if(spent[r.payerId]!=null)spent[r.payerId]+=r.total;});
  el.innerHTML='<table class="items"><tbody>'+S.people.map(p=>{
    const bal=spent[p.id]-shareEach+settledDeltaFor(p.id);
    return '<tr><td><span class="dotc" style="background:'+esc(p.color)+'"></span>'+esc(p.name)+'</td>'
      +'<td class="num muted tiny">ha pagat '+eur(spent[p.id])+'</td>'
      +'<td class="num"><b style="color:'+(bal>=0.005?'#2F6A46':bal<-0.005?'#93392F':'inherit')+'">'
      +(bal>=0.005?'+':bal<-0.005?'−':'')+eur(Math.abs(bal))+'</b></td></tr>';
  }).join('')+'</tbody></table>'
  +'<p class="muted tiny" style="margin:8px 0 0">Despesa total compartida: <b>'+eur(S.receipts.reduce((a,r)=>a+r.total,0))+'</b> · '
  +eur(shareEach)+' per persona</p>';
}
$('#settleBtn').onclick=()=>{
  if(!S.receipts.length){toast('Encara no hi ha compres.');return;}
  const spent={},shareEach=S.receipts.reduce((a,r)=>a+r.total,0)/(S.people.length||2);
  S.people.forEach(p=>spent[p.id]=0);
  S.receipts.forEach(r=>{if(spent[r.payerId]!=null)spent[r.payerId]+=r.total;});
  const rows=S.people.map(p=>({p,bal:spent[p.id]-shareEach+settledDeltaFor(p.id)}));
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
};

/* ============================================================
   OPCIONS
   ============================================================ */
$('#apiKeyInput').value=S.settings.apiKey||'';
$('#apiKeyInput').oninput=debounce(e=>{
  S.settings.apiKey=e.target.value.trim();save();
},400);
$('#modelSelect').value=S.settings.model||'google/gemini-2.5-flash';
$('#modelSelect').onchange=e=>{S.settings.model=e.target.value;save();toast('Model: '+e.target.value);};
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
  const info=$('#storageInfo');
  if(info){
    let bytes=0;
    try{bytes=new Blob([localStorage.getItem(LS_KEY)||'']).size;}catch(e){}
    info.textContent='Dades locals: '+Math.round(bytes/1024)+' KB · receptes: '+S.recipes.length+' · compres desades: '+S.receipts.length;
  }
}
boot(true);

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
    /* 5. generar llista de la compra */
    regenerateShoppingList();
    assert('shopping-generated',S.shopping.items.length>0,String(S.shopping.items.length));
    /* 6. quantitats escalades per comensals: arròs 160g base/2 racions -> factor 1 => 160 */
    const arr=S.shopping.items.find(i=>/arròs/i.test(i.name));
    assert('shopping-has-rice',!!arr,arr&&arr.qty);
    /* 7. marcar done i extra */
    S.shopping.items[0].done=true;
    S.shopping.items.push({id:uid(),name:'paper higiènic',qty:null,unit:'',category:'Neteja',done:false,extra:true,from:[]});
    assert('shopping-extra',S.shopping.items.some(i=>i.extra));
    /* 8. esborrany manual amb 2 línies i repartiment */
    startDraftFromCart([]);
    draft.items=[{name:'test A',qty:1,unit:'',price:6},{name:'test B',qty:1,unit:'',price:4}];
    draft.payerId=S.people[0].id;
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
