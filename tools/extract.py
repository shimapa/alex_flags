"""Build data/scarves.js and copy images from the mirrored footballscarves.narod.ru site.

Run: python3 tools/extract.py
"""
import glob, html, json, os, re, shutil
from collections import Counter

SRC = os.path.expanduser("~/Desktop/footballscarves.narod.ru")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {"photoalbum14.html"}  # "Exchange offer" page: swaps on offer, not part of the collection

# name on source page -> (display name, ISO 3166 numeric for the map, continent, flag stripes)
COUNTRIES = {
    "Albania": ("Albania", "008", "Europe", ["#E41E20", "#1a1a1a"]),
    "Algeria": ("Algeria", "012", "Africa", ["#006233", "#ffffff", "#D21034"]),
    "Angola": ("Angola", "024", "Africa", ["#CC092F", "#1a1a1a"]),
    "Argentina": ("Argentina", "032", "South America", ["#74ACDF", "#ffffff", "#74ACDF"]),
    "Armenia": ("Armenia", "051", "Asia", ["#D90012", "#0033A0", "#F2A800"]),
    "Austria": ("Austria", "040", "Europe", ["#ED2939", "#ffffff", "#ED2939"]),
    "Azerbaijan": ("Azerbaijan", "031", "Asia", ["#0092BC", "#E4002B", "#00AF66"]),
    "Belarus": ("Belarus", "112", "Europe", ["#C8313E", "#C8313E", "#4AA657"]),
    "Belgium": ("Belgium", "056", "Europe", ["#1a1a1a", "#FDDA24", "#EF3340"]),
    "Bolivia": ("Bolivia", "068", "South America", ["#D52B1E", "#F9E300", "#007934"]),
    "Bosnia & Herzegovina": ("Bosnia & Herzegovina", "070", "Europe", ["#002395", "#FECB00", "#002395"]),
    "Brasil": ("Brazil", "076", "South America", ["#009C3B", "#FFDF00", "#002776"]),
    "Bulgaria": ("Bulgaria", "100", "Europe", ["#ffffff", "#00966E", "#D62612"]),
    "Chile": ("Chile", "152", "South America", ["#ffffff", "#0039A6", "#D52B1E"]),
    "Colombia": ("Colombia", "170", "South America", ["#FCD116", "#FCD116", "#003893", "#CE1126"]),
    "Croatia": ("Croatia", "191", "Europe", ["#FF0000", "#ffffff", "#171796"]),
    "Czech Republic": ("Czechia", "203", "Europe", ["#ffffff", "#11457E", "#D7141A"]),
    "Denmark": ("Denmark", "208", "Europe", ["#C8102E", "#ffffff", "#C8102E"]),
    "Ecuador": ("Ecuador", "218", "South America", ["#FFD100", "#FFD100", "#0072CE", "#EF3340"]),
    "Egypt": ("Egypt", "818", "Africa", ["#CE1126", "#ffffff", "#1a1a1a"]),
    "England": ("England", "826", "Europe", ["#ffffff", "#CE1124", "#ffffff"]),
    "Estonia": ("Estonia", "233", "Europe", ["#0072CE", "#1a1a1a", "#ffffff"]),
    "France": ("France", "250", "Europe", ["#0055A4", "#ffffff", "#EF4135"]),
    "Georgia": ("Georgia", "268", "Asia", ["#ffffff", "#FF0000", "#ffffff"]),
    "Germany": ("Germany", "276", "Europe", ["#1a1a1a", "#DD0000", "#FFCE00"]),
    "Greece": ("Greece", "300", "Europe", ["#0D5EAF", "#ffffff", "#0D5EAF", "#ffffff"]),
    "Hungary": ("Hungary", "348", "Europe", ["#CD2A3E", "#ffffff", "#436F4D"]),
    "Israel": ("Israel", "376", "Asia", ["#ffffff", "#0038B8", "#ffffff"]),
    "Italy": ("Italy", "380", "Europe", ["#009246", "#ffffff", "#CE2B37"]),
    "Kazakhstan": ("Kazakhstan", "398", "Asia", ["#00AFCA", "#FEC50C", "#00AFCA"]),
    "Kuwait": ("Kuwait", "414", "Asia", ["#007A3D", "#ffffff", "#CE1126"]),
    "Latvia": ("Latvia", "428", "Europe", ["#9E3039", "#ffffff", "#9E3039"]),
    "Lithuania": ("Lithuania", "440", "Europe", ["#FDB913", "#006A44", "#C1272D"]),
    "Luxembourg": ("Luxembourg", "442", "Europe", ["#EF3340", "#ffffff", "#00A3E0"]),
    "Macedonia": ("North Macedonia", "807", "Europe", ["#D20000", "#FFE600", "#D20000"]),
    "Malta": ("Malta", "470", "Europe", ["#ffffff", "#CF142B"]),
    "Moldova": ("Moldova", "498", "Europe", ["#0046AE", "#FFD200", "#CC092F"]),
    "Montenegro": ("Montenegro", "499", "Europe", ["#C40308", "#D3AE3B", "#C40308"]),
    "Morocco": ("Morocco", "504", "Africa", ["#C1272D", "#006233", "#C1272D"]),
    "The Netherlands": ("Netherlands", "528", "Europe", ["#AE1C28", "#ffffff", "#21468B"]),
    "Northern Ireland": ("Northern Ireland", "826", "Europe", ["#ffffff", "#CC0000", "#ffffff"]),
    "Norway": ("Norway", "578", "Europe", ["#BA0C2F", "#ffffff", "#00205B", "#ffffff", "#BA0C2F"]),
    "Poland": ("Poland", "616", "Europe", ["#ffffff", "#DC143C"]),
    "Portugal": ("Portugal", "620", "Europe", ["#046A38", "#DA291C", "#DA291C"]),
    "Republic of Ireland": ("Ireland", "372", "Europe", ["#169B62", "#ffffff", "#FF883E"]),
    "Romania": ("Romania", "642", "Europe", ["#002B7F", "#FCD116", "#CE1126"]),
    "Russia": ("Russia", "643", "Europe", ["#ffffff", "#0039A6", "#D52B1E"]),
    "Scotland": ("Scotland", "826", "Europe", ["#005EB8", "#ffffff", "#005EB8"]),
    "Serbia": ("Serbia", "688", "Europe", ["#C6363C", "#0C4076", "#ffffff"]),
    "Slovakia": ("Slovakia", "703", "Europe", ["#ffffff", "#0B4EA2", "#EE1C25"]),
    "Slovenia": ("Slovenia", "705", "Europe", ["#ffffff", "#005DA4", "#ED1C24"]),
    "Spain": ("Spain", "724", "Europe", ["#AA151B", "#F1BF00", "#F1BF00", "#AA151B"]),
    "Sweden": ("Sweden", "752", "Europe", ["#006AA7", "#FECC00", "#006AA7"]),
    "Switzerland": ("Switzerland", "756", "Europe", ["#DA291C", "#ffffff", "#DA291C"]),
    "Tunisia": ("Tunisia", "788", "Africa", ["#E70013", "#ffffff", "#E70013"]),
    "Turkey": ("Türkiye", "792", "Asia", ["#E30A17", "#ffffff", "#E30A17"]),
    "Ukraine": ("Ukraine", "804", "Europe", ["#0057B7", "#FFD700"]),
    "Uruguay": ("Uruguay", "858", "South America", ["#ffffff", "#0038A8", "#ffffff", "#0038A8"]),
    "United Arab Emirates": ("UAE", "784", "Asia", ["#00732F", "#ffffff", "#1a1a1a"]),
    "Uzbekistan": ("Uzbekistan", "860", "Asia", ["#0099B5", "#ffffff", "#1EB53A"]),
    "USA": ("USA", "840", "North America", ["#B22234", "#ffffff", "#3C3B6E"]),
    "Wales": ("Wales", "826", "Europe", ["#ffffff", "#00B140"]),
    "Special football scarves": ("Special editions", None, "Special", ["#141414", "#FFD21F", "#141414"]),
}

