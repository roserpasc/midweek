# -*- coding: utf-8 -*-
"""Parser v3 FINAL del Corpus de la cuina catalana -> traditional.json
   - índex per tipus de plat: num -> (nom, secció)
   - blocs del cos: ingredients reals separats per "/" i tall abans de xifres
   - filtres: categories principals, >=3 ingredients, sense bàsics ni brutícia OCR
"""
import re, json
from pathlib import Path
from collections import Counter

lines = Path(r"C:\Users\roser\midweek\_corpus_cuina.txt").read_text(encoding="utf-8", errors="ignore").split("\n")
idx_start = next(i for i,l in enumerate(lines) if l.strip()=="ÍNDEX DE RECEPTES PER TIPUS DE PLAT")
idx_end   = next(i for i,l in enumerate(lines) if l.strip()=="ÍNDEX DE PRODUCTES")
SECTIONS = ["AMANIDES I PLATS FREDS","SALSES","VERDURES I ALTRES HORTALISSES","LLEGUMS",
            "PASTES, ARROSSOS I ALTRES CEREALS","BOLETS","CARGOLS","CARNS","POSTRES I DOLÇOS"]
inline = re.compile(r"^(\d{1,4})\s*[—-]?\s*([A-ZÀ-Ú].{3,70})$")
section=None; idx_name={}; num_sec={}
buf_nums=[]; buf_names=[]
def flush_block():
    global buf_nums,buf_names
    if buf_nums and buf_names:
        k=min(len(buf_nums),len(buf_names))
        for j in range(1,k+1):
            n=buf_nums[-j]
            if n not in idx_name: idx_name[n]=buf_names[-j]
            if n not in num_sec:  num_sec[n]=section
    buf_nums=[]; buf_names=[]

for i in range(idx_start+1, idx_end):
    l=lines[i].strip()
    if not l: continue
    if l in SECTIONS:
        flush_block(); section=l; continue
    if not section: continue
    m=inline.match(l)
    if m:
        flush_block()
        n=int(m.group(1))
        if n not in idx_name: idx_name[n]=m.group(2).strip(" —-")
        if n not in num_sec:  num_sec[n]=section
        continue
    if re.fullmatch(r"\d{1,4}",l):
        buf_nums.append(int(l)); continue
    buf_names.append(l)
flush_block()
print("índex:", len(idx_name))

recipe_re = re.compile(r"^(\d{1,4}) ([A-ZÀ-Ú·0-9][A-ZÀ-Ú·''\- 0-9(),]{3,70})$")
blocks={}
i=0
while i<len(lines):
    m=recipe_re.match(lines[i].strip())
    if m:
        num=int(m.group(1))
        if num not in blocks:
            j=i+1; ing=[]
            while j<min(i+90,len(lines)):
                t=lines[j].strip()
                if t.lower().startswith("elaboraci"): break
                if recipe_re.match(t): break
                if t and not re.fullmatch(r"\d{1,4}",t): ing.append(t)
                j+=1
            blocks[num]={"title":m.group(2).strip(),"ing":ing}
    i+=1
print("blocs:", len(blocks))

SKIP={"SALSES","POSTRES I DOLÇOS","BOLETS","CARGOLS"}
FISH=["bacallà","peix","abadejo","lluç","merluza","salmó","tonyina","sardina","sepioia",
      "sípia","llenguado","gambes","muscles","suquet","bullit de peix","caldero","a banda",
      "rossejat","fideuà","fideua","anguila","llissa","arengada","bonítol","llampuga"]
def classify(n, sec):
    n=n.lower()
    if sec=="AMANIDES I PLATS FREDS": return "amanides"
    if sec=="VERDURES I ALTRES HORTALISSES": return "verdures"
    if sec=="LLEGUMS": return "llegums"
    if sec=="PASTES, ARROSSOS I ALTRES CEREALS":
        return "arròs" if any(k in n for k in ["arròs","arros","rossejat","fideu"]) else "pasta i cereals"
    if sec=="CARNS":
        if any(k in n for k in ["pollastre","gall ","gallina","ànec","perdiu","conill","llebre","capó"]): return "aus i conill"
        return "carns"
    if any(k in n for k in FISH): return "peix i marisc"
    if re.match(r"^(ous|ou)\b",n) or "truita" in n: return "ous"
    if "patata" in n or "trumfe" in n: return "patates"
    if "sopa" in n or "escudella" in n or "consom" in n: return "sopes"
    return None

UNIT=r"(kg|gr|l|ml|dl|cl|cullerades|cullerada|culleradeta|cs|ct|talls|rodanxes|llenques|filets|manats|pessics|unitats|dots|dos|trunys|porcions|fulles|grans|llaunes|pot|paquets|caps|peces|plats|llesques|g)"
NUMW={"un":1,"una":1,"dos":2,"dues":2,"tres":3,"quatre":4,"cinc":5,"sis":6,"mitja":0.5}
BASIC={"sal","oli","aigua","pebre","farina","julivert","vinagre","sucre"}
BAD_SUB=["elaboració","variacions","observacions","per a ","persones"]

