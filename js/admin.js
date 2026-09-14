/* Admin: add scarves to the collection by committing straight to the GitHub repository.
   New scarves go to data/additions.js (merged by app.js), photos to assets/scarves/, new flags to assets/flags/.
   The token stays in this browser and is only sent to api.github.com. */
(() => {
  "use strict";

  const REPO = "shimapa/alex_flags";
  let BRANCH = "main";
  const API = "https://api.github.com";
  const ADDITIONS = "data/additions.js";
  const TOKEN_KEY = "scarves-admin-token";
  const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/123";

  const HOW = { post: "Posted from abroad", swap: "Swapped with a collector", brought: "Brought in person", gift: "Gift or a friend's favour", bought: "Bought", unrecorded: "Not recorded" };
  const CONTINENTS = ["Europe", "Asia", "South America", "Africa", "North America"];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const base = window.ALBUM;
  let token = "";
  let photoBlob = null;
  let badgeChoice = null; // { id, name, url } or null for "no badge"

  /* ------------------------------------------------------------ GitHub */
  async function gh(path, { method = "GET", body } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const err = new Error(detail.message || `GitHub answered ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const utf8ToB64 = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const blobToB64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  async function readAdditions(ref) {
    try {
      const file = await gh(`/repos/${REPO}/contents/${ADDITIONS}?ref=${ref}`);
      const text = b64ToUtf8(file.content);
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch (e) {
      if (e.status === 404) return { countries: {}, scarves: [] };
      throw e;
    }
  }
  const additionsText = (data) =>
    "// Scarves added through admin.html. Kept apart from scarves.js, which tools/extract.py regenerates.\n" +
    `window.ALBUM_ADDITIONS = ${JSON.stringify(data)};\n`;

  /* One commit with every file, built on the latest main. If someone else pushed in between,
     start again from their version so nobody's addition is lost. */
  async function commitChange(message, change) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = (await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`)).object.sha;
      const baseTree = (await gh(`/repos/${REPO}/git/commits/${head}`)).tree.sha;
      const data = await readAdditions(head);
      const { files, result } = await change(data);
      files.push({ path: ADDITIONS, text: additionsText(data) });

      const tree = [];
      for (const f of files) {
        if (f.remove) { tree.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
        const blob = await gh(`/repos/${REPO}/git/blobs`, { method: "POST", body: f.b64 ? { content: f.b64, encoding: "base64" } : { content: utf8ToB64(f.text), encoding: "base64" } });
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const newTree = await gh(`/repos/${REPO}/git/trees`, { method: "POST", body: { base_tree: baseTree, tree } });
      const commit = await gh(`/repos/${REPO}/git/commits`, { method: "POST", body: { message, tree: newTree.sha, parents: [head] } });
      try {
        await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: commit.sha, force: false } });
        return result;
      } catch (e) {
        if (e.status !== 422 || attempt === 2) throw e; // 422: main moved on, rebuild on top of it
      }
    }
  }

  /* ------------------------------------------------------------ sign in */
  async function signIn(t, remember) {
    token = t.trim();
    const [user, repo] = await Promise.all([gh("/user"), gh(`/repos/${REPO}`)]);
    if (repo.permissions && !repo.permissions.push) throw new Error(`${user.login} can see the repository but can't write to it. Ask the owner for access.`);
    try { remember ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    $("#who-name").innerHTML = `Signed in as <b>${esc(user.login)}</b>`;
    $("#who").hidden = false;
    $("#login").hidden = true;
    $("#add-form").hidden = false;
    $("#recent").hidden = false;
    loadRecent();
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-btn"), err = $("#login-error");
    btn.disabled = true; err.hidden = true;
    try {
      await signIn($("#token").value, $("#remember").checked);
    } catch (ex) {
      token = "";
      err.textContent = ex.status === 401 ? "GitHub doesn't accept this token. Check that it was copied whole and hasn't expired." : ex.status === 404 ? "This token can't see shimapa/alex_flags. Give it access to that repository." : ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#sign-out").addEventListener("click", () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    location.reload();
  });

  /* ------------------------------------------------------------ form: selects */
  function fillCountries(extraCountries = {}) {
    const all = { ...base.countries, ...extraCountries };
    const names = Object.keys(all).sort((a, b) => a.localeCompare(b));
    const sel = $("#country"), keep = sel.value;
    sel.innerHTML = `<option value="">Choose a country…</option>` +
      names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("") +
      `<option value="__new">+ New country…</option>`;
    if (keep) sel.value = keep;
  }
  $("#how").innerHTML = Object.entries(HOW).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  $("#how").value = "swap";
  $("#nc-continent").innerHTML = CONTINENTS.map((c) => `<option>${c}</option>`).join("");
  $("#country").addEventListener("change", () => { $("#new-country").hidden = $("#country").value !== "__new"; });
  fillCountries();

  /* ------------------------------------------------------------ form: photo */
  const drop = $("#drop");
  async function takePhoto(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // transparent PNGs become white, like the rest of the photos
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    photoBlob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    let preview = drop.querySelector("img");
    if (!preview) { preview = document.createElement("img"); preview.alt = "Selected scarf photo"; drop.appendChild(preview); }
    preview.src = URL.createObjectURL(photoBlob);
    drop.classList.add("has-photo");
    drop.removeAttribute("aria-invalid");
  }
  $("#photo").addEventListener("change", (e) => takePhoto(e.target.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); takePhoto(e.dataTransfer.files[0]); });

  /* ------------------------------------------------------------ form: badge lookup */
  let lookupTimer, lookupSeq = 0;
  function scheduleLookup() {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(lookupBadge, 500);
  }
  async function lookupBadge() {
    const q = ($("#club-en").value || $("#club").value).replace(/\(.*?\)/g, "").trim();
    const box = $("#badge-pick"), seq = ++lookupSeq;
    if (q.length < 3) { box.innerHTML = `<p class="hint">Type the team name to look it up on TheSportsDB.</p>`; badgeChoice = null; return; }
    box.innerHTML = `<p class="hint">Looking up “${esc(q)}”…</p>`;
    let teams = [];
    try {
      const res = await fetch(`${SPORTSDB}/searchteams.php?t=${encodeURIComponent(q)}`);
      teams = ((await res.json()).teams || []).filter((t) => t.strSport === "Soccer" && t.strBadge).slice(0, 7);
    } catch (e) {
      if (seq === lookupSeq) box.innerHTML = `<p class="hint">TheSportsDB didn't answer. You can add the scarf without a badge.</p>`;
      return;
    }
    if (seq !== lookupSeq) return;
    const opts = teams.map((t, i) => `
      <button type="button" class="badge-opt" data-i="${i}" aria-pressed="false">
        <img src="${esc(t.strBadge)}/tiny" alt="" loading="lazy"><span><b>${esc(t.strTeam)}</b><small>${esc([t.strCountry, t.strLeague].filter(Boolean).join(" · "))}</small></span>
      </button>`).join("");
    box.innerHTML = `
      ${teams.length ? "" : `<p class="hint">Nothing found for “${esc(q)}”. Try the English name, or add it without a badge.</p>`}
      <div class="badge-options">${opts}
        <button type="button" class="badge-opt" data-i="none" aria-pressed="true"><span class="none-mark" aria-hidden="true">–</span><span><b>No badge</b><small>use the flag</small></span></button>
      </div>`;
    badgeChoice = null;
    box.querySelectorAll(".badge-opt").forEach((b) => b.addEventListener("click", () => {
      box.querySelectorAll(".badge-opt").forEach((x) => x.setAttribute("aria-pressed", x === b));
      const t = teams[+b.dataset.i];
      badgeChoice = b.dataset.i === "none" ? null : { id: t.idTeam, name: t.strTeam, url: t.strBadge };
      if (t && $("#country").value === "" && t.strCountry && base.countries[t.strCountry]) $("#country").value = t.strCountry;
    }));
  }
  $("#club").addEventListener("input", scheduleLookup);
  $("#club-en").addEventListener("input", scheduleLookup);

  /* ------------------------------------------------------------ save */
  const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const TRANSLIT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g", ў: "u" };
  const latin = (s) => s.toLowerCase().replace(/[а-яёіїєґў]/g, (c) => TRANSLIT[c] ?? "");

  async function exists(path) {
    try { return (await fetch(path, { method: "HEAD", cache: "no-store" })).ok; } catch (e) { return false; }
  }
  async function worldIso(name) {
    if (!window.WORLD) {
      await new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = "vendor/world-50m.js"; s.onload = resolve; s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
    const geo = window.WORLD?.objects?.countries?.geometries?.find((g) => (g.properties?.name || "").toLowerCase() === name.toLowerCase());
    return geo ? String(geo.id).padStart(3, "0") : null;
  }

  function validate() {
    const problems = [];
    const mark = (el, bad) => el.setAttribute("aria-invalid", bad ? "true" : "false");
    mark(drop, !photoBlob); if (!photoBlob) problems.push("a photo");
    const club = $("#club").value.trim(); mark($("#club"), !club); if (!club) problems.push("the team name");
    const country = $("#country").value; mark($("#country"), !country); if (!country) problems.push("the country");
    if (country === "__new") {
      const name = $("#nc-name").value.trim(), code = $("#nc-code").value.trim().toLowerCase();
      mark($("#nc-name"), !name); if (!name) problems.push("the new country's name");
      const okCode = /^[a-z]{2}(-[a-z]{3})?$/.test(code); mark($("#nc-code"), !okCode); if (!okCode) problems.push("a flag code like “is” or “gb-sct”");
    }
    const year = $("#year").value.trim();
    const okYear = !year || (/^\d{4}$/.test(year) && +year >= 1950 && +year <= new Date().getFullYear());
    mark($("#year"), !okYear); if (!okYear) problems.push("a year between 1950 and now");
    return problems;
  }

  $("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#save-error"), ok = $("#save-ok"), btn = $("#save-btn");
    err.hidden = true; ok.hidden = true;
    const problems = validate();
    if (problems.length) {
      err.textContent = `Still needed: ${problems.join(", ")}.`;
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const club = $("#club").value.trim();
      const clubEn = $("#club-en").value.trim();
      let country = $("#country").value;
      let newCountry = null;
      if (country === "__new") {
        const name = $("#nc-name").value.trim();
        const code = $("#nc-code").value.trim().toLowerCase();
        const flagPath = `assets/flags/${code}.svg`;
        newCountry = { name, entry: { iso: await worldIso(name), continent: $("#nc-continent").value, flag: ["#cccccc"], flagSvg: flagPath }, flagFile: null };
        if (!(await exists(flagPath))) {
          const res = await fetch(`https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3/${code}.svg`);
          if (!res.ok) throw new Error(`There is no flag with the code “${code}”. Check the two-letter country code.`);
          newCountry.flagFile = { path: flagPath, text: await res.text() };
        }
        country = name;
      }

      let badge = null, badgeId = null;
      if (badgeChoice) {
        badgeId = badgeChoice.id;
        const local = `assets/badges/${badgeChoice.id}.png`;
        badge = (await exists(local)) ? local : `${badgeChoice.url}/small`;
      }

      const photoB64 = await blobToB64(photoBlob);
      const photoPath = `assets/scarves/${slug(latin(clubEn || club)) || "scarf"}-${Date.now().toString(36)}.jpg`;
      const today = new Date().toISOString().slice(0, 10);

      const added = await commitChange(`Add scarf: ${clubEn || club}`, async (data) => {
        const files = [{ path: photoPath, b64: photoB64 }];
        if (newCountry && !base.countries[newCountry.name] && !data.countries[newCountry.name]) {
          data.countries[newCountry.name] = newCountry.entry;
          if (newCountry.flagFile) files.push(newCountry.flagFile);
        }
        const continent = (base.countries[country] || data.countries[country] || {}).continent || "Europe";
        const n = Math.max(0, ...base.scarves.map((s) => s.n), ...data.scarves.map((s) => s.n)) + 1;
        const scarf = {
          n, club, ...(clubEn ? { clubEn } : {}), country, continent, photo: photoPath, logo: null,
          note: $("#note").value.trim(), how: $("#how").value, year: $("#year").value ? +$("#year").value : null,
          official: $("#official").checked, national: $("#national").checked, site: $("#site").value.trim() || null,
          new: true, badge, ...(badgeId ? { badgeId } : {}), added: today,
        };
        data.scarves.push(scarf);
        return { files, result: scarf };
      });

      ok.innerHTML = `Added <b>${esc(added.club)}</b> as #${added.n}. The site updates in a minute or two: <a href="./#/scarf/${added.n}">open its page</a> (refresh if it isn't there yet).`;
      ok.hidden = false;
      resetForm();
      loadRecent();
    } catch (ex) {
      err.textContent = ex.status === 403 || ex.status === 404 ? "GitHub refused the change. The token needs write access to shimapa/alex_flags (Contents: Read and write)." : `Couldn't save: ${ex.message}`;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Add to the collection";
    }
  });

  function resetForm() {
    $("#add-form").reset();
    $("#how").value = "swap";
    photoBlob = null; badgeChoice = null;
    drop.querySelector("img")?.remove();
    drop.classList.remove("has-photo");
    $("#new-country").hidden = true;
    $("#badge-pick").innerHTML = `<p class="hint">Type the team name to look it up on TheSportsDB.</p>`;
    document.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------------------------------------------------------------ recent additions */
  async function loadRecent() {
    const list = $("#recent-list"), empty = $("#recent-empty");
    try {
      const head = (await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`)).object.sha;
      const data = await readAdditions(head);
      fillCountries(data.countries);
      const rows = data.scarves.slice().reverse();
      empty.hidden = rows.length > 0;
      list.innerHTML = rows.map((s) => `
        <li>
          <span class="n">#${s.n}</span>
          <span class="name"><a href="./#/scarf/${s.n}">${esc(s.club)}</a><small>${esc(s.country)} · added ${esc(s.added || "")}</small></span>
          <button type="button" class="btn btn-outline btn-sm" data-remove="${s.n}">Remove</button>
        </li>`).join("");
    } catch (ex) {
      empty.hidden = false;
      empty.textContent = `Couldn't load the list: ${ex.message}`;
    }
  }

  $("#recent-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const n = +btn.dataset.remove;
    const name = btn.closest("li").querySelector(".name a").textContent;
    if (!confirm(`Remove #${n} ${name} from the collection? Its photo is deleted from the repository too.`)) return;
    btn.disabled = true;
    try {
      await commitChange(`Remove scarf #${n}: ${name}`, async (data) => {
        const scarf = data.scarves.find((s) => s.n === n);
        data.scarves = data.scarves.filter((s) => s.n !== n);
        const files = scarf && scarf.photo && scarf.photo.startsWith("assets/scarves/") ? [{ path: scarf.photo, remove: true }] : [];
        return { files, result: null };
      });
      loadRecent();
    } catch (ex) {
      btn.disabled = false;
      alert(`Couldn't remove it: ${ex.message}`);
    }
  });

  // lets tools/test_admin.mjs drive the GitHub part against a throwaway branch
  if (window.__ADMIN_TEST__) window.__ADMIN_TEST__({ commitChange, readAdditions, setToken: (t) => { token = t; }, setBranch: (b) => { BRANCH = b; } });

  /* ------------------------------------------------------------ start */
  let saved = "";
  try { saved = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) {}
  if (saved) {
    signIn(saved, true).catch(() => { token = ""; $("#login").hidden = false; });
  } else {
    $("#login").hidden = false;
  }
})();
