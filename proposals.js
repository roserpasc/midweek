'use strict';
/* ============================================================
   Midweek — Generador de propostes de menú
   Modes: tradicional · saludable (dieta mediterrània) · ràpid
   Estratègia: cada mode té un sistema de puntuació sobre les
   receptes disponibles; si no n'hi ha prou, proposa àpats
   lliures amb suggeriments del banc d'idees propi del mode.
   ============================================================ */

const PROPOSAL_MODES = {
  tradicional: {
    label: 'Tradicional',
    desc: 'Plats de tota la vida: pa, pasta, arrossos, guisats. Sense restriccions.',
    /* pes de cada tret a l'hora de triar (com més alt, més prioritari) */
    weights: { comfort: 3, quick: 0, veggie: 0, legume: 0, fish: 0, reuse: 1 },
    maxTime: null,
    freeIdeas: {
      esmorzar: ['Café amb llet i torrades', 'Entrepà de pernil i tomàquet', 'Cereals amb llet', 'Magdalena i fruita'],
      dinars: ['Pa amb tomàquet i llom', 'Macarrons amb salsa', 'Espinacs amb cigrons i pa', 'Truita francesa amb amanida', 'Arròs a la cubana'],
      sopars: ['Sopa de pasta', 'Entrepà francès', 'Truita de patata i pa amb tomàquet', 'Formatge i embotit amb pa', 'Crema de verdures i torrada']
    }
  },
  saludable: {
    label: 'Saludable (mediterrània)',
    desc: 'Equilibrat segons la dieta mediterrània: verdura diària, peix 2+ cops, llegums 2+ cops,fruita i fruits secs, oli d\'oliva; menys carn vermella i embotits.',
    weights: { comfort: 0, quick: 0, veggie: 2.5, legume: 2, fish: 2, reuse: 0 },
    maxTime: null,
    /* regles de quota que el generador intentarà complir */
    quotas: { fish: 2, fishMax: 3, legume: 2, redMax: 1, comfortMax: 4, veggieDays: 5 },
    freeIdeas: {
      esmorzar: ['Iogurt grec amb fruita i nous', 'Torrada integral amb alvocat', 'Café, fruita i un grapat de fruits secs', 'Iogurt amb llavors i mel'],
      dinars: ['Amanida completa amb tonyina', 'Arròs integral amb verdures i peix', 'Llenties amb verdures', 'Sopa de verdures amb pollastre', 'Salmon al forn amb amanida'],
      sopars: ['Crema de carbassó i torrades integrals', 'Amanida de tomàquet i formatge fresc', 'Sopa de peix i verdures', 'Truita d\'espècies amb amanida verda', 'Verduretes al vapor amb ou dur']
    }
  },
  rapid: {
    label: 'Ràpid cuinat',
    desc: 'Tot a taula en 20 minuts o menys: poques peces, poques cassoles.',
    weights: { comfort: 0, quick: 4, veggie: 0, legume: 0, fish: 0, reuse: 0.5 },
    maxTime: 20,
    freeIdeas: {
      esmorzar: ['Iogurt i fruita', 'Torrades amb tomàquet', 'Café i galetes integrals', 'Batut de llet i plàtan'],
      dinars: ['Pasta amb tonyina i tomàquet', 'Amanida de llenties de llauna', 'Truita de patata feta a la planxa', 'Wok de verdures i pollastre', 'Quesadillas'],
      sopars: ['Entrepà calent de formatge', 'Crema de verdures de briock', 'Amanida de tomàquet i mozzarella', 'Hamburguesa de verdures al pa', 'Sopa instantània amb ou escalfat']
    }
  }
};

/* detecció de trets d'una recepta (per puntuar-la segons el mode) */
function recipeTraits(r){
  const text=(r.name+' '+r.ingredients.map(i=>i.name).join(' ')).toLowerCase();
  const vegWords=['enciam','tomàquet','ceba','pastanaga','carbass','pebrot','espina','bleda','alvocat','bròquil','col','verdura','amanida','mongeta verda','carbassa','porr','ruca','espinac'];
  const legumeWords=['llenti','cigron','fesol','mongeta','llegum','pèsol','haba','tofu','tempeh'];
  const fishWords=['salmó','tonyina','bacallà','lluç','sardina','gamb','musclo','peix','sípia','pop','truita de mar','anxova','verat','llenguado','rap','merluza','merluça'];
  const redWords=['vedella','porc','xai','carn picada','botifar','embotit','fuet','xoriço','pernil dolç','bacon','llom de porc','costella'];
  const comfortWords=['pasta','espaguet','macarró','arròs','pizza','hamburgues','pa','formatge fundit','embotit','xoriço','patata fregida','croqueta','nugget','carbonara','xocolata'];
  const has=re=>re.test(text);
  return {
    veggie: vegWords.some(w=>text.includes(w))?1:0,
    legume: legumeWords.some(w=>text.includes(w))?1:0,
    fish: fishWords.some(w=>text.includes(w))?1:0,
    redMeat: redWords.some(w=>text.includes(w))?1:0,
    comfort: comfortWords.some(w=>text.includes(w))?1:0,
    quick: (r.time&&r.time<=20)?1:0,
    reuse: /restes|sobrant|amanida d'.*restes|arròs d'ahir/i.test(r.name)?1:0
  };
}


