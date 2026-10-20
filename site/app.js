/* Funky Orbit — reads data.json (refreshed hourly by the sync) and the likes API. */
(function () {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const { esc, fmt, siteswap, cyclicIncludes, stars, when, day, player, likes } = window.FO;

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
        <p>We are passing all ${fmt.format(d.total)} club patterns from James Francis' <a href="https://docs.google.com/spreadsheets/d/1NpMVAcPrU1GTDfDsnxD0ERQxB7KFjGT_iaI7GU5Sw_Q/edit?usp=sharing" target="_blank" rel="noopener">list</a>. Many passers have already done some of these patterns (Brook almost finished the whole list and only has 5 left). Our goal: every pattern for at least 2 rounds (3 for period 3), recorded on video. Follow along and cheer us on!</p>
        <p>Most patterns are made up of different orbits: groups of clubs that follow their own path through the pattern. We use clubs in different colours so you can see each orbit, which makes it a lot easier to follow what's going on.</p>
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

  // ---------- video feed ----------
  // ---------- search, date filter and pages of videos ----------
  let query = "";
  let dateFrom = "", dateTo = ""; // YYYY-MM-DD, both inclusive; empty = no limit
  let customDates = false; // "Choose dates…" picked: keep showing the two date fields
  let page = 0;
  const narrow = window.matchMedia("(max-width: 700px)");
  const pageSize = () => (narrow.matches ? 3 : 6);

  function matches(p, q) {
    if (dateFrom && (!p.date || p.date < dateFrom)) return false;
    if (dateTo && (!p.date || p.date > dateTo)) return false;
    if (!q) return true;
    // A siteswap is cyclic, so 6966 also finds 9666: search in the pattern written twice.
    if (cyclicIncludes(p.siteswap, q.replace(/\s+/g, ""))) return true;
    return (p.name || "").toLowerCase().includes(q);
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

  function card(p) {
    return `
      <article class="card">
        ${player(p)}
        <div class="meta">
          <div class="meta-top">
            <div class="title">${siteswap(p.siteswap, "lg", p.colors)}${p.name ? `<span class="pname">${esc(p.name)}</span>` : ""}</div>
            ${likes.button(p.youtubeId)}
          </div>
          <span class="fam">${esc(p.family)}</span>
          <div class="meta-bottom">${stars(p.rating)}<span class="when">${esc(when(p))}</span></div>
        </div>
      </article>`;
  }

  function renderFeed(d) {
    const q = query.trim().toLowerCase();
    const filtering = !!q || !!dateFrom || !!dateTo;
    const allVids = d.patterns.filter((p) => p.youtubeId);
    const vids = allVids.filter((p) => matches(p, q)); // search and dates look at all videos
    const plural = (n) => `${n} video${n === 1 ? "" : "s"}`;
    $("#feed-count").textContent = filtering
      ? `${vids.length} of ${plural(allVids.length)} match`
      : `${plural(allVids.length)}, newest first`;

    // only one page of videos at a time: 3 on a phone, 6 on a wider screen
    const size = pageSize();
    const pages = Math.max(1, Math.ceil(vids.length / size));
    page = Math.min(Math.max(0, page), pages - 1);
    const shown = vids.slice(page * size, page * size + size);

    const restMatch = d.patterns.some((p) => !p.youtubeId && matches(p, q));
    const what = [q && `“${esc(query.trim())}”`, (dateFrom || dateTo) && "these dates"].filter(Boolean).join(" in ");
    const none = filtering
      ? `<p class="empty">No video matches ${what}${restMatch ? " yet, but there are thrown patterns: see the list below." : "."}</p>`
      : `<p class="empty">No videos yet. Check back soon!</p>`;
    $("#feed").innerHTML = shown.length ? shown.map(card).join("") : none;

    $("#pager").hidden = vids.length <= size;
    $("#newer").disabled = page === 0;
    $("#older").disabled = page >= pages - 1;
    $("#page-info").textContent = vids.length ? `${page * size + 1}–${page * size + shown.length} of ${vids.length}` : "";

    const rest = d.patterns.filter((p) => !p.youtubeId && matches(p, q));
    $("#rest-wrap").hidden = !rest.length;
    $("#rest").innerHTML = rest.map((p) => `<tr>
      <td>${siteswap(p.siteswap, "sm", p.colors)}</td><td>${esc(p.name)}</td><td>${esc(p.family)}</td>
      <td>${stars(p.rating)}</td><td class="num">${esc(when(p))}</td></tr>`).join("");
  }

  function go(step) {
    page += step;
    renderFeed(DATA);
    const head = document.getElementById("h-feed");
    if (head && head.getBoundingClientRect().top < 0) head.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- events ----------
  $("#search").addEventListener("input", (ev) => {
    query = ev.target.value;
    page = 0;
    saveUrl();
    if (DATA) renderFeed(DATA);
  });

  $("#date").addEventListener("change", (ev) => {
    const v = ev.target.value;
    customDates = v === "custom";
    if (!customDates) [dateFrom, dateTo] = quickRange(v);
    page = 0;
    syncDateUi(); saveUrl();
    if (DATA) renderFeed(DATA);
  });
  for (const id of ["from", "to"]) {
    $("#" + id).addEventListener("change", (ev) => {
      if (id === "from") dateFrom = ev.target.value; else dateTo = ev.target.value;
      page = 0;
      saveUrl(); $("#date-clear").hidden = !dateFrom && !dateTo;
      if (DATA) renderFeed(DATA);
    });
  }
  $("#date-clear").addEventListener("click", () => {
    dateFrom = dateTo = ""; page = 0; customDates = false;
    $("#date").value = ""; syncDateUi(); saveUrl();
    if (DATA) renderFeed(DATA);
  });

  $("#newer").addEventListener("click", () => go(-1));
  $("#older").addEventListener("click", () => go(1));
  // swipe on a phone: to the left for older videos, to the right for newer ones
  let touchX = null;
  $("#feed").addEventListener("touchstart", (ev) => { touchX = ev.touches[0].clientX; }, { passive: true });
  $("#feed").addEventListener("touchend", (ev) => {
    if (touchX == null || $("#pager").hidden) return;
    const dx = ev.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && !$("#older").disabled) go(1);
    if (dx > 0 && !$("#newer").disabled) go(-1);
  }, { passive: true });
  narrow.addEventListener("change", () => { if (DATA) renderFeed(DATA); });

  document.addEventListener("click", (ev) => {
    const tile = ev.target.closest("[data-tile]");
    if (tile) {
      const name = tile.dataset.tile;
      openTile = openTile === name ? null : name;
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
    await likes.load();
    renderFeed(DATA);
  }
  start();
})();
