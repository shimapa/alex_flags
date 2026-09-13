"""Match every club / national team to TheSportsDB and download its badge.

Run: python3 tools/fetch_badges.py   (resumable; responses cached in tools/.sportsdb-cache.json)
Writes tools/badges.json and assets/badges/*.png, then re-run tools/extract.py to merge them.

Matching is deliberately strict: the team must play in the same country and every distinctive
word of our club name must appear in the team's name or its alternate names (Latin or Cyrillic).
Anything that does not pass keeps the logo from the original site.
"""
import json, os, re, subprocess, sys, time, unicodedata, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_PATH = os.path.join(ROOT, "tools", ".sportsdb-cache.json")
OUT_PATH = os.path.join(ROOT, "tools", "badges.json")
BADGE_DIR = os.path.join(ROOT, "assets", "badges")
API = "https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t="
DELAY = 2.2  # the free key allows about 30 lookups a minute

# how TheSportsDB spells the countries whose display name differs
COUNTRY_ALIASES = {
    "Czechia": {"czech republic", "czechia"}, "Netherlands": {"netherlands", "holland"},
    "Türkiye": {"turkey", "turkiye"}, "North Macedonia": {"north macedonia", "macedonia", "fyr macedonia"},
    "Ireland": {"republic of ireland", "ireland"}, "UAE": {"united arab emirates", "uae"},
    "USA": {"usa", "united states"}, "Bosnia & Herzegovina": {"bosnia and herzegovina", "bosnia-herzegovina"},
    "Moldova": {"moldova"}, "Russia": {"russia"}, "Brazil": {"brazil"},
}
# national teams whose badge query differs from the country label
NATIONAL_QUERY = {"Czechia": "Czech Republic", "Türkiye": "Turkey", "UAE": "United Arab Emirates", "USA": "USA",
                  "Ireland": "Republic of Ireland", "Bosnia & Herzegovina": "Bosnia and Herzegovina"}

GENERIC = set("""fc fk cf sc ac ad cd ud gd sd rcd rc cs csd ca ce ec afc bk if ik jk ks sk nk hnk tj mfk mks kv kvc krc
club clube klub klubi atletico athletic sporting sport sports football futbol futebol calcio de la le los das do da del di
the and of team national city united town fussball verein sv tsv vfl vfb ssv spvgg us as ss asd ssd sad ksk fsv ofk pfk
ultras""".split())
GENERIC_RU = set("фк пфк мфк футбольный клуб сборная национальная команда спортивный ск".split())


def fold(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c)).replace("ё", "е")


def tokens(s, drop_generic=True):
    toks = re.findall(r"[a-z0-9]+|[а-я0-9]+", fold(re.sub(r"\(.*?\)", " ", s)))
    if drop_generic:
        toks = [t for t in toks if t not in GENERIC and t not in GENERIC_RU and not re.fullmatch(r"\d{1,2}", t)]
    return toks


