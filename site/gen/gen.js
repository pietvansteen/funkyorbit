/* Funky Orbit — pattern generator: picks the next pattern to throw and film. */
(function () {
  "use strict";

  const { esc, fmt, siteswap, syncPattern, updated } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  const DEFAULTS = { period: "any", sync: false, colorsIn: [], colorsOut: [], throwsIn: [], throwsOut: [], skipfam: true, lo: 0.5, hi: 5 };
  const LISTS = { colorsIn: "colorsOut", colorsOut: "colorsIn", throwsIn: "throwsOut", throwsOut: "throwsIn" };
  let opts = { ...DEFAULTS };
  try { opts = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("fo_gen") || "{}") }; } catch (e) {}
  for (const k of Object.keys(LISTS)) if (!Array.isArray(opts[k])) opts[k] = [];
  if (opts.color && opts.color !== "any" && !opts.colorsIn.length) opts.colorsIn = [opts.color]; // older saved option
  delete opts.color;
  const save = () => { try { localStorage.setItem("fo_gen", JSON.stringify(opts)); } catch (e) {} };

  let PATTERNS = []; // one entry per unique pattern (key), with all its families
  let lastFilmed = null;
  let current = null;

  const half = (n) => (n % 1 ? `${Math.floor(n) || ""}½` : String(n));
  const colorsOf = (p) => (Array.isArray(p.colors) ? p.colors.join("") : p.colors || "");

  // A sync throw counts as the siteswap throw with the same spin (as in the difficulty rules):
  // 3p ~ 7 single pass, 4p ~ 9 double pass, 5p ~ b triple pass, 3 ~ 6, 4 ~ 8, 5 ~ a, 1 ~ 2 zip
  const SYNC_AS = { "3p": "7", "4p": "9", "5p": "b", "3": "6", "4": "8", "5": "a", "1": "2" };
  function throwsOf(p) {
    if (p._throws) return p._throws;
    const t = p.ss
      ? [...p.ss.toLowerCase()]
      : (((p.a || "") + " " + (p.b || "")).toLowerCase().match(/[0-9a-oq-z]p?/g) || []).map((x) => SYNC_AS[x] || x);
    return (p._throws = new Set(t));
  }

  // data.json "all" lists a pattern once per family; merge them by key.
  function build(data) {
    const byKey = new Map();
    for (const p of data.all || []) {
      if (!byKey.has(p.key)) byKey.set(p.key, { ...p, families: [] });
      byKey.get(p.key).families.push(p.family);
    }
    PATTERNS = [...byKey.values()];
    lastFilmed = (data.patterns || [])[0] || null; // Done, newest first (date + time)
  }

  function candidates() {
    const lastFam = lastFilmed && lastFilmed.family;
    const full = opts.lo <= 0.5 && opts.hi >= 5;
    return PATTERNS.filter((p) => {
      if (p.done) return false;
      if (p.kind === "Sync") {
        if (!opts.sync || opts.period !== "any") return false;
      } else if (opts.period !== "any" && String(p.period) !== opts.period) return false;
      const cs = colorsOf(p), ts = throwsOf(p);
      if (opts.colorsIn.some((c) => !cs.includes(c)) || opts.colorsOut.some((c) => cs.includes(c))) return false;
      if (opts.throwsIn.some((t) => !ts.has(t)) || opts.throwsOut.some((t) => ts.has(t))) return false;
      if (opts.skipfam && lastFam && p.families.includes(lastFam)) return false;
      if (!full && (p.stars == null || p.stars < opts.lo || p.stars > opts.hi)) return false;
      return true;
    });
  }

  function show(p) {
    const box = $("#pick");
    if (!p) {
      box.innerHTML = `<p class="empty">No pattern left with these options. Try another period, colour or difficulty.</p>`;
      return;
    }
    const pat = p.ss ? siteswap(p.ss, "xl", p.colors) : syncPattern(p.a, p.b, "xl", p.colors);
    const pct = p.stars != null ? (p.stars / 5) * 100 : 0;
    const cat = p.kind === "Sync" ? "Sync" : `${p.kind} · period ${p.period}`;
    box.innerHTML = `
      <div class="pick-pat">${pat}</div>
      ${p.name ? `<p class="pick-name">${esc(p.name)}</p>` : ""}
      <dl class="pick-meta">
        <div><dt>Family</dt><dd>${p.families.map(esc).join("<br>")}</dd></div>
        <div><dt>Category</dt><dd>${esc(cat)}</dd></div>
        <div><dt>Difficulty</dt><dd>${p.stars != null
          ? `<span class="stars" style="--pct:${pct}%" role="img" aria-label="${p.stars} out of 5 stars"></span> <span class="score" title="difficulty score">${half(p.stars)} ★ · ${p.score}</span>`
          : "–"}</dd></div>
      </dl>`;
  }

  function draw() {
    const pool = candidates();
    let options = pool;
    if (current && pool.length > 1) options = pool.filter((p) => p.key !== current.key); // never the same twice in a row
    current = options.length ? options[Math.floor(Math.random() * options.length)] : null;
    show(current);
  }

  function syncUi() {
    document.querySelectorAll(".seg").forEach((seg) => {
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(opts[seg.dataset.opt]))));
    });
    document.querySelectorAll("[data-list]").forEach((g) => {
      g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(opts[g.dataset.list].includes(b.dataset.v))));
    });
    $("#sync").checked = opts.sync;
    $("#skipfam").checked = opts.skipfam;
    $("#sync-note").textContent = opts.sync && opts.period !== "any"
      ? "Sync patterns are only picked with period Any."
      : "Sync patterns can be picked too (with period Any).";
    $("#lo").value = opts.lo;
    $("#hi").value = opts.hi;
    const full = opts.lo <= 0.5 && opts.hi >= 5;
    $("#range-label").textContent = full ? "Any difficulty" : opts.lo === opts.hi ? `${half(opts.lo)} ★` : `${half(opts.lo)} – ${half(opts.hi)} ★`;
    $("#stars-reset").hidden = full;
    const pos = (v) => ((v - 0.5) / 4.5) * 100;
    $("#range-fill").style.left = pos(opts.lo) + "%";
    $("#range-fill").style.right = 100 - pos(opts.hi) + "%";
    const n = candidates().length;
    $("#pool").textContent = PATTERNS.length ? `${fmt.format(n)} pattern${n === 1 ? "" : "s"} to choose from` : "";
  }

  function changed(redraw = true) {
    save();
    syncUi();
    if (!redraw || !PATTERNS.length) return;
    // keep the current pick when it still fits the options
    if (!current || !candidates().some((p) => p.key === current.key)) draw();
  }

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest(".seg button");
    if (b) { opts[b.parentElement.dataset.opt] = b.dataset.v; changed(); return; }
    const m = ev.target.closest("[data-list] button");
    if (m) {
      // a colour or throw is either in "must contain" or in "leave out", never both
      const list = m.closest("[data-list]").dataset.list, v = m.dataset.v;
      if (opts[list].includes(v)) opts[list] = opts[list].filter((x) => x !== v);
      else { opts[list] = [...opts[list], v]; opts[LISTS[list]] = opts[LISTS[list]].filter((x) => x !== v); }
      changed();
      return;
    }
    if (ev.target.closest("#reset-all")) { opts = { ...DEFAULTS, colorsIn: [], colorsOut: [], throwsIn: [], throwsOut: [] }; changed(); return; }
    if (ev.target.closest("#draw")) { draw(); return; }
    if (ev.target.closest("#stars-reset")) { opts.lo = 0.5; opts.hi = 5; changed(); }
  });
  $("#sync").addEventListener("change", (ev) => { opts.sync = ev.target.checked; changed(); });
  $("#skipfam").addEventListener("change", (ev) => { opts.skipfam = ev.target.checked; changed(); });
  for (const id of ["lo", "hi"]) {
    $("#" + id).addEventListener("input", (ev) => {
      let v = parseFloat(ev.target.value);
      if (id === "lo") opts.lo = Math.min(v, opts.hi); else opts.hi = Math.max(v, opts.lo);
      changed();
    });
  }

  async function start() {
    syncUi();
    let data;
    try {
      data = await (await fetch("/data.json", { cache: "no-cache" })).json();
    } catch (e) {
      $("#pick").innerHTML = `<p class="empty">The pattern list could not be loaded. Open this page once with internet, after that it also works offline.</p>`;
      return;
    }
    build(data);
    // throw buttons: every throw that occurs in the list, in siteswap order
    const all = new Set();
    PATTERNS.forEach((p) => throwsOf(p).forEach((t) => all.add(t)));
    const order = [...all].sort((x, y) => parseInt(x, 36) - parseInt(y, 36));
    // two rows: even throws (selfs, zip, hold) and odd throws (passes)
    const row = (odd) => `<div class="row">${order.filter((t) => parseInt(t, 36) % 2 === (odd ? 1 : 0))
      .map((t) => `<button type="button" data-v="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
    document.querySelectorAll(".multi.throws").forEach((g) => { g.innerHTML = row(false) + row(true); });
    $("#updated").textContent = updated(data.updated);
    if (lastFilmed) {
      $("#lastfam").innerHTML = `Not from the family of the last pattern we filmed: <b>${esc(lastFilmed.siteswap)}</b> (${esc(lastFilmed.family)}).`;
    }
    $("#draw").disabled = false;
    syncUi();
    draw();
  }
  start();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/gen/sw.js", { scope: "/gen/" }).catch(() => {});
  }
})();