/* emoji orientatiu del plat (segons ingredients) */
function dishEmoji(r){
  if(!r)return '📝';
  const n=(r.name+' '+r.ingredients.map(i=>i.name).join(' ')).toLowerCase();
  const t=recipeTraits(r);
  if(/truita|ou dur|ous batuts|\bou\b/.test(n))return '🍳';
  if(t.fish)return '🐟';
  if(t.legume&&!t.veggie)return '🫘';
  if(/arròs|arros/.test(n))return '🥘';
  if(/pasta|espaguet|macarr|fideu/.test(n))return '🍝';
  if(/amanida|enciam/.test(n))return '🥗';
  if(/sopa|crema/.test(n))return '🍲';
  if(/pollastre|carn|vedella|porc|llom/.test(n))return '🍗';
  if(/iogurt|fruita|mel|nous/.test(n))return '🥣';
  if(/pizza|empanada|coca/.test(n))return '🍕';
  if(/entrepà|entrapa|sandwich|pa /.test(n))return '🥪';
  return t.legume?'🫘':(t.veggie?'🥗':'🍽️');
}

/* genera una proposta de setmana sencera sobre el menú actual */
function generateProposal(modeKey){
  const mode=PROPOSAL_MODES[modeKey];
  if(!mode)return;
  const mon=mondayOf(weekStart);
  const days=[...Array(7)].map((_,i)=>iso(new Date(mon.getTime()+i*86400000)));
  const slots=SLOTS.map(s=>s.id);

  /* 1. pool de receptes puntuades per aquest mode */
  const scored=S.recipes.map(r=>{
    const t=recipeTraits(r);
    let score=0;
    for(const [k,w] of Object.entries(mode.weights)) score+=(t[k]||0)*w;
    if(mode.maxTime&&r.time&&r.time>mode.maxTime) score-=5; /* penalització dura */
    return {r:r,t:t,score:score};
  }).sort((a,b)=>b.score-a.score);

  const usable=scored.filter(x=>x.score>=0);
  const pool=usable.length>=3?usable:scored; /* si cap encaixa bé, fem servir tot */

  /* 2. distribució: dinar = plat principal; sopar = més lleuger */
  const newMenu={};
  const usedCount={}; /* evita repetir la mateixa recepta >2 cops/setmana */
  const counters={fish:0,legume:0,red:0,comfort:0,veggieDays:new Set()};
  const pick=(slot,dayIdx)=>{
    /* candidats ordenats: score + bonus de diversitat */
    const q=mode.quotas;
    const cands=pool.map(x=>{
      let s=x.score;
      const n=usedCount[x.r.id]||0;
      if(n>=3)s-=100;                       /* màxim 3 cops per setmana */
      /* sopar mai igual al dinar del mateix dia (exclusió dura) */
      const lunchArr=newMenu[days[dayIdx]+'|dinars']||[];
      const isLunchTwin=lunchArr.length&&lunchArr[0].recipeId===x.r.id;
      if(slot==='sopars'){
        if(isLunchTwin)return null;
        if(x.t.comfort)s-=1.5;
        if(x.t.veggie||x.t.fish)s+=1;
      }
      if(slot==='dinars'){ if(x.t.legume||x.t.fish)s+=0.5; }
      if(q){
        /* --- Límits d'experts (AESAN/FESNAD/Harvard T.H. Chan): ---
           peix 2-3 cops/setmana (MAI més de 3), llegums >=2/setmana,
           carn vermella/embotit <=1/setmana, plats "comfort" <=4/setmana */
        if(q.fishMax!=null&&x.t.fish&&counters.fish>=q.fishMax)s-=200;
        if(q.redMax!=null&&x.t.redMeat&&counters.red>=q.redMax)s-=200;
        if(q.comfortMax!=null&&x.t.comfort&&counters.comfort>=q.comfortMax)s-=200;
        if(q.fish&&counters.fish<q.fish&&x.t.fish)s+=2.5;      /* encara no n'hi ha prou */
        if(q.legume&&counters.legume<q.legume&&x.t.legume)s+=2.5;
        if(q.veggieDays&&counters.veggieDays.size<q.veggieDays&&x.t.veggie)s+=1.5;
      }
      return {x:x,jitter:Math.random()*0.9,s:s};
    }).map(x=>x||{x:pool[0],jitter:-999,s:-1e9}).sort((a,b)=>(b.s+b.jitter)-(a.s+a.jitter));
    const chosen=cands[0].x;
    usedCount[chosen.r.id]=(usedCount[chosen.r.id]||0)+1;
    if(chosen.t.fish)counters.fish++;
    if(chosen.t.legume)counters.legume++;
    if(chosen.t.redMeat)counters.red++;
    if(chosen.t.comfort)counters.comfort++;
    if(chosen.t.veggie)counters.veggieDays.add(dayIdx);
    return {recipeId:chosen.r.id,diners:S.diners};
  };

  for(let di=0;di<7;di++){
    for(const slot of slots){
      newMenu[days[di]+'|'+slot]=[pick(slot,di)];
    }
  }
  S.menu=newMenu;
  save();renderMenu();markStale();
  showProposalSummary(mode,counters);
}
function setFree(menu,day,slot,note){
  (menu[day+'|'+slot]=menu[day+'|'+slot]||[]).push({recipeId:null,note:note,diners:S.diners});
}
function pickFree(mode,slot){
  const ideas=(mode.freeIdeas&&mode.freeIdeas[slot])||['Àpat lliure'];
  return ideas[Math.floor(Math.random()*ideas.length)];
}

