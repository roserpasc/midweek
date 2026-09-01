const CACHE="midweek-v27";
const ASSETS=["./index.html","./styles.css","./app.js","./receipts.js","./proposals.js","./traditional-bank.js","./manifest.json",
  "./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable.png","./icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin)return; /* API externes (GitHub/OpenRouter) -> xarxa directa */
  /* Navegació: network-first amb fallback al cache */
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match("./index.html")));
    return;
  }
  /* JS/CSS: NETWORK-FIRST — evita servir codi vell després d'un desplegament */
  if(e.request.destination==="script"||e.request.destination==="style"){
    e.respondWith(fetch(e.request).then(r=>{
      if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}
      return r;
    }).catch(()=>caches.match(e.request)));
    return;
  }
  /* Imatges i altres: cache-first (canvien poc) */
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r})));
});
