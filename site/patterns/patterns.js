/* Funky Orbit — overview of every pattern on the list (data.json -> "all"). */
(function () {
  "use strict";

  const { esc, fmt, siteswap, syncPattern, cyclicIncludes, updated } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  let ITEMS = [];
  let query = "";
  const colorFilter = new Set();

  const label = (p) => p.ss || `${p.a} | ${p.b}`;
  const colorsOf = (p) => (Array.isArray(p.colors) ? p.colors.join("") : p.colors || "");

  function chip(p, i) {
    const pat = p.ss ? siteswap(p.ss, "sm", p.colors) : syncPattern(p.a, p.b, "sm", p.colors);
    const title = [label(p), p.name, p.family, p.done ? "done" : ""].filter(Boolean).join(" · ");
    // every chip has the same parts (tick slot, name line), so done or named chips don't shift the rest
    return `<li class="pat${p.done ? " done" : ""}" data-i="${i}" title="${esc(title)}">
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
    let html = "";
    for (const [kind, fams] of kinds) {
      const c = count([...fams.values()].flat());
      html += `<section class="kind" data-kind="${esc(kind)}"><div class="section-head"><h2>${esc(kind)}</h2><span class="label">${c.done} / ${c.total} done</span></div>`;
      for (const [fam, idx] of fams) {
        const f = count(idx);
        // all chips in a family get the width of its longest pattern; a name line only when some have a name
        const width = Math.max(...idx.map((i) => throwWidth(ITEMS[i])));
        const named = idx.some((i) => ITEMS[i].name);
        html += `<div class="fam-block"><h3>${esc(fam)} <span>${f.done} / ${f.total}</span></h3>
          <ul class="pats${named ? " named" : ""}" style="--w:${width}">${idx.map((i) => chip(ITEMS[i], i)).join("")}</ul></div>`;
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
    if (ev.target.closest("#reset, [data-reset]")) reset();
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
    const keys = new Map(ITEMS.map((p) => [p.key, p.done]));
    const done = [...keys.values()].filter(Boolean).length;
    $("#title").innerHTML = `${fmt.format(keys.size)}<span class="of">patterns · ${fmt.format(done)} done</span>`;
    $("#intro").textContent = "Every pattern on the list, in the order of our spreadsheet. Each digit has the colour of the club it throws. Patterns we have already thrown are marked green. A few patterns fit two families, so they appear twice.";
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