def load_cache():
    try:
        return json.load(open(CACHE_PATH, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


cache = load_cache()


def search(q):
    q = q.strip()
    if not q:
        return []
    if q in cache:
        return cache[q]
    for attempt in range(4):
        r = subprocess.run(["curl", "-sfL", "--max-time", "30", API + urllib.parse.quote(q)], capture_output=True, text=True)
        time.sleep(DELAY)
        if r.returncode == 0:
            try:
                teams = json.loads(r.stdout).get("teams") or []
            except ValueError:
                teams = []
            teams = [{k: t.get(k) for k in ("idTeam", "strTeam", "strTeamAlternate", "strCountry", "strSport", "strBadge", "strGender")}
                     for t in teams if t.get("strSport") == "Soccer"]
            cache[q] = teams
            if len(cache) % 10 == 0:
                json.dump(cache, open(CACHE_PATH, "w", encoding="utf-8"), ensure_ascii=False)
            return teams
        time.sleep(15 * (attempt + 1))  # rate limited or network blip
    return []


def country_ok(team, country):
    have = re.sub(r"^the ", "", fold(team.get("strCountry") or ""))
    return have in COUNTRY_ALIASES.get(country, {fold(country)})


RESERVE = re.compile(r"(\s(B|C|II|III)$)|\bU-?\d{2}\b|\b(Reserves?|Youth|Women|Ladies|Academy|Primavera|Futsal|Beach|Handball|Basketball|NXT|Fabril|SL16|Jong)\b", re.I)


def is_first_team(team):
    return not RESERVE.search(team.get("strTeam") or "") and (team.get("strGender") or "Male") != "Female"


def names_of(team):
    alts = [a.strip() for a in (team.get("strTeamAlternate") or "").split(",") if a.strip()]
    return [team["strTeam"]] + alts


TRANSLIT = dict(zip("абвгдезийклмнопрстуфыэ", "abvgdeziyklmnoprstufye"))
TRANSLIT.update({"ж": "zh", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch", "ю": "yu", "я": "ya", "ъ": "", "ь": "",
                 "і": "i", "ї": "yi", "є": "ye", "ґ": "g", "ў": "u"})
# local and English spellings of the same place or word, folded to one form
CANON = {"wien": "vienna", "praha": "prague", "moskva": "moscow", "tirane": "tirana", "baki": "baku", "kiev": "kyiv",
         "bucuresti": "bucharest", "beograd": "belgrade", "lisboa": "lisbon", "warszawa": "warsaw", "munchen": "munich",
         "koln": "cologne", "dinamo": "dynamo", "dnipropetrovsk": "dnipro", "kharkov": "kharkiv", "lvov": "lviv",
         "odessa": "odesa", "kishinev": "chisinau", "peterburg": "petersburg", "sankt": "saint", "zhemchuzhina": "zhemchuzhina",
         "shakhter": "shakhtyor", "shakhtar": "shakhtyor", "lokomotiv": "lokomotiv", "lokomotive": "lokomotiv",
         "torpedo": "torpedo", "yerevan": "yerevan", "erevan": "yerevan", "tbilisi": "tbilisi", "gdansk": "gdansk",
         "independente": "independiente", "angi": "anzhi", "anji": "anzhi", "mahachkala": "makhachkala"}


def latin(s):
    return "".join(TRANSLIT.get(c, c) for c in fold(s))


def ctokens(s):
    """Distinctive tokens, transliterated and folded to canonical spellings."""
    return [CANON.get(t, t) for t in tokens(latin(s))]


def same(a, b):
    if a == b:
        return True
    if min(len(a), len(b)) < 5:
        return False
    import difflib
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def covered(mine, theirs):
    return all(any(same(m, t) for t in theirs) for m in mine)


def match(club, slug, country, national):
    """Return (team, query) or (None, None)."""
    if national:
        q = NATIONAL_QUERY.get(country, country)
        want = set(ctokens(q.replace("&", " and ")))
        for query in dict.fromkeys([q, q.replace("&", "and"), q.split()[0]]):
            for t in search(query):
                if is_first_team(t) and set(ctokens(t["strTeam"].replace("&", " and ").replace("-", " "))) == want:
                    return t, query
        return None, None

    ours = ctokens(club)
    if not ours:
        ours = ctokens(slug)
    if not ours:
        return None, None
    plain = re.sub(r"\(.*?\)", "", club).strip()
    raw = tokens(latin(club)) or tokens(slug)  # as spelled, before canonical folding ("dinamo", not "dynamo")
    queries = list(dict.fromkeys(q for q in [
        " ".join(raw[:2]),
        " ".join(ours[:2]),
        raw[0] if len(raw[0]) >= 4 else "",
        plain if not re.search(r"[а-яё]", plain.lower()) else "",
        " ".join(tokens(slug)[:2]),
    ] if q))[:5]

    for q in queries:
        best = None
        for t in search(q):
            if not country_ok(t, country) or not is_first_team(t):
                continue
            cand = set()
            for name in names_of(t):
                cand |= set(ctokens(name))
            core = ctokens(t["strTeam"])
            if covered(ours, cand):
                score = len(cand)  # prefer the team with the fewest extra words
            elif core and covered(core, ours) and (len(core) >= 2 or len(ours) <= 2):
                score = 100 + len(ours) - len(core)  # their name is ours minus a city or suffix
            else:
                continue
            if best is None or score < best[1]:
                best = (t, score)
        if best:
            return best[0], q
    return None, None


def main():
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    src = open(os.path.join(ROOT, "data", "scarves.js"), encoding="utf-8").read()
    album = json.loads(re.search(r"=\s*(\{.*\});\s*$", src, re.S).group(1))
    try:
        out = json.load(open(OUT_PATH, encoding="utf-8"))
    except (OSError, ValueError):
        out = {}
    os.makedirs(BADGE_DIR, exist_ok=True)

    todo = [s for s in album["scarves"] if s["country"] != "Special editions"]
    done = 0
    for s in todo:
        key = f'{s["country"]}|{s["club"]}'
        if key in out:
            continue
        slug = re.sub(r"-\d+\.\w+$", "", os.path.basename(s["photo"])).replace("-", " ")
        team, q = match(s["club"], slug, s["country"], s["national"])
        if team and team.get("strBadge"):
            fname = f'{team["idTeam"]}.png'
            dest = os.path.join(BADGE_DIR, fname)
            if not os.path.exists(dest):
                subprocess.run(["curl", "-sfL", "--max-time", "30", "-o", dest, team["strBadge"] + "/small"])
                if not os.path.exists(dest) or os.path.getsize(dest) < 200:
                    subprocess.run(["curl", "-sfL", "--max-time", "30", "-o", dest, team["strBadge"]])
            ok = os.path.exists(dest) and os.path.getsize(dest) > 200
            out[key] = {"badge": f"assets/badges/{fname}" if ok else None, "team": team["strTeam"], "id": team["idTeam"], "query": q}
        else:
            out[key] = {"badge": None}
        done += 1
        if done % 10 == 0:
            json.dump(out, open(OUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            matched = sum(1 for v in out.values() if v.get("badge"))
            print(f"{len(out)}/{len(todo)} checked, {matched} badges", flush=True)

    json.dump(out, open(OUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(cache, open(CACHE_PATH, "w", encoding="utf-8"), ensure_ascii=False)
    matched = sum(1 for v in out.values() if v.get("badge"))
    print(f"DONE {len(out)} checked, {matched} badges", flush=True)


if __name__ == "__main__":
    main()
