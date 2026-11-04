/* Funky Orbit — reads data.json (refreshed by the sync daily and when we log a pattern) and the likes API. */
(function () {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const { esc, fmt, siteswap, syncPattern, cyclicIncludes, matchesLocal, localTag, stars, when, day, thumb, likes, initPopup, openPattern, nameLinks, videoIcon, track, trackSearch } = window.FO;

  // ---------- formatting helpers ----------
  function splitGroup(name) {
    const i = name.indexOf(" - ");
    return i > 0 ? [name.slice(0, i), name.slice(i + 3)] : [name, ""];
  }

  // ---------- progress ----------
  function renderHero(d) {
    const pct = d.total ? (d.done / d.total) * 100 : 0;
    $("#hero").innerHTML = `
      <span class="label">Project Funky Orbit by Piet &amp; Mees</span>
      <h1 class="num">${fmt.format(d.done)}<span class="of">of ${fmt.format(d.total)} patterns · ${pct.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%</span></h1>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${d.total}" aria-valuenow="${d.done}" aria-label="Total progress"><i style="width:${pct}%"></i></div>
      <div class="hero-body">
      <div class="intro">
        <p>We are passing all ${fmt.format(d.total)} club patterns from James Francis' <a href="https://docs.google.com/spreadsheets/d/1NpMVAcPrU1GTDfDsnxD0ERQxB7KFjGT_iaI7GU5Sw_Q/edit?usp=sharing" target="_blank" rel="noopener" data-umami-event="Outbound link" data-umami-event-to="James Francis list">latest list</a>. Many passers have already done some of these patterns (Brook did <span class="tip" tabindex="0">516 patterns<span class="tip-text" role="tooltip">Brook counted every sync pattern twice, once for each side, so 190 of the 516 are sync sides. We count each sync pattern once: 101 on our list, of which Brook did 94.</span></span>). Our goal: every pattern for at least 2 rounds (3 for period 3), recorded on video. Follow along and cheer us on!</p>
        <div class="more" id="intro-more" aria-hidden="true" inert><div>
          <p>Most patterns are made up of different orbits: groups of clubs that follow their own path through the pattern. We use clubs in different colours so you can see each orbit, which makes it a lot easier to follow what's going on.</p>
        </div></div>
        <button type="button" class="read-more" aria-expanded="false" aria-controls="intro-more">
          <span>Read more</span>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
        </button>
      </div>
      <dl class="facts">
        <div><dt>videos</dt><dd>${d.stats.videos}</dd></div>
        <div><dt>practice days</dt><dd>${d.stats.recordingDays}</dd></div>
        <div><dt>avg. rating</dt><dd>${d.stats.averageRating != null ? d.stats.averageRating + " ★" : "–"}</dd></div>
        <div><dt>last session</dt><dd>${d.stats.lastDate ? new Date(d.stats.lastDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–"}</dd></div>
      </dl>
      </div>`;
  }

  // Top level: Period 3 / 5 / 7 and Sync (from the Statistics block), each opening its groups.
  let openTile = null;

  function tileOf(groupName) {
    if (groupName === "Sync" || groupName.startsWith("Sync ")) return "Sync";
    const m = splitGroup(groupName)[1].match(/^Period \d+$/);
    return m ? m[0] : "Other periods";
  }

  function tiles(d) {
    const out = (d.summary || []).map((t) => ({ ...t }));
    const names = new Set(out.map((t) => t.name));
    for (const g of d.groups) {
      const name = tileOf(g.name);
      if (names.has(name)) continue;
      let t = out.find((x) => x.name === name && x.fromGroups);
      if (!t) { t = { name, total: 0, done: 0, fromGroups: true }; out.push(t); }
      t.total += g.total; t.done += g.done;
    }
    return out;
  }

  function renderGroups(d) {
    $("#tiles").innerHTML = tiles(d).map((t) => {
      const p = t.total ? (t.done / t.total) * 100 : 0;
      const open = openTile === t.name;
      return `<button type="button" class="tile" data-tile="${esc(t.name)}" aria-expanded="${open}" aria-controls="detail">
        <span class="t-name">${esc(t.name)}</span>
        <span class="t-count"><b>${fmt.format(t.done)}</b> / ${fmt.format(t.total)}</span>
        <span class="bar sm"><i class="${t.done ? "some" : ""}" style="width:${p}%"></i></span>
        <svg class="chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      </button>`;
    }).join("");

    const detail = $("#detail");
    detail.hidden = !openTile;
    if (!openTile) { detail.innerHTML = ""; return; }
    const shown = d.groups.filter((g) => tileOf(g.name) === openTile);
    const blocks = shown.map((g) => {
      const [fam, sub] = splitGroup(g.name);
      const title = shown.length > 1 || sub ? fam : g.name;
      const cats = g.categories.map((c) => {
        const p = c.total ? (c.done / c.total) * 100 : 0;
        return `<div class="cat"><span>${esc(c.name)}</span>
          <div class="bar sm"><i class="${c.done ? "some" : ""}" style="width:${p}%"></i></div>
          <span class="n"><b>${c.done}</b>/${c.total}</span></div>`;
      }).join("");
      return `<div class="block"><h3>${esc(title)} <span>${g.done} / ${g.total}</span></h3>${cats}</div>`;
    }).join("");
    const catSum = d.groups.reduce((n, g) => n + g.total, 0);
    const extra = catSum - d.total;
    const note = extra > 0
      ? `<p class="note">${extra} patterns fit in two categories, so they are counted twice in the category lists. In total there are ${fmt.format(d.total)} unique patterns.</p>`
      : "";
    detail.innerHTML = blocks + note;
  }

  // ---------- search and date filter ----------
  let query = "";
  let dateFrom = "", dateTo = ""; // YYYY-MM-DD, both inclusive; empty = no limit
  let customDates = false; // "Choose dates…" picked: keep showing the two date fields

  function matches(p, q) {
    if (dateFrom && (!p.date || p.date < dateFrom)) return false;
    if (dateTo && (!p.date || p.date > dateTo)) return false;
    if (!q) return true;
    // A siteswap is cyclic, so 6966 also finds 9666: search in the pattern written twice.
    const qs = q.replace(/\s+/g, "");
    if (cyclicIncludes(p.siteswap, qs)) return true;
    return (p.name || "").toLowerCase().includes(q) || matchesLocal(p.siteswap, qs);
  }

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function quickRange(v) {
    const now = new Date();
    if (v === "week") { const m = new Date(now); m.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return [iso(m), iso(now)]; }
    if (v === "month") return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)];
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return [v, v];
    return ["", ""];
  }

  // the choices: all dates, this week, this month, every practice day, or your own range
  function renderDateChoices(d) {
    const days = new Map();
    for (const p of d.patterns) if (p.date) days.set(p.date, (days.get(p.date) || 0) + 1);
    const opts = [["", "All dates"], ["week", "This week"], ["month", "This month"]];
    const dayOpts = [...days].sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dt, n]) => `<option value="${dt}">${esc(day(dt))} · ${n} pattern${n === 1 ? "" : "s"}</option>`).join("");
    $("#date").innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("") +
      (dayOpts ? `<optgroup label="Practice days">${dayOpts}</optgroup>` : "") + `<option value="custom">Choose dates…</option>`;
  }

  function syncDateUi() {
    const sel = $("#date");
    let v = "custom";
    if (!customDates) {
      if (!dateFrom && !dateTo) v = "";
      else for (const c of ["week", "month", dateFrom]) {
        const [f, t] = quickRange(c);
        if (f === dateFrom && t === dateTo && [...sel.options].some((o) => o.value === c)) { v = c; break; }
      }
    }
    sel.value = v;
    $("#date-range").hidden = sel.value !== "custom";
    $("#from").value = dateFrom;
    $("#to").value = dateTo;
    $("#date-clear").hidden = !dateFrom && !dateTo;
  }

  function saveUrl() {
    try {
      const url = new URL(location.href);
      const set = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
      set("q", query.trim()); set("from", dateFrom); set("to", dateTo);
      history.replaceState(null, "", url);
    } catch (e) {}
  }

  // ---------- Latest patterns and Latest videos: both follow the search and the dates ----------
  const ROW_STEP = 10, STILL_STEP = 12, AUTO_LOADS = 3; // after that a button, so the footer stays in reach
  let rowsShown = ROW_STEP, stillsShown = STILL_STEP, autoLoads = 0;
  let ROWS = [], VIDS = []; // what the filter leaves

  const throwCount = (s) => (s.match(/[0-9a-oq-z]p?/gi) || []).length;
  const thrown = (p, size) => {
    const item = (DATA.all || []).find((x) => x.key === p.key);
    return item && item.kind === "Sync" ? syncPattern(item.a, item.b, size, item.colors) : siteswap(p.siteswap, size, p.colors);
  };

  function renderRows(q) {
    const filtering = !!q || !!dateFrom || !!dateTo;
    const total = DATA.patterns.length;
    const shown = ROWS.slice(0, rowsShown);
    $("#rows-count").textContent = filtering ? `${ROWS.length} of ${total} match` : `${shown.length} of ${total}`;
    const what = [q && `“${esc(query.trim())}”`, (dateFrom || dateTo) && "these dates"].filter(Boolean).join(" in ");
    $("#rows").innerHTML = shown.length ? shown.map((p, i) => `<li class="row${throwCount(p.siteswap) > 8 ? " long" : ""}" data-row="${i}" role="button" tabindex="0" aria-label="${esc(p.siteswap)}: show details">
        <span class="row-pat">${thrown(p, "sm")}${p.firstTry ? `<span class="first-try small">First try!</span>` : ""}${localTag(p.siteswap, p.name, q)}${p.name ? `<span class="row-name">${nameLinks(p.name)}</span>` : ""}</span>
        <span class="row-sub">${stars(p.rating)}<span class="when">${esc(when(p))}</span></span>
        ${videoIcon(p)}
      </li>`).join("") : `<li class="empty">${filtering ? `No pattern matches ${what}.` : "No patterns yet. Check back soon!"}</li>`;
    $("#rows-more").hidden = ROWS.length <= rowsShown;
  }

  function renderStills(q) {
    const filtering = !!q || !!dateFrom || !!dateTo;
    const all = DATA.patterns.filter((p) => p.youtubeId).length;
    const plural = (n) => `${n} video${n === 1 ? "" : "s"}`;
    $("#feed-count").textContent = filtering ? `${VIDS.length} of ${plural(all)} match` : `${plural(all)}, newest first`;
    const what = [q && `“${esc(query.trim())}”`, (dateFrom || dateTo) && "these dates"].filter(Boolean).join(" in ");
    $("#stills").innerHTML = VIDS.length
      ? VIDS.slice(0, stillsShown).map((p, i) => `<button type="button" class="still" data-still="${i}" style="--n:${throwCount(p.siteswap)}" aria-label="Play video of ${esc(p.siteswap)}">
          ${thumb(p, "(max-width: 599px) 33vw, 200px")}<span class="still-ss">${thrown(p, "sm")}</span></button>`).join("")
      : `<p class="empty">${filtering ? `No video matches ${what}.` : "No videos yet. Check back soon!"}</p>`;
    const more = VIDS.length > stillsShown;
    $("#stills-more").hidden = !more || autoLoads < AUTO_LOADS;
    // scrolling to the end loads more by itself a few times
    stillWatcher.disconnect();
    if (more && autoLoads < AUTO_LOADS) stillWatcher.observe($("#stills-end"));
  }

  const stillWatcher = new IntersectionObserver((seen) => {
    if (!seen.some((e) => e.isIntersecting)) return;
    autoLoads++;
    stillsShown += STILL_STEP;
    renderStills(query.trim().toLowerCase());
  }, { rootMargin: "200px" });

  // after a new search or date: back to the start of both lists
  function renderFeed() {
    const q = query.trim().toLowerCase();
    rowsShown = ROW_STEP; stillsShown = STILL_STEP; autoLoads = 0;
    ROWS = DATA.patterns.filter((p) => matches(p, q));
    VIDS = ROWS.filter((p) => p.youtubeId);
    renderRows(q);
    renderStills(q);
  }

  // ---------- events ----------
  $("#search").addEventListener("input", (ev) => {
    query = ev.target.value;
    trackSearch(query);
    saveUrl();
    if (DATA) renderFeed();
  });

  $("#date").addEventListener("change", (ev) => {
    const v = ev.target.value;
    customDates = v === "custom";
    track("Date filter", { range: v || "all" });
    if (!customDates) [dateFrom, dateTo] = quickRange(v);
    syncDateUi(); saveUrl();
    if (DATA) renderFeed();
  });
  for (const id of ["from", "to"]) {
    $("#" + id).addEventListener("change", (ev) => {
      if (id === "from") dateFrom = ev.target.value; else dateTo = ev.target.value;
        saveUrl(); $("#date-clear").hidden = !dateFrom && !dateTo;
      if (DATA) renderFeed();
    });
  }
  $("#date-clear").addEventListener("click", () => {
    dateFrom = dateTo = ""; customDates = false;
    $("#date").value = ""; syncDateUi(); saveUrl();
    if (DATA) renderFeed();
  });


  $("#rows-more").addEventListener("click", () => { rowsShown += ROW_STEP; renderRows(query.trim().toLowerCase()); });
  $("#stills-more").addEventListener("click", () => { stillsShown += STILL_STEP; renderStills(query.trim().toLowerCase()); });
  document.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("[data-row]")) {
      ev.preventDefault();
      const p = ROWS[+ev.target.dataset.row];
      openPattern(p.key, { row: p });
    }
  });

  document.addEventListener("click", (ev) => {
    if (ev.target.closest(".name-link")) return; // the link to the story, not the pop-up
    const row = ev.target.closest("[data-row]");
    if (row) { const p = ROWS[+row.dataset.row]; openPattern(p.key, { row: p }); return; }
    const still = ev.target.closest("[data-still]");
    if (still) { const i = +still.dataset.still; openPattern(VIDS[i].key, { list: VIDS, index: i }); return; }
    // the orbit explanation in the intro folds open and closed
    const more = ev.target.closest(".read-more");
    if (more) {
      const open = more.getAttribute("aria-expanded") !== "true";
      const box = document.getElementById("intro-more");
      more.setAttribute("aria-expanded", String(open));
      more.querySelector("span").textContent = open ? "Read less" : "Read more";
      box.classList.toggle("open", open);
      box.setAttribute("aria-hidden", String(!open));
      open ? box.removeAttribute("inert") : box.setAttribute("inert", "");
      return;
    }
    const tile = ev.target.closest("[data-tile]");
    if (tile) {
      const name = tile.dataset.tile;
      openTile = openTile === name ? null : name;
      if (openTile) track("Open group", { group: name });
      renderGroups(DATA);
      const again = document.querySelector(`[data-tile="${CSS.escape(name)}"]`);
      if (again) again.focus();
      return;
    }
  });

  // ---------- start ----------
  let DATA = null;

  async function start() {
    try {
      DATA = window.FUNKY_DATA || (await (await fetch("data.json", { cache: "no-cache" })).json());
    } catch (e) {
      $("#hero").innerHTML = `<p class="empty">Progress could not be loaded. Please try again in a few minutes.</p>`;
      return;
    }
    if (DATA.updated) {
      $("#updated").textContent = window.FO.updated(DATA.updated);
    }
    const params = new URLSearchParams(location.search);
    query = params.get("q") || "";
    $("#search").value = query;
    const okDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
    dateFrom = okDate(params.get("from")); dateTo = okDate(params.get("to"));
    renderDateChoices(DATA);
    syncDateUi();
    renderHero(DATA);
    renderGroups(DATA);
    initPopup(DATA);
    await likes.load();
    renderFeed();
  }
  start();
})();
