/* Funky Orbit — overview of every pattern on the list (data.json -> "all"). */
(function () {
  "use strict";

  const { esc, fmt, siteswap, syncPattern, cyclicIncludes, updated, stars, difficulty, when, player, likes } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  let ITEMS = [];
  let MAX_SCORE = 0;
  const userOpen = new Set([0]); // families the visitor opened (by number); the first one starts open
  const filtering = () => !!query.trim() || colorFilter.size > 0;
  const DONE = new Map(); // key -> the Done row to show: the newest with a video, else the newest
  let query = "";
  const colorFilter = new Set();

  const label = (p) => p.ss || `${p.a} | ${p.b}`;
  // smallest rotation, the same unique key as in the Sheet
  const minRotation = (ss) => { ss = (ss || "").toLowerCase(); let m = ss; for (let i = 1; i < ss.length; i++) { const r = ss.slice(i) + ss.slice(0, i); if (r < m) m = r; } return m; };
  const colorsOf = (p) => (Array.isArray(p.colors) ? p.colors.join("") : p.colors || "");

  function chip(p, i) {
    const pat = p.ss ? siteswap(p.ss, "sm", p.colors) : syncPattern(p.a, p.b, "sm", p.colors);
    const title = [label(p), p.name, p.family, p.done ? "done" : ""].filter(Boolean).join(" · ");
    // every chip has a tick slot, so done chips don't shift the rest; the name line only when there is a name
    const open = ` role="button" tabindex="0" data-open="${esc(p.key)}" aria-label="${esc(label(p))}: show ${p.done ? "video and " : ""}details"`;
    return `<li class="pat${p.done ? " done" : ""}" data-i="${i}" title="${esc(title)}"${open}>
      ${pat}<svg class="tick" width="14" height="14" viewBox="0 0 24 24" ${p.done ? 'aria-label="done"' : 'aria-hidden="true"'}><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <small>${esc(p.name || "")}</small>
    </li>`;
  }

  // width of a pattern in boxes; sync throws like "4p" are a bit wider, plus room for the divider
  function throwWidth(p) {
    if (p.ss) return p.ss.length;
    const n = ((p.a || "") + (p.b || "")).toLowerCase().match(/[0-9a-oq-z]p?/g) || [];
    return n.reduce((w, t) => w + (t.length > 1 ? 1.35 : 1.1), 0.6);
  }

  // Sheet order: kinds (Standard, Zaps, Sync) and families in the order they first appear.
  function render() {
    const kinds = new Map();
    ITEMS.forEach((p, i) => {
      if (!kinds.has(p.kind)) kinds.set(p.kind, new Map());
      const fams = kinds.get(p.kind);
      if (!fams.has(p.family)) fams.set(p.family, []);
      fams.get(p.family).push(i);
    });
    const count = (idx) => {
      const keys = new Map(idx.map((i) => [ITEMS[i].key, ITEMS[i].done]));
      return { done: [...keys.values()].filter(Boolean).length, total: keys.size };
    };
    let html = "", famNr = 0;
    const chev = `<svg class="chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    for (const [kind, fams] of kinds) {
      const c = count([...fams.values()].flat());
      html += `<section class="kind" data-kind="${esc(kind)}"><div class="section-head"><h2>${esc(kind)}</h2><span class="label">${c.done} / ${c.total} done</span></div>`;
      for (const [fam, idx] of fams) {
        const f = count(idx);
        // all chips in a family get the width of its longest pattern
        const width = Math.max(...idx.map((i) => throwWidth(ITEMS[i])));
        const nr = famNr++;
        html += `<details class="fam-block" data-fam="${nr}"${userOpen.has(nr) ? " open" : ""}>
          <summary><h3>${esc(fam)} <span>${f.done} / ${f.total} ${chev}</span></h3></summary>
          <ul class="pats" style="--w:${width}">${idx.map((i) => chip(ITEMS[i], i)).join("")}</ul></details>`;
      }
      html += `</section>`;
    }
    $("#list").innerHTML = html;
  }

  function matches(p) {
    if (colorFilter.size) {
      const cs = colorsOf(p);
      for (const c of colorFilter) if (!cs.includes(c)) return false; // all chosen colours (AND)
    }
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const qs = q.replace(/\s+/g, "");
    if (p.ss) {
      if (cyclicIncludes(p.ss, qs)) return true;
    } else if ([p.a, p.b, p.a + p.b, p.alt].some((s) => s && s.toLowerCase().replace(/\s+/g, "").includes(qs))) {
      return true;
    }
    return !!p.name && p.name.toLowerCase().includes(q);
  }

  function applyFilter() {
    const active = !!query.trim() || colorFilter.size > 0;
    const shownKeys = new Set();
    document.querySelectorAll(".pat").forEach((el) => {
      const p = ITEMS[+el.dataset.i];
      const ok = matches(p);
      el.hidden = !ok;
      if (ok) shownKeys.add(p.key);
    });
    document.querySelectorAll(".fam-block, .kind").forEach((el) => {
      el.hidden = !el.querySelector(".pat:not([hidden])");
    });
    // searching or filtering opens every family with a result; without a filter the visitor's own choice is back
    document.querySelectorAll(".fam-block").forEach((el) => {
      el.open = active ? !el.hidden : userOpen.has(+el.dataset.fam);
    });
    updateToggleAll();
    const total = new Set(ITEMS.map((p) => p.key)).size;
    $("#count").textContent = active ? `${fmt.format(shownKeys.size)} of ${fmt.format(total)} patterns` : `${fmt.format(total)} patterns`;
    $("#reset").hidden = !active;
    const none = $("#none");
    none.hidden = shownKeys.size > 0;
    if (!shownKeys.size) {
      const what = [query.trim() && `“${esc(query.trim())}”`, colorFilter.size && `all of ${[...colorFilter].map((c) => window.FO.CLUB[c][1]).join(" + ")}`].filter(Boolean).join(" with ");
      none.innerHTML = `No pattern matches ${what}. <button type="button" class="reset" data-reset>Reset filters</button>`;
    }
    try {
      const url = new URL(location.href);
      query.trim() ? url.searchParams.set("q", query.trim()) : url.searchParams.delete("q");
      colorFilter.size ? url.searchParams.set("c", [...colorFilter].join("")) : url.searchParams.delete("c");
      history.replaceState(null, "", url);
    } catch (e) {}
  }

  // ---------- pop-up for a pattern we have thrown: video and details, as on the home page ----------
  // estimated juggling time from the Sheet: "27 min", "2 h 10 min"
  const duration = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

  // Every pattern opens a pop-up: thrown ones with their video and our rating, the others as "Not thrown yet".
  // Both show the families, the known name and the difficulty.
  function openModal(key) {
    const items = ITEMS.filter((x) => x.key === key);
    if (!items.length) return;
    const item = items[0], p = DONE.get(key);
    const families = [...new Set(items.map((x) => x.family))];
    const name = (p && p.name) || item.name;
    const pat = item.kind === "Sync"
      ? syncPattern(item.a, item.b, "lg", item.colors, true)
      : siteswap(item.ss || p.siteswap, "lg", item.colors || (p && p.colors));
    const diff = item.stars != null
      ? `<div class="pop-diff"><span class="pop-label">Difficulty</span> ${difficulty(item, MAX_SCORE, false)}${
        item.minutes ? `<span class="pop-time">· about ${esc(duration(item.minutes))}</span>` : ""}</div>` : "";
    const video = !p ? "" : p.youtubeId
      ? player(p)
      : `<div class="player no-video"><div class="poster">${esc(p.siteswap)}<small>Thrown, video coming soon</small></div></div>`;
    $("#modal-body").innerHTML = `
      <article class="card modal-card${p ? "" : " not-thrown"}">
        ${video}
        <div class="meta">
          <div class="meta-top">
            <div class="title" id="modal-title">${pat}${name ? `<span class="pname">${esc(name)}</span>` : ""}</div>
            ${p && p.youtubeId ? likes.button(p.youtubeId) : ""}
          </div>
          ${p ? "" : `<span class="not-yet">Not thrown yet</span>`}
          <span class="fam">${families.map(esc).join("<br>")}</span>
          ${diff}
          ${p ? `<div class="meta-bottom">${stars(p.rating)}<span class="when">${esc(when(p))}</span></div>` : ""}
        </div>
      </article>`;
    const dlg = $("#modal");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }


  function closeModal() {
    const dlg = $("#modal");
    if (dlg.close) dlg.close(); else dlg.removeAttribute("open");
  }

  // stop the video when the pop-up closes (button, Esc or a click next to it)
  // (the close event comes a moment later: when another pop-up was opened in the meantime, keep that one)
  $("#modal").addEventListener("close", () => { if (!$("#modal").open) $("#modal-body").innerHTML = ""; });
  $("#modal").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) closeModal(); });
  $("#modal-close").addEventListener("click", closeModal);
  document.addEventListener("keydown", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-open]");
    if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openModal(el.dataset.open); }
  });

  function updateToggleAll() {
    const shown = [...document.querySelectorAll(".fam-block:not([hidden])")];
    const allOpen = shown.length > 0 && shown.every((el) => el.open);
    const btn = $("#toggle-all");
    btn.textContent = allOpen ? "Collapse all" : "Expand all";
    btn.setAttribute("aria-expanded", String(allOpen));
  }

  // remember what the visitor opens or closes (not what a search opened)
  $("#list").addEventListener("toggle", (ev) => {
    const el = ev.target;
    if (!el.classList || !el.classList.contains("fam-block")) return;
    if (!filtering()) el.open ? userOpen.add(+el.dataset.fam) : userOpen.delete(+el.dataset.fam);
    updateToggleAll();
  }, true);

  $("#toggle-all").addEventListener("click", () => {
    const shown = [...document.querySelectorAll(".fam-block:not([hidden])")];
    const open = !shown.every((el) => el.open);
    shown.forEach((el) => {
      el.open = open;
      if (!filtering()) open ? userOpen.add(+el.dataset.fam) : userOpen.delete(+el.dataset.fam);
    });
    updateToggleAll();
  });

  function reset() {
    query = "";
    $("#q").value = "";
    colorFilter.clear();
    document.querySelectorAll("[data-c]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    applyFilter();
  }

  $("#q").addEventListener("input", (ev) => { query = ev.target.value; applyFilter(); });
  document.addEventListener("click", (ev) => {
    const c = ev.target.closest("[data-c]");
    if (c) {
      const on = c.getAttribute("aria-pressed") !== "true";
      c.setAttribute("aria-pressed", String(on));
      on ? colorFilter.add(c.dataset.c) : colorFilter.delete(c.dataset.c);
      applyFilter();
      return;
    }
    if (ev.target.closest("#reset, [data-reset]")) { reset(); return; }
    const pat = ev.target.closest("[data-open]");
    if (pat) openModal(pat.dataset.open);
  });

  async function start() {
    let data;
    try {
      data = await (await fetch("/data.json", { cache: "no-cache" })).json();
    } catch (e) {
      $("#intro").textContent = "The list could not be loaded. Please try again in a few minutes.";
      return;
    }
    ITEMS = data.all || [];
    MAX_SCORE = Math.max(0, ...ITEMS.map((x) => x.score || 0));
    for (const p of data.patterns || []) { // Done, newest first
      const key = p.key || minRotation(p.siteswap); // older data.json without keys
      const have = DONE.get(key);
      if (!have || (!have.youtubeId && p.youtubeId)) DONE.set(key, p);
    }
    likes.load();
    const keys = new Map(ITEMS.map((p) => [p.key, p.done]));
    const done = [...keys.values()].filter(Boolean).length;
    $("#title").innerHTML = `${fmt.format(keys.size)}<span class="of">patterns · ${fmt.format(done)} done</span>`;
    $("#intro").textContent = "Every pattern on the list, in the order of our spreadsheet. Each digit has the colour of the club it throws. Patterns we have already thrown are marked green: click one to watch its video, or any other pattern for its details. A few patterns fit two families, so they appear twice.";
    $("#updated").textContent = updated(data.updated);
    render();
    const params = new URLSearchParams(location.search);
    query = params.get("q") || "";
    $("#q").value = query;
    for (const c of (params.get("c") || "").toUpperCase()) {
      if ("WBOR".includes(c)) {
        colorFilter.add(c);
        const b = document.querySelector(`[data-c="${c}"]`);
        if (b) b.setAttribute("aria-pressed", "true");
      }
    }
    applyFilter();
  }
  start();
})();
