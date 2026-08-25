# -*- coding: utf-8 -*-
"""Parser EPUB Arguiñano 'La cocina de tu vida' (950 receptes)
   -> arguinano.json + imatges a images/arg/
   Categories per capítol; ingredients amb quantitat; passos; consell; foto."""
import zipfile, re, json, pathlib
from pathlib import Path
from collections import Counter

EPUB = r"C:\Users\roser\midweek\.hermes\desktop-attachments\dokumen.pub_la-cocina-de-tu-vida-950-recetas-faciles-rapidas-y-saludables-9788408250012.epub"
OUT = Path(r"C:\Users\roser\midweek\arguinano.json")
IMG_DIR = Path(r"C:\Users\roser\midweek\images\arg")
IMG_DIR.mkdir(parents=True, exist_ok=True)

CHAPTERS = {
 "c01":"Salses","c02":"Amanides","c03":"Verdures","c04":"Llegums",
 "c05":"Arròs i pasta",   # arrossos
 "c06":"Arròs i pasta",   # pastes, canelones, fideuà
 "c07":"Ous","c08":"Carns","c09":"Peix i marisc","c10":"Postres i dolços"
}
BASIC={"sal","aceite","agua","perejil","pimienta","vinagre"}

z = zipfile.ZipFile(EPUB)
def clean(s):
    s=re.sub(r"<[^>]+>","",s)
    s=s.replace("\xa0"," ").replace("&#8217;","’").replace("&amp;","&")
    return re.sub(r"\s+"," ",s).strip()

recipes=[]
img_count=0
for ch in CHAPTERS:
    h=z.read(f"OEBPS/text/{ch}.xhtml").decode("utf-8",errors="replace")
    # iterar blocs div.recipe
    for m in re.finditer(r'<div class="recipe" id="([^"]+)">(.*?)(?=<div class="recipe" id=|\Z)', h, re.S):
        rid, body = m.group(1), m.group(2)
        mt=re.search(r'<p class="title">(.*?)</p>', body, re.S)
        if not mt: continue
        title=clean(mt.group(1)).title()
        ms=re.search(r'<span class="scope">\((\d+)\s*P\.?\)</span>', body)
        servings=int(ms.group(1)) if ms else 4
        ings=[clean(li) for li in re.findall(r'<li>(.*?)</li>', body, re.S)]
        ings=[i for i in ings if i and len(i)<70]
        steps=[clean(p) for p in re.findall(r'<p class="step">(.*?)</p>', body, re.S)]
        advice_m=re.search(r'<div class="advice">.*?<b>[^<]*</b>\s*(.*?)</p>', body, re.S)
        consejo=clean(advice_m.group(1)) if advice_m else None
        img_m=re.search(r'<div class="figure">\s*<img[^>]*src="\.\./images/([^"]+)"', body)
        img_local=None
        if img_m:
            src=img_m.group(1)
            try:
                data=z.read(f"OEBPS/images/{src}")
                ext=pathlib.Path(src).suffix.lower() or ".jpg"
                slug=re.sub(r"[^a-z0-9\-]","-",title.lower())[:50].strip("-")
                dest=IMG_DIR/f"{slug}{ext}"
                dest.write_bytes(data); img_count+=1
                img_local=f"images/arg/{dest.name}"
            except KeyError:
                pass
        recipes.append({
            "name":title,"category":CHAPTERS[ch],"time":None,"servings":servings,
            "ingredients":[{"name":i,"qty":None,"unit":""} for i in ings[:14]],
            "steps":steps[:14],
            "advice":consejo,
            "image":img_local,
            "source":"Arguiñano · La cocina de tu vida"
        })

print("receptes:",len(recipes))
print(dict(Counter(r["category"] for r in recipes)))
print("amb imatge:",img_count)
with_steps=sum(1 for r in recipes if len(r["steps"])>=2)
with_serv=sum(1 for r in recipes if r["servings"])
print(f"amb passos:{with_steps} | amb racions:{with_serv}")
OUT.write_text(json.dumps(recipes,ensure_ascii=False,indent=1),encoding="utf-8")

import random
random.seed(9)
for r in random.sample(recipes,3):
    print("\n*",r["name"],"|",r["category"],"| racions:",r["servings"])
    print("   ings:",[i["name"] for i in r["ingredients"][:4]])
    print("   pas1:",r["steps"][0][:90] if r["steps"] else "-")
    print("   img:",r["image"])