LI_RE = re.compile(r"<LI>(.*?)(?=<LI>|</OL>|<OL>|$)", re.S | re.I)
A_RE = re.compile(r"""<A([^>]*ONCLICK="window\.open\('([^']+)'[^"]*"[^>]*)>(.*?)</A>""", re.S | re.I)
TITLE_RE = re.compile(r'title="([^"]*)"', re.I)
IMG_RE = re.compile(r"""<img[^>]+src="?([^"\s>]+)""", re.I)


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def classify(note, club):
    n = note.lower()
    how = ("swap" if re.search(r"обмен|объмен", n) else
           "post" if re.search(r"присл|пристал|выслал|отправил|по почте", n) else
           "brought" if re.search(r"привез|привёз", n) else
           "bought" if re.search(r"купил|куплен|приобр|преобр", n) else
           "gift" if re.search(r"подар|помог|достал|из коллекции|передал", n) else
           "unrecorded")
    year = re.search(r"(?<![Нн]а )\b((?:19[89]|20[0-2])\d)\s*(?:г\b|году|г\.)", note)
    site = re.search(r"(?:www\.|https?://)[\w.\-/]+\w", note)
    return {
        "how": how,
        "year": int(year.group(1)) if year else None,
        "official": bool(re.search(r"офиц|оффиц|official", n)),
        "national": bool(re.search(r"national team|сборная", club, re.I)),
        "site": site.group(0) if site else None,
    }


def norm(s):
    return set(re.findall(r"[a-z0-9]+", s.lower().replace("ş", "s").replace("ă", "a").replace("å", "a")))


