/* Funky Orbit — overview of every pattern on the list (data.json -> "all"). */
(function () {
  "use strict";

  const { esc, fmt, siteswap, syncPattern, cyclicIncludes, clubsOf, throwsOf, localSiteswap, nameLinks, updated, likes, initPopup, openPattern, doneRow, track, trackSearch } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  let ITEMS = [];
  const userOpen = new Set([0]); // families the visitor opened (by number); the first one starts open
  const groupOpen = new Set(); // variation groups the visitor opened ("family nr:group key")
  const groupClosed = new Set(); // groups the visitor closed while a search had opened them (until the search changes)
  // sort and the filters of the Filter & sort panel; all in the URL (#50)
  const filters = {
    sort: "family", mode: "global", period: "all", thrown: "all", video: false, film: false, named: false, lo: 0.5, hi: 5, rlo: 0.5, rhi: 5, clubs: new Set(),
    colorsIn: new Set(), colorsOut: new Set(), throwsIn: new Set(), throwsOut: new Set(),
  };
  const LISTS = { colorsIn: "colorsOut", colorsOut: "colorsIn", throwsIn: "throwsOut", throwsOut: "throwsIn" }; // a value is in one of a pair, never both
  const anyStars = () => filters.lo <= 0.5 && filters.hi >= 5;
  const anyRating = () => filters.rlo <= 0.5 && filters.rhi >= 5; // the full range also shows the patterns without a rating
  const half = (n) => (n % 1 ? `${Math.floor(n) || ""}½` : String(n));
  const SORTS = {
    easy: { title: "Easiest first", dir: 1, value: (p) => p.score },
    hard: { title: "Hardest first", dir: -1, value: (p) => p.score },
    fun: { title: "Most fun first", dir: -1, value: (p) => BEST_RATING.get(p.key) },
    dull: { title: "Least fun first", dir: 1, value: (p) => BEST_RATING.get(p.key) },
  };
  const extraFilters = () => filters.clubs.size + filters.colorsIn.size + filters.colorsOut.size + filters.throwsIn.size + filters.throwsOut.size
    + (filters.period !== "all") + (filters.thrown !== "all") + filters.video + filters.film + filters.named + !anyStars() + !anyRating() + (filters.mode === "local");
  // choosing Local is a filter, but only narrows the list once something is typed
  const filtering = () => !!query.trim() || extraFilters() - (filters.mode === "local") > 0;
  const BEST_RATING = new Map(); // key -> our highest rating, when we threw it more than once
  let query = "";

  const label = (p) => p.ss || `${p.a} | ${p.b}`;
  const colorsOf = (p) => (Array.isArray(p.colors) ? p.colors.join("") : p.colors || "");

  function chip(p, i, extra = "", below = "") {
    const pat = p.ss ? siteswap(p.ss, "sm", p.colors) : syncPattern(p.a, p.b, "sm", p.colors);
    const title = [label(p), p.name, p.family, p.done ? "done" : ""].filter(Boolean).join(" · ");
    // every chip has a tick slot, so done chips don't shift the rest; the name line only when there is a name
    const open = ` role="button" tabindex="0" data-open="${esc(p.key)}" aria-label="${esc(label(p))}: show ${p.done ? "video and " : ""}details"`;
    return `<li class="pat${p.done ? " done" : ""}" data-i="${i}" title="${esc(title)}"${open}>
      ${pat}${extra}<svg class="tick" width="14" height="14" viewBox="0 0 24 24" ${p.done ? 'aria-label="done"' : 'aria-hidden="true"'}><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <small>${nameLinks(p.name)}</small>${below}
    </li>`;
  }

  // width of a pattern in boxes; sync throws like "4p" are a bit wider, plus room for the divider
  function throwWidth(p) {
    if (p.ss) return p.ss.length;
    const n = ((p.a || "") + (p.b || "")).toLowerCase().match(/[0-9a-oq-z]p?/g) || [];
    return n.reduce((w, t) => w + (t.length > 1 ? 1.35 : 1.1), 0.6);
  }

  // Sorted by difficulty or our rating: one flat list of every pattern once, with that value and its families.
  // Ties by siteswap; patterns without a rating come last, both ways.
  function renderSorted() {
    const once = new Map();
    ITEMS.forEach((p, i) => {
      if (!once.has(p.key)) once.set(p.key, { i, families: [] });
      once.get(p.key).families.push(p.family);
    });
    const sort = SORTS[filters.sort];
    const compare = (a, b) => {
      const x = sort.value(a), y = sort.value(b);
      return (x == null) - (y == null) || (x == null ? 0 : sort.dir * (x - y));
    };
    const rows = [...once.values()].sort((a, b) => compare(ITEMS[a.i], ITEMS[b.i]) || label(ITEMS[a.i]).localeCompare(label(ITEMS[b.i])));
    const byRating = filters.sort === "fun" || filters.sort === "dull";
    const value = (p) => (byRating ? BEST_RATING.has(p.key) && `${half(BEST_RATING.get(p.key))} ★ rating` : p.stars != null && `${half(p.stars)} ★ · ${p.score}`);
    const meta = (p, fams) => [value(p), ...fams].filter(Boolean).map(esc).join(" · ");
    $("#list").innerHTML = `<section class="kind"><div class="section-head"><h2>${sort.title}</h2>
      <span class="label" data-count data-total="${rows.length}" data-base="${rows.length} patterns"></span></div>
      <ul class="pats flat">${rows.map((r) => chip(ITEMS[r.i], r.i, "", `<small class="pat-meta">${meta(ITEMS[r.i], r.families)}</small>`)).join("")}</ul></section>`;
  }

  // Sheet order: kinds (Standard, Zaps, Sync) and families in the order they first appear.
  function render() {
    if (filters.sort !== "family") return renderSorted();
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
      html += `<section class="kind" data-kind="${esc(kind)}"><div class="section-head"><h2>${esc(kind)}</h2><span class="label" data-count data-total="${c.total}" data-base="${c.done} / ${c.total} done"></span></div>`;
      for (const [fam, idx] of fams) {
        const f = count(idx);
        // all chips in a family get the width of its longest pattern
        const width = Math.max(...idx.map((i) => throwWidth(ITEMS[i])));
        const nr = famNr++;
        const groups = variationGroups(idx);
        const anyVars = groups.some((g) => g.length > 1);
        html += `<details class="fam-block" data-fam="${nr}"${userOpen.has(nr) ? " open" : ""}>
          <summary><h3>${esc(fam)} <span><span data-count data-total="${f.total}" data-base="${f.done} / ${f.total}"></span> ${chev}</span></h3></summary>
          ${anyVars ? `<div class="fam-tools"><button type="button" class="reset" data-allvars aria-expanded="false">Show all variations</button></div>` : ""}
          <ul class="pats${anyVars ? " has-vars" : ""}" style="--w:${width}">${groups.map((g) => groupHtml(g, nr)).join("")}</ul></details>`;
      }
      html += `</section>`;
    }
    $("#list").innerHTML = html;
  }

  function passesFilters(p) {
    if (filters.clubs.size && !filters.clubs.has(clubsOf(p))) return false;
    if (filters.period === "sync" ? p.kind !== "Sync" : filters.period === "async" ? p.kind === "Sync"
      : filters.period !== "all" && (p.kind === "Sync" || String(p.period) !== filters.period)) return false;
    if (filters.thrown !== "all" && p.done !== (filters.thrown === "yes")) return false;
    if (!anyRating()) {
      const r = BEST_RATING.get(p.key);
      if (r == null || r < filters.rlo || r > filters.rhi) return false;
    }
    const row = doneRow(p.key);
    if (filters.video && !(row && row.youtubeId)) return false;
    if (filters.film && row && row.youtubeId) return false;
    if (filters.named && !(p.name || (row && row.name))) return false;
    if (!anyStars() && (p.stars == null || p.stars < filters.lo || p.stars > filters.hi)) return false;
    const cs = colorsOf(p), ts = throwsOf(p);
    for (const c of filters.colorsIn) if (!cs.includes(c)) return false; // all chosen colours (AND)
    for (const c of filters.colorsOut) if (cs.includes(c)) return false;
    for (const t of filters.throwsIn) if (!ts.has(t)) return false;
    for (const t of filters.throwsOut) if (ts.has(t)) return false;
    return true;
  }

  function matches(p) {
    if (!passesFilters(p)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const qs = q.replace(/\s+/g, "");
    if (filters.mode === "local") return !!p.ss && cyclicIncludes(localSiteswap(p.ss), qs); // sync and popcorn have no local siteswap
    if (p.ss) {
      if (cyclicIncludes(p.ss, qs)) return true;
    } else if ([p.a, p.b, p.a + p.b, p.alt].some((s) => s && s.toLowerCase().replace(/\s+/g, "").includes(qs))) {
      return true;
    }
    return !!p.name && p.name.toLowerCase().includes(q);
  }

  function applyFilter() {
    const active = filtering();
    const shownKeys = new Set();
    const matched = new Map(); // family or kind -> the keys that match, for its count
    groupClosed.clear();
    document.querySelectorAll(".pat").forEach((el) => {
      const p = ITEMS[+el.dataset.i];
      const ok = matches(p);
      el.hidden = !ok;
      if (ok) {
        shownKeys.add(p.key);
        for (const block of [el.closest(".fam-block"), el.closest(".kind")]) {
          if (block) (matched.get(block) || matched.set(block, new Set()).get(block)).add(p.key);
        }
      }
      el.classList.remove("context");
    });
    // a main pattern stays in view when one of its variations matches, dimmed and not counted: only for context
    document.querySelectorAll(".grp").forEach((el) => {
      const main = el.querySelector(".pat");
      if (main.hidden && el.querySelector(".var:not([hidden])")) { main.hidden = false; main.classList.add("context"); }
    });
    updateGroups();
    document.querySelectorAll("[data-count]").forEach((el) => {
      const block = el.closest(".fam-block") || el.closest(".kind");
      el.textContent = active ? `${(matched.get(block) || new Set()).size} of ${el.dataset.total}` : el.dataset.base;
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
    $("#reset").hidden = !active && filters.sort === "family" && filters.mode === "global";
    syncFilterUi();
    const none = $("#none");
    none.hidden = shownKeys.size > 0;
    if (!shownKeys.size) {
      const what = [query.trim() && `“${esc(query.trim())}”`, extraFilters() && "these filters"].filter(Boolean).join(" with ");
      none.innerHTML = `No pattern matches ${what}. <button type="button" class="reset" data-reset>Reset filters</button>`;
    }
    try {
      const url = new URL(location.href);
      query.trim() ? url.searchParams.set("q", query.trim()) : url.searchParams.delete("q");
      const set = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
      set("c", [...filters.colorsIn].join(""));
      set("cx", [...filters.colorsOut].join(""));
      set("t", [...filters.throwsIn].join(""));
      set("tx", [...filters.throwsOut].join(""));
      set("stars", !anyStars() && `${filters.lo}-${filters.hi}`);
      set("sort", filters.sort !== "family" && filters.sort);
      set("m", filters.mode === "local" && "local");
      set("clubs", [...filters.clubs].sort((a, b) => a - b).join(","));
      set("period", filters.period !== "all" && filters.period);
      set("thrown", filters.thrown !== "all" && filters.thrown);
      set("rating", !anyRating() && `${filters.rlo}-${filters.rhi}`);
      set("video", filters.video && "1");
      set("film", filters.film && "1");
      set("named", filters.named && "1");
      history.replaceState(null, "", url);
    } catch (e) {}
  }

  // the buttons of the panel follow the filters; the Filter & sort button says how many are on
  function syncFilterUi() {
    document.querySelectorAll("[data-f]").forEach((seg) => {
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === filters[seg.dataset.f])));
    });
    document.querySelectorAll("[data-club]").forEach((b) => b.setAttribute("aria-pressed", String(filters.clubs.has(+b.dataset.club))));
    document.querySelectorAll("[data-flag]").forEach((b) => b.setAttribute("aria-pressed", String(filters[b.dataset.flag])));
    document.querySelectorAll("[data-list] button").forEach((b) => b.setAttribute("aria-pressed", String(filters[b.parentElement.closest("[data-list]").dataset.list].has(b.dataset.v))));
    const local = filters.mode === "local";
    $("#q").placeholder = local ? "Search local siteswap, e.g. 9667687" : "Search by siteswap or name, e.g. 975 or dragon";
    $("#q").setAttribute("aria-label", local ? "Search patterns by local siteswap" : "Search patterns by siteswap or name");
    const pos = (v) => ((v - 0.5) / 4.5) * 100;
    for (const [lo, hi, name, any] of [["lo", "hi", "range", "Any difficulty"], ["rlo", "rhi", "rating", "Any rating"]]) {
      const a = filters[lo], b = filters[hi];
      $(`#${lo}`).value = a;
      $(`#${hi}`).value = b;
      $(`#${name}-label`).textContent = a <= 0.5 && b >= 5 ? any : a === b ? `${half(a)} ★` : `${half(a)} – ${half(b)} ★`;
      $(`#${name}-fill`).style.left = pos(a) + "%";
      $(`#${name}-fill`).style.right = 100 - pos(b) + "%";
    }
    const n = extraFilters() + (filters.sort !== "family");
    $("#more-n").textContent = n ? ` · ${n}` : "";
  }

  // Variations (#28): a main pattern and the patterns after it with the same group, in Sheet order
  function variationGroups(idx) {
    const groups = [];
    for (const i of idx) {
      const p = ITEMS[i];
      if (p.group && !p.main && groups.length && ITEMS[groups[groups.length - 1][0]].group === p.group) groups[groups.length - 1].push(i);
      else groups.push([i]);
    }
    return groups;
  }

  // A group shows its main pattern with a pill (+6, or 2/9 ✓ when some are done); the pill opens the variations below it
  function groupHtml(g, nr) {
    if (g.length === 1) return chip(ITEMS[g[0]], g[0]);
    const [main, ...vars] = g;
    const id = `${nr}:${ITEMS[main].group}`, done = g.filter((i) => ITEMS[i].done).length;
    const label = done ? `${done}/${g.length} ✓` : `+${vars.length}`;
    const aria = `${vars.length} variation${vars.length === 1 ? "" : "s"}${done ? `, ${done} of ${g.length} done` : ""}`;
    const pill = `<button type="button" class="vars${done ? " some" : ""}" data-grp="${esc(id)}" aria-expanded="false" aria-label="${esc(aria)}">${esc(label)}</button>`;
    return `<li class="grp" data-g="${esc(id)}"><ul>${chip(ITEMS[main], main, pill)}${vars.map((i) => chip(ITEMS[i], i).replace('class="pat', 'class="pat var')).join("")}</ul></li>`;
  }

  // open/closed state of every group: the visitor's choice, or open when a search finds one of its variations
  function updateGroups() {
    const active = filtering();
    document.querySelectorAll(".grp").forEach((el) => {
      // a filter that leaves no variations of a group: no outline and no pill, only the main pattern (if it matches)
      const id = el.dataset.g, some = !!el.querySelector(".var:not([hidden])");
      const open = some && (groupOpen.has(id) || (active && !groupClosed.has(id)));
      el.classList.toggle("open", open);
      const pill = el.querySelector("[data-grp]");
      pill.hidden = active && !some;
      pill.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll("[data-allvars]").forEach((b) => {
      const grps = [...b.closest(".fam-block").querySelectorAll(".grp")].filter((el) => !el.querySelector("[data-grp]").hidden);
      const all = grps.length > 0 && grps.every((el) => el.classList.contains("open"));
      b.parentElement.hidden = !grps.length;
      b.textContent = all ? "Hide all variations" : "Show all variations";
      b.setAttribute("aria-expanded", String(all));
    });
  }




  document.addEventListener("keydown", (ev) => {
    if (ev.target.closest && ev.target.closest("button, a")) return; // a pill, button or link inside a chip handles its own keys
    const el = ev.target.closest && ev.target.closest("[data-open]");
    if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openPattern(el.dataset.open); }
  });

  function updateToggleAll() {
    const shown = [...document.querySelectorAll(".fam-block:not([hidden])")];
    const allOpen = shown.length > 0 && shown.every((el) => el.open);
    const btn = $("#toggle-all");
    btn.hidden = filters.sort !== "family"; // the sorted list has no families to open
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
    const sorted = filters.sort !== "family";
    Object.assign(filters, { sort: "family", mode: "global", period: "all", thrown: "all", video: false, film: false, named: false, lo: 0.5, hi: 5, rlo: 0.5, rhi: 5 });
    for (const k of ["clubs", ...Object.keys(LISTS)]) filters[k].clear();
    if (sorted) render();
    applyFilter();
  }

  $("#q").addEventListener("input", (ev) => { query = ev.target.value; trackSearch(query); applyFilter(); });
  document.addEventListener("click", (ev) => {
    const m = ev.target.closest("[data-list] button");
    if (m) {
      const list = m.closest("[data-list]").dataset.list, v = m.dataset.v, on = !filters[list].has(v);
      on ? filters[list].add(v) : filters[list].delete(v);
      if (on) {
        filters[LISTS[list]].delete(v);
        track(list.startsWith("colors") ? "Colour filter" : "Pattern filter", list.startsWith("colors") ? { colour: v, list } : { filter: list, value: v });
      }
      applyFilter();
      return;
    }
    if (ev.target.closest("#reset, [data-reset]")) { reset(); return; }
    if (ev.target.closest("#more")) {
      const panel = $("#filter-panel");
      panel.hidden = !panel.hidden;
      $("#more").setAttribute("aria-expanded", String(!panel.hidden));
      return;
    }
    const seg = ev.target.closest("[data-f] button");
    if (seg) {
      const f = seg.parentElement.dataset.f;
      if (filters[f] === seg.dataset.v) return;
      filters[f] = seg.dataset.v;
      track(f === "sort" ? "Sort patterns" : "Pattern filter", f === "sort" ? { sort: seg.dataset.v } : { filter: f, value: seg.dataset.v });
      if (f === "sort") render();
      applyFilter();
      return;
    }
    const club = ev.target.closest("[data-club]");
    if (club) {
      const n = +club.dataset.club;
      filters.clubs.has(n) ? filters.clubs.delete(n) : filters.clubs.add(n);
      if (filters.clubs.has(n)) track("Pattern filter", { filter: "clubs", value: String(n) });
      applyFilter();
      return;
    }
    const flag = ev.target.closest("[data-flag]");
    if (flag) {
      filters[flag.dataset.flag] = !filters[flag.dataset.flag];
      if (filters[flag.dataset.flag]) track("Pattern filter", { filter: flag.dataset.flag, value: "on" });
      applyFilter();
      return;
    }
    const grp = ev.target.closest("[data-grp]");
    if (grp) {
      const id = grp.closest(".grp").dataset.g;
      if (grp.getAttribute("aria-expanded") === "true") { groupOpen.delete(id); groupClosed.add(id); }
      else { groupOpen.add(id); groupClosed.delete(id); }
      updateGroups();
      return;
    }
    const allVars = ev.target.closest("[data-allvars]");
    if (allVars) {
      const grps = [...allVars.closest(".fam-block").querySelectorAll(".grp")];
      const open = allVars.getAttribute("aria-expanded") !== "true";
      for (const el of grps) {
        const id = el.dataset.g;
        if (open) { groupOpen.add(id); groupClosed.delete(id); } else { groupOpen.delete(id); groupClosed.add(id); }
      }
      updateGroups();
      return;
    }
    if (ev.target.closest(".name-link")) return; // the link to the story, not the pop-up
    const pat = ev.target.closest("[data-open]");
    if (pat) openPattern(pat.dataset.open);
  });

  for (const [lo, hi] of [["lo", "hi"], ["rlo", "rhi"]]) {
    $("#" + lo).addEventListener("input", (ev) => { filters[lo] = Math.min(parseFloat(ev.target.value), filters[hi]); applyFilter(); });
    $("#" + hi).addEventListener("input", (ev) => { filters[hi] = Math.max(parseFloat(ev.target.value), filters[lo]); applyFilter(); });
  }

  async function start() {
    let data;
    try {
      data = await (await fetch("/data.json", { cache: "no-cache" })).json();
    } catch (e) {
      $("#intro").textContent = "The list could not be loaded. Please try again in a few minutes.";
      return;
    }
    ITEMS = data.all || [];
    initPopup(data);
    for (const p of data.patterns || []) if (p.rating != null && !(BEST_RATING.get(p.key) >= p.rating)) BEST_RATING.set(p.key, p.rating);
    likes.load();
    const keys = new Map(ITEMS.map((p) => [p.key, p.done]));
    const done = [...keys.values()].filter(Boolean).length;
    $("#title").innerHTML = `${fmt.format(keys.size)}<span class="of">patterns · ${fmt.format(done)} done</span>`;
    $("#intro").textContent = "Every pattern on the list, in the order of our spreadsheet. Each digit has the colour of the club it throws. Patterns we have already thrown are marked green: click one to watch its video, or any other pattern for its details. Variations (the same throws in another order) are folded under the first pattern of their group: tap +3 to show them. A few patterns fit two families, so they appear twice.";
    $("#updated").textContent = updated(data.updated);
    const clubs = [...new Set(ITEMS.map(clubsOf))].filter(Number.isInteger).sort((a, b) => a - b);
    $("#f-clubs").innerHTML = clubs.map((n) => `<button type="button" class="chip" data-club="${n}" aria-pressed="false">${n}</button>`).join("");
    // the throws on the list, as in the generator: phones two rows (even and odd throws), wide screens one row from 2 to b
    const allThrows = [...new Set(ITEMS.flatMap((p) => [...throwsOf(p)]))].sort((a, b) => parseInt(a, 36) - parseInt(b, 36));
    const throwRow = (odd) => `<div class="row">${allThrows.filter((t) => parseInt(t, 36) % 2 === (odd ? 1 : 0)).map((t) => `<button type="button" data-v="${esc(t)}" style="order:${parseInt(t, 36)}">${esc(t)}</button>`).join("")}</div>`;
    document.querySelectorAll(".multi.throws").forEach((el) => { el.innerHTML = throwRow(false) + throwRow(true); });
    const params = new URLSearchParams(location.search);
    for (const [k, lo, hi] of [["stars", "lo", "hi"], ["rating", "rlo", "rhi"]]) {
      const m = (params.get(k) || "").match(/^(\d(?:\.5)?)-(\d(?:\.5)?)$/);
      if (m && +m[1] >= 0.5 && +m[2] <= 5 && +m[1] <= +m[2]) { filters[lo] = +m[1]; filters[hi] = +m[2]; }
    }
    for (const [k, list, ok] of [["c", "colorsIn", "WBOR"], ["cx", "colorsOut", "WBOR"], ["t", "throwsIn", allThrows.join("")], ["tx", "throwsOut", allThrows.join("")]]) {
      const text = k.startsWith("c") ? (params.get(k) || "").toUpperCase() : params.get(k) || "";
      for (const v of text) if (ok.includes(v) && !filters[LISTS[list]].has(v)) filters[list].add(v);
    }
    if (SORTS[params.get("sort")]) filters.sort = params.get("sort");
    if (params.get("m") === "local") filters.mode = "local";
    if (["3", "5", "7", "async", "sync"].includes(params.get("period"))) filters.period = params.get("period");
    if (["yes", "no"].includes(params.get("thrown"))) filters.thrown = params.get("thrown");
    filters.video = params.get("video") === "1";
    filters.film = params.get("film") === "1";
    filters.named = params.get("named") === "1";
    for (const n of (params.get("clubs") || "").split(",")) if (clubs.includes(+n)) filters.clubs.add(+n);
    // a link with filters shows them
    if (extraFilters() || filters.sort !== "family") { $("#filter-panel").hidden = false; $("#more").setAttribute("aria-expanded", "true"); }
    render();
    query = params.get("q") || "";
    $("#q").value = query;
    applyFilter();
  }
  start();
})();