/* resum modal de la proposta generada */
function showProposalSummary(mode,counters){
  const q=mode.quotas;
  let quotaHtml='';
  if(q){
    const fishOk=(counters.fish>=q.fish&&counters.fish<=q.fishMax)?'✅':(counters.fish>q.fishMax?'❌ massa':'⚠️');
    const legOk=counters.legume>=q.legume?'✅':'⚠️';
    const redOk=counters.red<=(q.redMax||9)?'✅':'❌';
    quotaHtml='<div class="ai-banner"><span>🥗</span><div>Comprovació mediterrània (guies AESAN·FESNAD): '
      +'peix <b>'+counters.fish+'/setmana</b> '+fishOk+' (ideal 2-3)'
      +' · llegums <b>'+counters.legume+'</b> '+legOk+' ( mínim 2)'
      +' · carn vermella <b>'+counters.red+'</b> '+redOk+' (màxim 1)'
      +'<br><span class="tiny muted">'+esc(mode.desc)+'</span></div></div>';
  }
  openModal('<h2>✨ Proposta «'+esc(mode.label)+'» generada</h2>'
    +quotaHtml
    +'<p class="muted">S\'ha substituït el menú d\'aquesta setmana ('+fmtDate(weekStart)+'). Pots canviar qualsevol àpat clicant-hi a sobre.</p>'
    +'<div class="modal-foot"><span></span><button class="btn btn-primary" id="propOk">Endavant!</button></div>');
  $('#propOk').onclick=closeModal;
}

/* modal del botó Proposa */
function openProposalModal(){
  openModal('<h2>✨ Proposta de menú</h2>'
    +'<p class="muted">Genera una setmana sencera a partir de les teves '+S.recipes.length+' receptes. Substituirà el menú actual.</p>'
    +Object.entries(PROPOSAL_MODES).map(([k,m])=>
      '<div class="shop-item" style="padding:10px 4px;border-bottom:1px solid #EDF2EE">'
      +'<div style="flex:1"><b>'+esc(m.label)+'</b><div class="muted tiny">'+esc(m.desc)+'</div></div>'
      +'<button class="btn btn-primary btn-sm" data-mode="'+k+'">Genera</button></div>').join('')
    +'<p class="muted tiny" style="margin-top:10px">💡 Com més receptes tinguis guardades, millor seran les propostes. Els àpats lliures (esmorzars de cap de setmana) surten d\'un banc d\'idees de cada mode.</p>');
  $('#modalBox').addEventListener('click',e=>{
    const b=e.target.closest('[data-mode]');
    if(b){closeModal();generateProposal(b.dataset.mode);}
  });
}
$('#proposeBtn').onclick=openProposalModal;