def clean_title(t, idx_t):
    """títol net: prefereix l'índex (ja en minúscules tipogràfiques), sinó converteix el bloc"""
    s=(idx_t or "").strip(" —-")
    if not s:
        s=t.strip()
        words=s.split(" ")
        out=[]
        for w in words:
            wl=w.lower()
            out.append(wl.capitalize() if (w.upper()==w and len(w)>3 and "'" not in w) else wl)
        s=" ".join(out)
    s=re.sub(r"\s+"," ",s).strip()
    # retalla subtítols "(menú per 6 persones)" etc.
    s=re.sub(r"\(.*?\)","",s)
    for a,b in [(" Amb "," amb "),(" De "," de "),(" Del "," del "),(" D'"," d'"),(" I "," i "),
                (" A La "," a la "),(" Al "," al "),(" En "," en "),(" Amb L'"," amb l'"),
                (" De L'"," de l'"),(" A L'"," a l'"),(" Per L'"," per l'")]:
        s=s.replace(a,b)
    return s[0].upper()+s[1:] if s else s

def parse_ing(chunk):
    chunk=re.sub(r"\(v\.\s*\d+\)","",chunk,flags=re.I)
    chunk=re.sub(r"\s+"," ",chunk).strip(" .,/·-")
    if not chunk or len(chunk)<3: return None
    qty=None; unit=""
    m=re.match(r"^(\d+(?:[.,]\d+)?)\s*("+UNIT+r")?\.?\s+(.*)$",chunk,re.I)
    if m and m.group(3):
        try: qty=float(m.group(1).replace(",","."))
        except: qty=None
        unit=(m.group(2) or "").lower()
        chunk=m.group(3).strip(" .,/")
    else:
        m0=re.match(r"^(\d+(?:[.,]\d+)?)\s+(.+)$",chunk)
        if m0:
            try: qty=float(m0.group(1).replace(",","."))
            except: qty=None
            chunk=m0.group(2).strip(" .,/")
    if qty is None:
        w=chunk.split(" ",1)
        if len(w)==2 and w[0].lower() in NUMW:
            qty=NUMW[w[0].lower()]
            chunk=w[1].strip(" .,/")
    name=chunk.strip()
    if not name or len(name)<3 or len(name)>38: return None
    name=name.replace("QUS","Ous")
    low=name.lower()
    if any(b in low for b in BAD_SUB): return None
    if len(name.split())>5: return None
    cap=name[0].upper()+name[1:]
    return {"qty":qty,"unit":unit,"name":cap}

recipes=[]; seen=set()
for num,blk in sorted(blocks.items()):
    sec=num_sec.get(num)
    if not sec or sec in SKIP: continue
    title=clean_title(blk["title"], idx_name.get(num))
    cat=classify(title+" "+blk["title"], sec)
    if not cat: continue
    raw=" ".join(blk["ing"])
    raw=re.sub(r"\(v\.\s*\d+\)","",raw,flags=re.I)
    chunks=[]
    for big in re.split(r"\s*/\s*",raw):
        chunks += re.split(r"(?<=[a-zà-ú])\s+(?=\d)",big)
    ings=[]
    for c in chunks:
        c=c.strip("/ ,.")
        if c and len(c)>2:
            g=parse_ing(c)
            if g: ings.append(g)
    sn=set(); clean=[]
    for g in ings:
        k=g["name"].lower().rstrip("s")
        if k not in sn and g["name"].lower() not in BASIC:
            sn.add(k); clean.append(g)
    if len(clean)<3: continue
    key=title.lower()
    if key in seen: continue
    seen.add(key)
    T={"ous":15,"amanides":15,"sopes":30,"patates":35,"pasta i cereals":25,
       "arròs":40,"verdures":35,"llegums":50,"peix i marisc":35,"aus i conill":55,"carns":65}
    recipes.append({"name":title,"category":cat,"time":T.get(cat,40),"servings":4,
                    "ingredients":clean[:9],"source":"Corpus nº"+str(num)})

print("receptes útils:",len(recipes))
print(dict(Counter(r["category"] for r in recipes)))
Path(r"C:\Users\roser\midweek\traditional.json").write_text(json.dumps(recipes,ensure_ascii=False,indent=1),encoding="utf-8")

import random
random.seed(11)
pool=[r for r in recipes if r["category"] in ("carns","peix i marisc","llegums","arròs")]
for r in random.sample(pool,min(6,len(pool))):
    print("\n*",r["name"],"|",r["category"])
    for g in r["ingredients"][:5]: print("   -",g["qty"],g["unit"],g["name"])
