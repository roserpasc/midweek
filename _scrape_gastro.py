# -*- coding: utf-8 -*-
"""Scraper de gastroteca.cat/receptes via AJAX veure_mes
   -> gastroteca.json (receptes amb ingredients, passos, imatge, vídeo YouTube)
"""
import urllib.request, urllib.parse, json, re, html as H
from pathlib import Path
import time

OUT = Path(r"C:\Users\roser\midweek\gastroteca.json")
UA = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
AJAX = "https://www.gastroteca.cat/wp-admin/admin-ajax.php"

def post(params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(AJAX, data=data, headers={**UA,"Content-Type":"application/x-www-form-urlencoded"})
    return json.loads(urllib.request.urlopen(req, timeout=90).read().decode("utf-8", errors="replace"))

def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=90).read().decode("utf-8", errors="replace")

# ---------- 1. llistar totes les receptes (pàgines de 12) ----------
links = {}
page = 1
while page < 200:
    r = post({"post_type":"recipe","action":"veure_mes","post_status":"publish","numberposts":"12",
              "s":"","tax_query":"[]","meta_query":'[{"relation":"AND"}]',"template-part":"content-recipe",
              "posts_per_page":"12","page":str(page),"has_map":"","has_map_all":""})
    html = r.get("data",{}).get("html","") if isinstance(r.get("data"),dict) else ""
    found = re.findall(r'href="(https://www\.gastroteca\.cat/receptes/[a-z0-9\-]+/)"', html)
    titles = re.findall(r'<h3>([^<]+)</h3>', html)
    new = 0
    for i,l in enumerate(found):
        if l not in links:
            links[l] = H.unescape(titles[i]) if i < len(titles) else ""
            new += 1
    print(f"pàg {page}: {len(found)} trobades, {new} noves (total {len(links)})")
    if new == 0 or not found:
        break
    page += 1
    time.sleep(0.4)

print("TOTAL receptes detectades:", len(links))

# ---------- 2. scrapejar cada recepta ----------
CAT_MAP = {
 "arrossos-i-pastes":"Arròs i pasta","llegums":"Llegums","carns":"Carns",
 "peixos-i-mariscs":"Peix i marisc","verdures":"Verdures",
 "receptes-amanides-i-plats-freds":"Amanides","sopes-i-cremes":"Sopes",
 "postres-i-dolcos":"Postres i dolços","bolets-i-cargols":"Bolets i cargols",
 "salses":"Salses"
}
def map_cat(href):
    for slug,name in CAT_MAP.items():
        if "/tipus-de-recepta/"+slug in href: return name
    return "Altres"

def clean(s):
    s = re.sub(r"<[^>]+>","",s)
    return H.unescape(s).replace("\xa0"," ").strip()

recipes=[]
for n,(url,title) in enumerate(sorted(links.items())):
    try:
        h = get(url)
    except Exception as e:
        print("ERR get", url, e); continue
    rec = {"name":title or "","url":url,"source":"Gastroteca","category":"Altres",
           "image":None,"youtube":None,"ingredients":[],"steps":[],"servings":4}
    # imatge principal
    m = re.search(r'<meta property="og:image" content="([^"]+)"', h)
    if m: rec["image"] = m.group(1)
    # categories via enllaç tipus-de-recepta
    mcats = re.findall(r'href="https://www\.gastroteca\.cat/receptes/tipus-de-recepta/([a-z\-]+)/?"', h)
    for c in mcats:
        nm = CAT_MAP.get(c)
        if nm and nm!="Altres" and not (nm=="Postres i dolços" and rec["category"]!="Altres"):
            rec["category"]=nm; break
        if c=="postres-i-dolcos":
            rec["category"]="Postres i dolços"; rec["_skip"]=True
    if rec.get("_skip"):
        continue
    # títol real si faltava
    if not rec["name"]:
        mt = re.search(r'<h1[^>]*>([^<]+)</h1>', h)
        if mt: rec["name"]=clean(mt.group(1))
    # vídeo youtube
    myt = re.search(r'(?:youtube\.com/(?:embed|watch\?v=)|youtu\.be/)([\w\-]{11})', h)
    if myt:
        rec["youtube"]="https://www.youtube.com/watch?v="+myt.group(1)
    else:
        # iframe lazy del tema
        mi = re.search(r'data-src="https://www\.youtube\.com/embed/([\w\-]{11})', h)
        if mi: rec["youtube"]="https://www.youtube.com/watch?v="+mi.group(1)
    # ingredients: llistes <li> a la secció d'ingredients
    ing_zone = re.search(r'(?is)(ingredients|el que hi has).{0,4000}?</ul>', h)
    pool = []
    for mm in re.finditer(r'(?is)<ul[^>]*>(.*?)</ul>', h):
        ul = mm.group(1)
        items = [clean(li) for li in re.findall(r'<li[^>]*>(.*?)</li>', ul, re.S)]
        items = [i for i in items if 2 < len(i) < 60]
        if len(items) >= 3:
            pool.append(items)
    if pool:
        # la llista amb més ítems curts sol ser la d'ingredients
        best = max(pool, key=len)
        # descarta llistes que semblen passos (contenen verbs al principi com "Talla", "Afegiu")
        looks_steps = sum(1 for i in best if re.match(r'^(Talla|Talleu|Afeg|Cou|Freg|Remena|Barreja|Prepa|Escal|Poseu|Incorpora|Serviu|Deixeu|Coeu)', i)) > len(best)/2
        if not looks_steps:
            rec["ingredients"]=[{"name":i,"qty":None,"unit":""} for i in best[:15]]
    # passos: paràgrafs numerats o llista després de "Elaboració"/"Preparació"
    elab = re.search(r'(?is)(elaboraci[oó]|preparaci[oó]|passos a seguir)(.{0,9000}?)(</section>|class="(related|footer)|<footer)', h)
    zone = elab.group(2) if elab else h
    steps=[]
    for li in re.finditer(r'(?is)<li[^>]*>(.*?)</li>', zone):
        t = clean(li.group(1))
        if 15 < len(t) < 400: steps.append(t)
    if len(steps) < 2:
        steps=[]
        for p in re.finditer(r'(?is)<p[^>]*>(.*?)</p>', zone):
            t = clean(p.group(1))
            if 30 < len(t) < 500: steps.append(t)
    rec["steps"]=steps[:14]
    if rec["name"] and rec["ingredients"]:
        recipes.append(rec)
    time.sleep(0.35)

print("receptes completes:", len(recipes))
OUT.write_text(json.dumps(recipes, ensure_ascii=False, indent=1), encoding="utf-8")
print("desat:", OUT)
