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


def match(club, slug, country, national):
    """Return (team, query) or (None, None)."""
    if national:
        q = NATIONAL_QUERY.get(country, country)
        for t in search(q):
            if fold(t["strTeam"]) == fold(q) and is_first_team(t):
                return t, q
        return None, None

    ours = set(tokens(club))
    ours_slug = set(tokens(slug))
    cyr = bool(re.search(r"[а-яё]", club.lower()))
    core_toks = tokens(club) if not cyr else tokens(slug)
    queries = []
    if not cyr:
        queries.append(re.sub(r"\(.*?\)", "", club).strip())
    # progressively shorter prefixes of the distinctive words: "boca juniors buenos aires" -> "boca juniors"
    for k in range(len(core_toks), 0, -1):
        q = " ".join(core_toks[:k])
        if k == 1 and len(q) < 4:
            continue
        queries.append(q)
    queries = queries[:4]

    seen = set()
    for q in queries:
        if not q or q in seen:
            continue
        seen.add(q)
        best = None
        for t in search(q):
            if not country_ok(t, country) or not is_first_team(t):
                continue
            cand = set()
            for name in names_of(t):
                cand |= set(tokens(name))
            target = ours if ours else ours_slug
            if not target:
                continue
            if target <= cand or (cyr and ours_slug and ours_slug <= cand):
                team_core = set(tokens(t["strTeam"]))
                extra = len(cand - target)
                if best is None or extra < best[1]:
                    best = (t, extra)
            elif set(tokens(t["strTeam"])) and set(tokens(t["strTeam"])) <= target and (len(set(tokens(t["strTeam"]))) >= 2 or len(target) <= 2):
                # their name is ours minus a city or suffix, e.g. "Boca Juniors" for "Boca Juniors Buenos Aires"
                if best is None:
                    best = (t, 99)
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
