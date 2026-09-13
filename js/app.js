/* Football scarves — a static, hash-routed collection browser in the KolleK interface language.
   Routes: #/items?…filters  ·  #/scarf/<n>  ·  #/map  ·  #/statistics */
(() => {
  "use strict";

  const { meta, countries, scarves } = window.ALBUM;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ё/g, "е");
  const fmt = d3.format(",");
  const pct = (v, total) => (v / total < 0.005 ? "<1%" : `${Math.round((v / total) * 100)}%`);
  const plural = (n, one, many) => (n === 1 ? one : many);
  const isRu = (s) => /[\u0400-\u04ff]/.test(s || "");
  const lang = (s) => (isRu(s) ? ' lang="ru"' : "");
  const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const logoOf = (s) => s.badge || s.logo;
  const flag = (name) => {
    const svg = (countries[name] || {}).flagSvg;
    if (svg) return `<img class="flag" src="${svg}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
    const stripes = (countries[name] || {}).flag || ["#ccc"]; // special editions have no country flag
    const step = 100 / stripes.length;
    return `<span class="flag" style="background:linear-gradient(${stripes.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(",")})" aria-hidden="true"></span>`;
  };

  const HOW = {
    post: { label: "Posted from abroad", short: "By post", icon: "i-post" },
    swap: { label: "Swapped with a collector", short: "Swapped", icon: "i-swap" },
    brought: { label: "Brought in person", short: "Brought", icon: "i-brought" },
    gift: { label: "Gift or a friend's favour", short: "Gift", icon: "i-gift" },
    bought: { label: "Bought", short: "Bought", icon: "i-bought" },
    unrecorded: { label: "Not recorded", short: "Not recorded", icon: "i-unrecorded" },
  };
  const CONTINENTS = ["Europe", "Asia", "South America", "Africa", "North America", "Special"];
  const continentLabel = (c) => (c === "Special" ? "Special editions" : c);

  /* ------------------------------------------------------------ derived data */
  const total = scarves.length;
  const bySN = new Map(scarves.map((s) => [s.n, s]));
  const byCountry = d3.rollups(scarves, (v) => v.length, (d) => d.country).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const countOf = new Map(byCountry);
  const realCountries = byCountry.filter(([c]) => countries[c].iso);
  const haystack = new Map(scarves.map((s) => [s.n, fold(`${s.club} ${s.clubEn || ""} ${s.country} ${s.continent} ${s.note} ${s.photo}`)]));
  const howRows = d3.rollups(scarves, (v) => v.length, (d) => d.how)
    .map(([key, value]) => ({ key, value, label: HOW[key].label, icon: HOW[key].icon, muted: key === "unrecorded" }))
    .sort((a, b) => a.muted - b.muted || b.value - a.value);
  const newCount = scarves.filter((s) => s.new).length;
  $$("[data-stat=total]").forEach((el) => { el.textContent = fmt(total); });

  const credits = `
    <footer class="credits">
      <p>Collection and photographs: Alex, Moscow, from <a href="${esc(meta.source)}" target="_blank" rel="noopener">footballscarves.narod.ru</a>. Source last updated ${esc(meta.updatedOn || "")}; copied ${esc(meta.extractedOn)}.</p>
      <p>Club and federation badges: <a href="https://www.thesportsdb.com" target="_blank" rel="noopener">TheSportsDB</a> where a match was found, otherwise the original site. Interface based on <a href="https://github.com/djaiss/kollek" target="_blank" rel="noopener">KolleK</a> (MIT License).</p>
    </footer>`;

  /* ------------------------------------------------------------ tooltip */
  const tip = $("#tip");
  const showTip = (html, e) => { tip.innerHTML = html; tip.hidden = false; moveTip(e); };
  function moveTip(e) {
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  /* ------------------------------------------------------------ sidebar & theme */
  const sidebar = $("#sidebar"), scrim = $("#scrim"), openNav = $("#open-nav");
  const navCountries = byCountry.slice().sort((a, b) => (a[0] === "Special editions") - (b[0] === "Special editions") || a[0].localeCompare(b[0]));
  $("#nav-countries").innerHTML = navCountries.map(([c, n]) =>
    `<a class="nav-link" href="#/items?country=${encodeURIComponent(c)}" data-country="${esc(c)}">${flag(c)}<span>${esc(c)}</span><span class="nav-count">${n}</span></a>`).join("");

  function setNav(open) {
    sidebar.classList.toggle("is-open", open);
    scrim.hidden = !open;
    openNav.setAttribute("aria-expanded", open);
  }
  openNav.addEventListener("click", () => setNav(true));
  scrim.addEventListener("click", () => setNav(false));
  sidebar.addEventListener("click", (e) => { if (e.target.closest("a")) setNav(false); });

  const themeBtn = $("#theme-toggle");
  const syncThemeLabel = () => themeBtn.setAttribute("aria-label", document.documentElement.classList.contains("dark") ? "Switch to light theme" : "Switch to dark theme");
  syncThemeLabel();
  themeBtn.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    syncThemeLabel();
    if (/^#\/(map|statistics)/.test(location.hash)) route(); // their colours come from the theme
  });

  /* ------------------------------------------------------------ router */
  const main = $("#main");
  let lastList = scarves.map((s) => s.n); // prev/next on a scarf page walks the last filtered list
  let lastItemsHash = "#/items";
  let cleanup = () => {};

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = raw.split("?");
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query) };
  }

  function route() {
    cleanup();
    cleanup = () => {};
    hideTip();
    const { parts, params } = parseHash();
    const view = parts[0] || "items";
    if (view === "scarf" && bySN.has(+parts[1])) renderScarf(+parts[1]);
    else if (view === "map") renderMap();
    else if (view === "statistics") renderStats();
    else renderItems(params);

    const section = view === "scarf" ? "items" : view === "map" || view === "statistics" ? view : "items";
    const activeCountry = section === "items" && view !== "scarf" ? params.get("country") : view === "scarf" ? bySN.get(+parts[1])?.country : null;
    $$(".nav-link[data-route]").forEach((a) => a.classList.toggle("is-active", a.dataset.route === section && !activeCountry));
    $$("#nav-countries .nav-link").forEach((a) => a.classList.toggle("is-active", a.dataset.country === activeCountry));
  }
  addEventListener("hashchange", () => { route(); main.focus({ preventScroll: true }); scrollTo(0, 0); });

  /* ------------------------------------------------------------ items */
  function renderItems(params) {
    const state = {
      q: params.get("q") || "",
      continent: params.get("continent") || "",
      country: params.get("country") || "",
      how: params.get("how") || "",
      flags: new Set((params.get("only") || "").split(",").filter(Boolean)),
      sort: params.get("sort") || "album",
      view: params.get("view") || "grid",
    };
    const inCountry = !!state.country && countOf.has(state.country);
    if (!inCountry) state.country = "";

    const scope = inCountry ? scarves.filter((s) => s.country === state.country) : scarves;
    const dated = scope.filter((s) => s.year);
    const firstYear = dated.length ? d3.min(dated, (s) => s.year) : null;
    const topHow = d3.rollups(scope.filter((s) => s.how !== "unrecorded"), (v) => v.length, (d) => d.how).sort((a, b) => b[1] - a[1])[0];

    main.innerHTML = `
      <div class="page">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="#/items">Collections</a><span>/</span>
          ${inCountry ? `<a href="#/items">Football scarves</a><span>/</span><strong>${esc(state.country)}</strong>` : `<strong>Football scarves</strong>`}
        </nav>

        <header class="coll-head">
          <div class="coll-icon" aria-hidden="true">${inCountry ? flag(state.country) : `<span class="logo logo-lg"><svg><use href="#i-scarf"/></svg></span>`}</div>
          <div class="coll-text">
            <div class="coll-title-row">
              <h1 class="title">${inCountry ? esc(state.country) : "Football scarves"}</h1>
              <span class="badge">${inCountry ? esc(continentLabel(countries[state.country].continent)) : "Private collection"}</span>
            </div>
            <p class="lede">${inCountry
              ? `${scope.length} ${plural(scope.length, "scarf", "scarves")} from ${esc(state.country)}${topHow ? `, most of them ${HOW[topHow[0]].label.toLowerCase()}` : ""}.`
              : `Alex's scarves from clubs and national teams around the world, gathered since ${meta.since}. Almost every one was brought from the city or country its team plays in.`}</p>
            <div class="kpis">
              <div><p class="kpi-label">Items</p><p class="kpi-value">${fmt(scope.length)}</p></div>
              ${inCountry ? "" : `<div><p class="kpi-label">Countries</p><p class="kpi-value">${realCountries.length}</p></div>`}
              <div><p class="kpi-label">Official scarves</p><p class="kpi-value">${scope.filter((s) => s.official).length}</p></div>
              <div><p class="kpi-label">National teams</p><p class="kpi-value">${scope.filter((s) => s.national).length}</p></div>
              <div><p class="kpi-label">${inCountry ? "First noted" : "Last update"}</p><p class="kpi-value">${inCountry ? (firstYear || "—") : esc(meta.updatedOn || "—")}</p></div>
            </div>
          </div>
        </header>

        <div class="toolbar">
          <div class="toolbar-row">
            <div class="pills" role="group" aria-label="Continent">
              ${inCountry ? `<a class="pill" href="#/items">All countries</a><span class="pill is-on">${esc(state.country)}</span>` :
                ["", ...CONTINENTS].map((c) => `<button type="button" class="pill${state.continent === c ? " is-on" : ""}" data-continent="${c}" aria-pressed="${state.continent === c}">${c || "All"}</button>`).join("")}
            </div>
            <div class="toolbar-right">
              <label class="search"><span class="sr">Search scarves</span>${icon("i-search")}<input type="search" id="q" placeholder="Search scarves…" value="${esc(state.q)}" autocomplete="off"></label>
              <div class="viewswitch" role="group" aria-label="Layout">
                <button type="button" data-view="grid" class="${state.view === "grid" ? "is-on" : ""}" aria-label="Grid view" aria-pressed="${state.view === "grid"}">${icon("i-grid")}</button>
                <button type="button" data-view="list" class="${state.view === "list" ? "is-on" : ""}" aria-label="List view" aria-pressed="${state.view === "list"}">${icon("i-list")}</button>
              </div>
            </div>
          </div>
          <div class="toolbar-row">
            <div class="chips">
              <label><span class="sr">How it arrived</span>
                <select class="select" id="how">
                  <option value="">Any arrival</option>
                  ${howRows.map((r) => `<option value="${r.key}"${state.how === r.key ? " selected" : ""}>${esc(r.label)}</option>`).join("")}
                </select>
              </label>
              <button type="button" class="chip" data-flag="official" aria-pressed="${state.flags.has("official")}">Official</button>
              <button type="button" class="chip" data-flag="national" aria-pressed="${state.flags.has("national")}">National teams</button>
              ${newCount ? `<button type="button" class="chip" data-flag="new" aria-pressed="${state.flags.has("new")}">New <span class="chip-count">${newCount}</span></button>` : ""}
              <button type="button" class="clear" id="clear" hidden>Clear filters</button>
            </div>
            <label><span class="sr">Sort</span>
              <select class="select" id="sort">
                <option value="album"${state.sort === "album" ? " selected" : ""}>By country</option>
                <option value="name"${state.sort === "name" ? " selected" : ""}>Name A–Z</option>
                <option value="recent"${state.sort === "recent" ? " selected" : ""}>Year joined, newest</option>
                <option value="oldest"${state.sort === "oldest" ? " selected" : ""}>Year joined, oldest</option>
              </select>
            </label>
          </div>
        </div>

        <div id="results"></div>
        <div class="more" id="more"></div>
        <div class="result-line" id="result-line"></div>
        ${credits}
      </div>`;

    const PAGE = 96;
    let list = [], shown = 0;

    const matches = (s) => {
      if (state.country && s.country !== state.country) return false;
      if (state.continent && s.continent !== state.continent) return false;
      if (state.q && !fold(state.q).split(/\s+/).every((w) => haystack.get(s.n).includes(w))) return false;
      if (state.how && s.how !== state.how) return false;
      for (const f of state.flags) if (!s[f]) return false;
      return true;
    };
    const sorters = {
      album: (a, b) => a.n - b.n,
      name: (a, b) => a.club.localeCompare(b.club),
      recent: (a, b) => (b.year || 0) - (a.year || 0) || a.n - b.n,
      oldest: (a, b) => (a.year || 9999) - (b.year || 9999) || a.n - b.n,
    };

    const badgesFor = (s) =>
      `${s.new ? '<span class="badge badge-sm badge-new">New</span>' : ""}<span class="badge badge-sm">${icon(HOW[s.how].icon)}${esc(HOW[s.how].short)}</span>${s.official ? '<span class="badge badge-sm badge-official">Official</span>' : ""}${s.national ? '<span class="badge badge-sm badge-nt">National team</span>' : ""}`;
    const logoImg = (s, cls) => (logoOf(s) ? `<img class="${cls}" src="${esc(logoOf(s))}" alt="" loading="lazy" decoding="async">` : "");
    const cardHtml = (s) => `
      <a class="card" href="#/scarf/${s.n}">
        <div class="card-photo"><img src="${esc(s.photo)}" alt="${esc(s.club)}" loading="lazy" decoding="async"></div>
        <div class="card-body">
          <span class="card-name-row">${logoImg(s, "card-logo")}<span class="card-name"${lang(s.club)} title="${esc(s.club)}">${esc(s.club)}</span></span>
          <div class="card-badges">${badgesFor(s)}</div>
          <div class="card-foot"><span>${flag(s.country)}${esc(s.country)}</span><b>${s.year || "—"}</b></div>
        </div>
      </a>`;
    const rowHtml = (s) => `
      <a class="row" href="#/scarf/${s.n}">
        <span class="row-thumb"><img src="${esc(s.photo)}" alt="" loading="lazy" decoding="async"></span>
        <span class="row-name">${logoImg(s, "row-logo")}<span${lang(s.club)}>${esc(s.club)}</span></span>
        <span class="row-cell">${flag(s.country)}${esc(s.country)}</span>
        <span class="row-cell">${icon(HOW[s.how].icon)}${esc(HOW[s.how].label)}</span>
        <span class="row-year">${s.year || "—"}</span>
      </a>`;

    const results = $("#results"), more = $("#more"), line = $("#result-line");

    function draw(reset) {
      if (reset) {
        list = scarves.filter(matches).sort(sorters[state.sort] || sorters.album);
        lastList = list.map((s) => s.n);
        lastItemsHash = location.hash || "#/items";
        shown = 0;
        if (!list.length) {
          results.innerHTML = `<div class="empty"><div class="empty-icon">${icon("i-search")}</div><p class="empty-title">No scarves match</p><p>Try another spelling, a different continent, or clear the filters to see all ${fmt(total)} scarves.</p></div>`;
          more.innerHTML = line.innerHTML = "";
          syncClear();
          return;
        }
        results.innerHTML = state.view === "list"
          ? `<div class="list"><div class="row row-head" aria-hidden="true"><span></span><span>Name</span><span class="row-cell">Country</span><span class="row-cell">Arrived</span><span class="row-year">Year</span></div><div id="rows"></div></div>`
          : `<div class="grid" id="rows"></div>`;
      }
      const next = list.slice(shown, shown + PAGE);
      $("#rows").insertAdjacentHTML("beforeend", next.map(state.view === "list" ? rowHtml : cardHtml).join(""));
      shown += next.length;
      more.innerHTML = shown < list.length ? `<button type="button" class="btn btn-outline" id="more-btn">Show ${Math.min(PAGE, list.length - shown)} more</button>` : "";
      line.innerHTML = `<span>Showing ${fmt(shown)} of ${fmt(list.length)} ${plural(list.length, "scarf", "scarves")}${state.country ? ` from ${esc(state.country)}` : ""}</span>${state.country ? `<a href="#/items" class="clear">See all scarves in the collection →</a>` : ""}`;
      syncClear();
    }

    const syncClear = () => { $("#clear").hidden = !(state.q || state.continent || state.how || state.flags.size); };

    function writeHash() {
      const p = new URLSearchParams();
      if (state.country) p.set("country", state.country);
      if (state.continent) p.set("continent", state.continent);
      if (state.q) p.set("q", state.q);
      if (state.how) p.set("how", state.how);
      if (state.flags.size) p.set("only", [...state.flags].join(","));
      if (state.sort !== "album") p.set("sort", state.sort);
      if (state.view !== "grid") p.set("view", state.view);
      const qs = p.toString();
      history.replaceState(null, "", `#/items${qs ? `?${qs}` : ""}`);
    }
    const update = () => { writeHash(); draw(true); };

    let timer;
    $("#q").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); update(); }, 120); });
    const pressOnly = (sel, b) => $$(sel, main).forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b); });
    $$("[data-continent]", main).forEach((b) => b.addEventListener("click", () => { state.continent = b.dataset.continent; pressOnly("[data-continent]", b); update(); }));
    $$("[data-view]", main).forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; pressOnly("[data-view]", b); update(); }));
    $$("[data-flag]", main).forEach((b) => b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on);
      on ? state.flags.add(b.dataset.flag) : state.flags.delete(b.dataset.flag);
      update();
    }));
    $("#how").addEventListener("change", (e) => { state.how = e.target.value; update(); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; update(); });
    $("#clear").addEventListener("click", () => {
      Object.assign(state, { q: "", continent: "", how: "" });
      state.flags.clear();
      $("#q").value = ""; $("#how").value = "";
      const all = $('[data-continent=""]', main);
      if (all) pressOnly("[data-continent]", all);
      $$("[data-flag]", main).forEach((x) => x.setAttribute("aria-pressed", "false"));
      update();
    });
    more.addEventListener("click", (e) => { if (e.target.closest("#more-btn")) draw(false); });

    // keep loading as the reader nears the end of the grid
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && shown < list.length) draw(false); }, { rootMargin: "800px" });
    io.observe(more);
    cleanup = () => io.disconnect();

    draw(true);
  }

  /* ------------------------------------------------------------ scarf page */
  function renderScarf(n) {
    const s = bySN.get(n);
    const list = lastList.includes(n) ? lastList : scarves.map((x) => x.n);
    const i = list.indexOf(n);
    const prev = list[i - 1], next = list[i + 1];
    const site = s.site ? (s.site.startsWith("http") ? s.site : `http://${s.site}`) : null;
    const type = [s.official && "Official club scarf", s.national && "National team"].filter(Boolean).join(" · ") || "Club or supporters' scarf";
    const sameCountry = scarves.filter((x) => x.country === s.country && x.n !== n).slice(0, 4);
    const stepBtn = (to, label, ico) => to
      ? `<a class="icon-btn icon-btn-lg" href="#/scarf/${to}" aria-label="${label}">${icon(ico)}</a>`
      : `<button type="button" class="icon-btn icon-btn-lg" disabled aria-label="${label}">${icon(ico)}</button>`;
    document.title = `${s.club} — Football scarves`;

    main.innerHTML = `
      <div class="page">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="#/items">Football scarves</a><span>/</span>
          <a href="#/items?country=${encodeURIComponent(s.country)}">${esc(s.country)}</a><span>/</span>
          <strong${lang(s.club)}>${esc(s.club)}</strong>
        </nav>

        <div class="item-head">
          <div class="item-id">
            ${logoOf(s) ? `<span class="item-logo"><img src="${esc(logoOf(s))}" alt="${esc(s.club)} badge"></span>` : ""}
            <div>
              <h1 class="title"${lang(s.club)}>${esc(s.club)}</h1>
              ${s.clubEn && s.clubEn !== s.club ? `<p class="item-alt">${esc(s.clubEn)}</p>` : ""}
              <div class="coll-title-row">
                ${s.new ? '<span class="badge badge-new">New</span>' : ""}
                <span class="badge">${flag(s.country)}${esc(s.country)}</span>
                ${s.official ? '<span class="badge badge-official">Official</span>' : ""}
                ${s.national ? '<span class="badge badge-nt">National team</span>' : ""}
              </div>
            </div>
          </div>
          <div class="stepper">
            <a class="btn btn-outline" href="${esc(lastItemsHash)}">${icon("i-back")}Back</a>
            ${stepBtn(prev, "Previous scarf", "i-left")}
            ${stepBtn(next, "Next scarf", "i-right")}
          </div>
        </div>

        <div class="item">
          <div>
            <div class="photo" id="photo">
              <img src="${esc(s.photo)}" alt="Scarf of ${esc(s.club)}">
              <div class="photo-glare"></div>
            </div>
            <h2 class="section-title">Collector's note</h2>
            ${s.note ? `<p class="note"${lang(s.note)}>${esc(s.note)}</p>${isRu(s.note) ? '<p class="note-foot">Original note, in Russian.</p>' : ""}` : `<p class="note note-empty">No note was written for this scarf.</p>`}
          </div>
          <div>
            <dl class="details">
              <div class="detail"><dt>Number</dt><dd>#${String(s.n).padStart(3, "0")}</dd></div>
              <div class="detail"><dt>Country</dt><dd>${flag(s.country)}${esc(s.country)}</dd></div>
              <div class="detail"><dt>Continent</dt><dd>${esc(continentLabel(s.continent))}</dd></div>
              <div class="detail"><dt>How it arrived</dt><dd>${icon(HOW[s.how].icon)}${esc(HOW[s.how].label)}</dd></div>
              <div class="detail"><dt>Year joined</dt><dd>${s.year || "Not noted"}</dd></div>
              <div class="detail"><dt>Type</dt><dd>${esc(type)}</dd></div>
              ${site ? `<div class="detail"><dt>Club website</dt><dd><a href="${esc(site)}" target="_blank" rel="noopener">${esc(s.site)}</a></dd></div>` : ""}
            </dl>
            ${sameCountry.length ? `
              <h2 class="section-title">More from ${esc(s.country)}</h2>
              <div class="related">${sameCountry.map((x) => `<a href="#/scarf/${x.n}"><span class="row-thumb"><img src="${esc(x.photo)}" alt="" loading="lazy"></span><span${lang(x.club)}>${esc(x.club)}</span></a>`).join("")}</div>` : ""}
            <p class="kbd-hint">${i + 1} of ${fmt(list.length)} · <kbd>←</kbd> <kbd>→</kbd> to browse, <kbd>Esc</kbd> to go back</p>
          </div>
        </div>
        ${credits}
      </div>`;

    // gentle tilt and glare, as on a KolleK item photo
    const photo = $("#photo"), img = $("#photo img");
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      photo.addEventListener("pointermove", (e) => {
        const r = photo.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        img.style.setProperty("--ry", `${(x - 0.5) * 8}deg`);
        img.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
        photo.style.setProperty("--gx", `${x * 100}%`);
        photo.style.setProperty("--gy", `${y * 100}%`);
      });
      photo.addEventListener("pointerleave", () => { img.style.setProperty("--rx", "0deg"); img.style.setProperty("--ry", "0deg"); });
    }

    const onKey = (e) => {
      if (e.target.closest("input, select, textarea")) return;
      if (e.key === "ArrowLeft" && prev) location.hash = `#/scarf/${prev}`;
      else if (e.key === "ArrowRight" && next) location.hash = `#/scarf/${next}`;
      else if (e.key === "Escape") location.hash = lastItemsHash;
    };
    addEventListener("keydown", onKey);
    cleanup = () => { removeEventListener("keydown", onKey); document.title = "Football scarves — Alex's collection"; };
  }

  /* ------------------------------------------------------------ bars helper */
  function barsHtml(rows, { link } = {}) {
    const max = d3.max(rows, (r) => r.value);
    return rows.map((r) => {
      const tag = link ? "button" : "div";
      return `<${tag} class="bar-row${r.muted ? " is-muted" : ""}"${link ? ` type="button" data-go="${esc(link(r))}"` : ""}>
        <span class="bar-top"><span class="bar-label">${r.icon ? icon(r.icon) : ""}${r.flag || ""}<span>${esc(r.label)}</span></span><span class="bar-val"><b>${fmt(r.value)}</b> · ${pct(r.value, total)}</span></span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max((r.value / max) * 100, 0.8)}%"></span></span>
      </${tag}>`;
    }).join("");
  }
  function growBars(root) {
    const els = $$(".bars", root);
    els.forEach((el) => el.classList.add("is-waiting"));
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove("is-waiting"); io.unobserve(e.target); } }), { threshold: 0.2 });
    els.forEach((el) => io.observe(el));
    const onClick = (e) => { const b = e.target.closest("[data-go]"); if (b) location.hash = b.dataset.go; };
    root.addEventListener("click", onClick);
    return () => { io.disconnect(); root.removeEventListener("click", onClick); };
  }

  /* ------------------------------------------------------------ statistics */
  function renderStats() {
    const dated = scarves.filter((s) => s.year);
    const counts = d3.rollup(dated, (v) => v.length, (d) => d.year);
    const [y0, y1] = d3.extent(dated, (d) => d.year);
    const peak = [...counts].sort((a, b) => b[1] - a[1])[0];
    const official = scarves.filter((s) => s.official).length;
    const national = scarves.filter((s) => s.national);
    const ntCountries = new Set(national.map((s) => s.country)).size;
    const continentRows = CONTINENTS.map((c) => ({ key: c, label: continentLabel(c), value: scarves.filter((s) => s.continent === c).length, muted: c === "Special" })).filter((r) => r.value);
    const topCountries = realCountries.slice(0, 10).map(([c, n]) => ({ label: c, value: n, flag: flag(c) }));
    const continentsWithScarves = continentRows.filter((r) => !r.muted).length;

    const kpis = [
      { label: "Total scarves", value: fmt(total), note: newCount ? `${newCount} in the latest update` : `since ${meta.since}`, dot: "#3b82f6" },
      { label: "Countries", value: realCountries.length, note: `on ${continentsWithScarves} continents, plus ${countOf.get("Special editions") || 0} special scarves`, dot: "#8b5cf6" },
      { label: "Official club scarves", value: official, note: `${pct(official, total)} of the collection`, dot: "#f59e0b" },
      { label: "National teams", value: national.length, note: `from ${ntCountries} countries`, dot: "#34d399" },
    ];

    main.innerHTML = `
      <div class="page"><div class="page-narrow">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#/items">Collections</a><span>/</span><a href="#/items">Football scarves</a><span>/</span><strong>Statistics</strong></nav>
        <div class="page-head">
          <h1 class="title">Statistics</h1>
          <p class="lede">What the collection holds, where it comes from, and how the scarves found their way to Moscow.</p>
        </div>

        <div class="kpi-grid">
          ${kpis.map((k) => `<div class="kpi-card"><div class="kpi-card-head"><span class="kpi-dot" style="background:${k.dot}"></span>${esc(k.label)}</div><div class="kpi-big">${k.value}</div><div class="kpi-note">${esc(k.note)}</div></div>`).join("")}
        </div>

        <div class="stat-grid">
          <section class="box box-pad" aria-labelledby="st-years">
            <div class="box-head">
              <div><h2 class="box-title" id="st-years">Scarves by year joined</h2><p class="box-sub">${fmt(dated.length)} of ${fmt(total)} notes mention the year a scarf came in.</p></div>
              <div class="box-head-value"><b>${peak[1]}</b><span>peak, ${peak[0]}</span></div>
            </div>
            <div class="columns" id="years"></div>
          </section>
          <section class="box box-pad" aria-labelledby="st-how">
            <div class="box-head"><div><h2 class="box-title" id="st-how">How they arrived</h2><p class="box-sub">Read from the collector's notes.</p></div></div>
            <div class="bars">${barsHtml(howRows, { link: (r) => `#/items?how=${r.key}` })}</div>
          </section>
          <section class="box box-pad" aria-labelledby="st-top">
            <div class="box-head">
              <div><h2 class="box-title" id="st-top">Biggest countries</h2><p class="box-sub">Russia alone holds ${pct(countOf.get("Russia"), total)} of the collection.</p></div>
              <a class="clear" href="#/map">Open the map →</a>
            </div>
            <div class="bars">${barsHtml(topCountries, { link: (r) => `#/items?country=${encodeURIComponent(r.label)}` })}</div>
          </section>
          <section class="box box-pad" aria-labelledby="st-cont">
            <div class="box-head"><div><h2 class="box-title" id="st-cont">By continent</h2><p class="box-sub">${realCountries.length} countries in total.</p></div></div>
            <div class="bars">${barsHtml(continentRows, { link: (r) => `#/items?continent=${encodeURIComponent(r.key)}` })}</div>
          </section>
        </div>

        <details class="tables">
          <summary>Show these charts as tables</summary>
          <div class="tables-wrap" id="tables"></div>
        </details>
        ${credits}
      </div></div>`;

    // column chart: one column per year
    const years = d3.range(y0, y1 + 1);
    const W = 640, H = 240, m = { t: 22, r: 4, b: 24, l: 30 };
    const x = d3.scaleBand().domain(years).range([m.l, W - m.r]).paddingInner(0.25);
    const y = d3.scaleLinear().domain([0, peak[1]]).nice().range([H - m.b, m.t]);
    const bw = Math.min(x.bandwidth(), 24);
    const svg = d3.select("#years").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", `Scarves by year joined, ${y0} to ${y1}; peak of ${peak[1]} in ${peak[0]}`);
    svg.append("g").selectAll("line").data(y.ticks(4).slice(1)).join("line").attr("class", "grid-line")
      .attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y);
    svg.append("g").selectAll("text").data(y.ticks(4)).join("text").attr("x", m.l - 8).attr("y", (d) => y(d) + 4).attr("text-anchor", "end").text((d) => d);
    svg.append("line").attr("class", "base").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0)).attr("y2", y(0));
    svg.append("g").selectAll("text").data(years.filter((d) => d % 5 === 0 || ((d === y0 || d === y1) && Math.abs(d - Math.round(d / 5) * 5) > 2))).join("text")
      .attr("x", (d) => x(d) + x.bandwidth() / 2).attr("y", H - 6).attr("text-anchor", "middle").text((d) => d);
    const colPath = (d) => {
      const v = counts.get(d) || 0;
      if (!v) return "";
      const cx = x(d) + (x.bandwidth() - bw) / 2, top = y(v), base = y(0), r = Math.min(4, bw / 2, base - top);
      return `M${cx},${base}V${top + r}Q${cx},${top} ${cx + r},${top}H${cx + bw - r}Q${cx + bw},${top} ${cx + bw},${top + r}V${base}Z`;
    };
    years.forEach((d) => {
      const v = counts.get(d) || 0;
      const g = svg.append("g");
      g.append("rect").attr("class", "hit").attr("x", x(d) - (x.step() - x.bandwidth()) / 2).attr("y", m.t).attr("width", x.step()).attr("height", H - m.t - m.b);
      const col = g.append("path").attr("class", "col").attr("d", colPath(d));
      g.on("pointerenter", (e) => {
        col.classed("is-hot", true);
        const names = scarves.filter((s) => s.year === d).slice(0, 3).map((s) => esc(s.club)).join(" · ");
        showTip(`<div class="tip-title">${d}</div><div><span class="tip-big">${v}</span> ${plural(v, "scarf", "scarves")}</div>${v ? `<div class="tip-sub">${names}${v > 3 ? " …" : ""}</div>` : ""}`, e);
      }).on("pointermove", moveTip).on("pointerleave", () => { col.classed("is-hot", false); hideTip(); });
    });
    svg.append("text").attr("class", "peak").attr("x", x(peak[0]) + x.bandwidth() / 2).attr("y", y(peak[1]) - 7).attr("text-anchor", "middle").text(peak[1]);

    const table = (caption, rows) => `<table><caption>${esc(caption)}</caption><tbody>${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${b}</td></tr>`).join("")}</tbody></table>`;
    $("#tables").innerHTML =
      table("Year joined", years.filter((d) => counts.get(d)).map((d) => [d, counts.get(d)])) +
      table("How they arrived", howRows.map((r) => [r.label, r.value])) +
      table("By continent", continentRows.map((r) => [r.label, r.value])) +
      table("Scarves per country", byCountry);

    cleanup = growBars(main);
  }

  /* ------------------------------------------------------------ map */
  function renderMap() {
    const byIso = new Map();
    for (const [name, n] of byCountry) {
      const iso = countries[name].iso;
      if (!iso) continue;
      if (!byIso.has(iso)) byIso.set(iso, { total: 0, parts: [] });
      byIso.get(iso).total += n;
      byIso.get(iso).parts.push([name, n]);
    }
    const bins = [1, 2, 4, 10, 30, 100];
    const ramp = [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--seq-${i}`));
    const color = d3.scaleThreshold().domain(bins.slice(1)).range(ramp);
    const top = realCountries.slice(0, 12);

    main.innerHTML = `
      <div class="page">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#/items">Collections</a><span>/</span><a href="#/items">Football scarves</a><span>/</span><strong>Map</strong></nav>
        <div class="page-head">
          <h1 class="title">Map</h1>
          <p class="lede">Every country with at least one scarf, shaded by how many. Click a country to see its scarves.</p>
        </div>
        <div class="map-layout">
          <section class="box map-box" aria-label="Map of scarves by country">
            <div class="map-bar">
              <div class="pills" role="group" aria-label="Map view">
                <button type="button" class="pill is-on" data-zoom="europe" aria-pressed="true">Europe</button>
                <button type="button" class="pill" data-zoom="world" aria-pressed="false">World</button>
              </div>
              <div class="legend" aria-label="Scarves per country">
                <span class="legend-title">Scarves</span>
                ${bins.map((b, i) => { const hi = bins[i + 1] ? bins[i + 1] - 1 : null; return `<span class="legend-step"><i style="background:${ramp[i]}"></i>${hi == null ? `${b}+` : hi === b ? b : `${b}–${hi}`}</span>`; }).join("")}
              </div>
            </div>
            <div class="map-frame" id="map" role="img" aria-label="Choropleth map; the ranked list beside it has the same numbers"></div>
            <p class="map-foot">Drag to pan and pinch to zoom. England, Scotland, Wales and Northern Ireland share one shape.</p>
          </section>
          <section class="box box-pad" aria-labelledby="map-top">
            <div class="box-head"><div><h2 class="box-title" id="map-top">Countries by scarves</h2><p class="box-sub">${realCountries.length} countries · top ${top.length} shown</p></div></div>
            <div id="leaders">
              ${top.map(([c, n], i) => `<button type="button" class="leader" data-country="${esc(c)}"><span class="leader-rank">${i + 1}</span><span class="leader-name">${flag(c)}<span>${esc(c)}</span></span><span class="leader-val">${n}</span><span class="bar-track"><span class="bar-fill" style="width:${(n / top[0][1]) * 100}%"></span></span></button>`).join("")}
            </div>
            <a class="clear leaders-more" href="#/statistics">All statistics →</a>
          </section>
        </div>
        ${credits}
      </div>`;

    const W = 1000, H = 688;
    const world = topojson.feature(window.WORLD, window.WORLD.objects.countries);
    world.features = world.features.filter((f) => f.id !== "010");
    const projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], world);
    const path = d3.geoPath(projection);
    const svg = d3.select("#map").append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g");
    const nodata = cssVar("--nodata");

    const tipFor = (entry) => {
      const uk = entry.parts.length > 1;
      const names = scarves.filter((s) => entry.parts.some(([c]) => c === s.country)).slice(0, 3).map((s) => esc(s.club)).join(" · ");
      return `<div class="tip-title">${uk ? "" : flag(entry.parts[0][0])}${uk ? "United Kingdom" : esc(entry.parts[0][0])}</div>
        <div><span class="tip-big">${entry.total}</span> ${plural(entry.total, "scarf", "scarves")}</div>
        ${uk ? `<ul>${entry.parts.map(([c, n]) => `<li><span>${esc(c)}</span><b>${n}</b></li>`).join("")}</ul>` : `<div class="tip-sub">${names}${entry.total > 3 ? " …" : ""}</div>`}`;
    };
    const go = (entry) => {
      const name = entry.parts.slice().sort((a, b) => b[1] - a[1])[0][0];
      location.hash = `#/items?country=${encodeURIComponent(name)}`;
    };

    let dotLayer;
    g.selectAll("path").data(world.features).join("path")
      .attr("class", (f) => `land${byIso.has(f.id) ? " has" : ""}`)
      .attr("d", path)
      .attr("fill", (f) => (byIso.has(f.id) ? color(byIso.get(f.id).total) : nodata))
      .on("pointerenter", function (e, f) { if (byIso.has(f.id)) { this.parentNode.insertBefore(this, dotLayer.node()); showTip(tipFor(byIso.get(f.id)), e); } })
      .on("pointermove", (e, f) => { if (byIso.has(f.id)) moveTip(e); })
      .on("pointerleave", hideTip)
      .on("click", (e, f) => { if (byIso.has(f.id)) go(byIso.get(f.id)); });

    dotLayer = g.append("g");
    const dots = dotLayer.selectAll("circle").data(world.features.filter((f) => byIso.has(f.id) && path.area(f) < 40)).join("circle")
      .attr("class", "dot").attr("cx", (f) => path.centroid(f)[0]).attr("cy", (f) => path.centroid(f)[1]).attr("r", 4.5)
      .attr("fill", (f) => color(byIso.get(f.id).total))
      .on("pointerenter", (e, f) => showTip(tipFor(byIso.get(f.id)), e)).on("pointermove", moveTip).on("pointerleave", hideTip)
      .on("click", (e, f) => go(byIso.get(f.id)));

    const zoom = d3.zoom().scaleExtent([1, 14]).translateExtent([[0, 0], [W, H]])
      .on("zoom", (e) => { g.attr("transform", e.transform); dots.attr("r", 4.5 / Math.sqrt(e.transform.k)); });
    svg.call(zoom).on("wheel.zoom", null);
    const [ex0, ey0] = projection([-11, 71]), [ex1, ey1] = projection([47, 35]);
    const k = Math.min(W / (ex1 - ex0), H / (ey1 - ey0)) * 0.98;
    const views = { world: d3.zoomIdentity, europe: d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(ex0 + ex1) / 2, -(ey0 + ey1) / 2) };
    svg.call(zoom.transform, views.europe);
    $$("[data-zoom]", main).forEach((b) => b.addEventListener("click", () => {
      $$("[data-zoom]", main).forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b); });
      svg.transition().duration(900).ease(d3.easeCubicInOut).call(zoom.transform, views[b.dataset.zoom]);
    }));

    const leaders = $("#leaders");
    leaders.addEventListener("click", (e) => { const b = e.target.closest("[data-country]"); if (b) location.hash = `#/items?country=${encodeURIComponent(b.dataset.country)}`; });
    leaders.addEventListener("pointerover", (e) => {
      const b = e.target.closest("[data-country]");
      g.selectAll(".land").classed("is-hot", (f) => !!b && countries[b.dataset.country].iso === f.id);
    });
    leaders.addEventListener("pointerleave", () => g.selectAll(".land").classed("is-hot", false));
  }

  route();
})();