def latest_updates():
    """(country, club) pairs from the homepage's 'Latest updates' list."""
    t = open(os.path.join(SRC, "index.html"), encoding="utf-8").read()
    t = re.sub(r"(?is)<script.*?</script>", "", t)
    txt = re.sub(r"\s+", " ", clean(t))
    m = re.search(r"Latest updat\w*: uploaded (\d{1,2} [A-Za-z]+ \d{4})(.*?)Counters", txt)
    if not m:
        return None, []
    pairs, country = [], None
    for part in re.split(r"\s*\.{5,}\s*", m.group(2).strip()):
        cap = re.match(r"^([A-Z][A-Z .&']+?)\s*$", part)
        tail = re.match(r"^(.*?)\s+([A-Z][A-Z .&']{2,})$", part)
        if cap:
            country = cap.group(1).strip()
            continue
        if tail:
            pairs.append((country, tail.group(1)))
            country = tail.group(2).strip()
        elif part:
            pairs.append((country, part))
    return m.group(1).strip(), pairs


records = []
for path in sorted(glob.glob(os.path.join(SRC, "*.html"))):
    name = os.path.basename(path)
    if name in SKIP:
        continue
    page = open(path, encoding="utf-8", errors="replace").read()
    h2 = re.search(r"<H2[^>]*>(.*?)</H2>", page, re.S | re.I)
    if not h2 or "<LI>" not in page:
        continue
    src_country = re.sub(r"^Football scarves of\s+", "", clean(h2.group(1)), flags=re.I)
    for li in LI_RE.findall(page):
        a = A_RE.search(li)
        if not a:
            continue
        t = TITLE_RE.search(a.group(1))
        note, photo, club = clean(t.group(1) if t else ""), a.group(2), clean(a.group(3))
        logo = IMG_RE.search(li[a.end():])
        rec = {"srcCountry": src_country, "club": club, "photo": photo,
               "logo": logo.group(1) if logo else None, "note": note}
        rec.update(classify(note, club))
        records.append(rec)

# album order: countries A-Z (special editions last), page order within a country
order = {c: i for i, c in enumerate(sorted(COUNTRIES, key=lambda c: (c.startswith("Special"), COUNTRIES[c][0])))}
records.sort(key=lambda r: order[r["srcCountry"]])  # stable: keeps page order inside a country

updated_on, updates = latest_updates()
os.makedirs(os.path.join(ROOT, "assets", "scarves"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "assets", "logos"), exist_ok=True)
# badges matched on TheSportsDB by tools/fetch_badges.py (optional)
try:
    badges = json.load(open(os.path.join(ROOT, "tools", "badges.json"), encoding="utf-8"))
except (OSError, ValueError):
    badges = {}

scarves = []
for i, r in enumerate(records, 1):
    display, iso, continent, flag = COUNTRIES[r["srcCountry"]]
    is_new = any(
        (uc is None or uc.lower() in (r["srcCountry"].lower(), display.lower()) or uc.lower() in r["srcCountry"].lower())
        and norm(club) and norm(club) <= norm(r["club"] + " " + r["photo"].replace("-", " "))
        for uc, club in updates)
    shutil.copy2(os.path.join(SRC, r["photo"]), os.path.join(ROOT, "assets", "scarves", r["photo"]))
    if r["logo"] and os.path.exists(os.path.join(SRC, r["logo"])):
        shutil.copy2(os.path.join(SRC, r["logo"]), os.path.join(ROOT, "assets", "logos", r["logo"]))
    scarves.append({
        "n": i, "club": r["club"], "country": display, "continent": continent,
        "photo": "assets/scarves/" + r["photo"], "logo": "assets/logos/" + r["logo"] if r["logo"] else None,
        "note": r["note"], "how": r["how"], "year": r["year"], "official": r["official"],
        "national": r["national"], "site": r["site"], "new": is_new,
    })
    match = badges.get(f"{display}|{r['club']}") or {}
    if match.get("badge") and os.path.exists(os.path.join(ROOT, match["badge"])):
        scarves[-1]["badge"] = match["badge"]
        if re.search(r"[\u0400-\u04ff]", r["club"]):
            scarves[-1]["clubEn"] = match["team"]

countries = {}
for disp, iso, cont, flag in COUNTRIES.values():
    countries[disp] = {"iso": iso, "continent": cont, "flag": flag}

meta = {"updatedOn": updated_on, "extractedOn": "2026-09-13",
        "source": "https://footballscarves.narod.ru", "owner": "Alex, Moscow", "since": 2003}
with open(os.path.join(ROOT, "data", "scarves.js"), "w", encoding="utf-8") as f:
    f.write("// Generated by tools/extract.py - do not edit by hand.\n")
    f.write("window.ALBUM = " + json.dumps({"meta": meta, "countries": countries, "scarves": scarves},
                                            ensure_ascii=False, separators=(",", ":")) + ";\n")

print(len(scarves), "scarves;", len({s["country"] for s in scarves}), "countries")
print(Counter(s["how"] for s in scarves))
print("dated", sum(1 for s in scarves if s["year"]), Counter(s["year"] for s in scarves).most_common(8))
print("official", sum(s["official"] for s in scarves), "national", sum(s["national"] for s in scarves))
print("badges", sum(1 for s in scarves if s.get("badge")))
print("new", sum(s["new"] for s in scarves), "of", len(updates), "listed; updated", updated_on)
