/* Funky Orbit — pattern generator: picks the next pattern to throw and film. */
(function () {
  "use strict";

  const { esc, fmt, siteswap, syncPattern, difficulty, startHtml, updated } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  const DEFAULTS = { period: "all", colorsIn: [], colorsOut: [], throwsIn: [], throwsOut: [], skipfam: true, skipdone: true, hide: false, hidehands: false, lo: 0.5, hi: 5 };
  const LISTS = { colorsIn: "colorsOut", colorsOut: "colorsIn", throwsIn: "throwsOut", throwsOut: "throwsIn" };
  let opts = { ...DEFAULTS };
  try { opts = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("fo_gen") || "{}") }; } catch (e) {}
  for (const k of Object.keys(LISTS)) if (!Array.isArray(opts[k])) opts[k] = [];
  if (opts.color && opts.color !== "any" && !opts.colorsIn.length) opts.colorsIn = [opts.color]; // older saved option
  delete opts.color;
  // older saved options: "Any" (with or without "Include sync") is now "All"
  if (!["all", "3", "5", "7", "sync"].includes(String(opts.period))) opts.period = "all";
  delete opts.sync;
  const save = () => { try { localStorage.setItem("fo_gen", JSON.stringify(opts)); } catch (e) {} };

  let PATTERNS = []; // one entry per unique pattern (key), with all its families
  let lastFilmed = null;
  let current = null;
  let revealed = new Set(); // digits whose colour was tapped open while "Hide colours" is on

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
      if (opts.skipdone && p.done) return false;
      // All = everything; 3 / 5 / 7 = siteswaps of that period; Sync = only sync patterns
      if (opts.period === "sync") { if (p.kind !== "Sync") return false; }
      else if (opts.period !== "all" && (p.kind === "Sync" || String(p.period) !== opts.period)) return false;
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
    // with "Hide colours" the digits are grey until you tap them open one by one (to work out the orbits yourself)
    const hidden = opts.hide;
    const shown = (i) => !hidden || revealed.has(i);
    let colors = p.colors;
    if (hidden && p.colors) {
      colors = p.ss
        ? [...p.colors].map((c, i) => (shown(i) ? c : " ")).join("")
        : p.colors.map((code, j) => [...code].map((c, i) => (shown(j * code.length + i) ? c : " ")).join(""));
    }
    const pat = p.ss ? siteswap(p.ss, "xl", colors) : syncPattern(p.a, p.b, "xl", colors, true);
    const cat = p.kind === "Sync" ? "Sync" : `${p.kind} · period ${p.period}`;
    box.innerHTML = `
      <div class="pick-pat${hidden ? " hidden-colors" : ""}">${pat}</div>
      ${p.name ? `<p class="pick-name">${esc(p.name)}</p>` : ""}
      ${p.done ? `<p class="pick-done">Already filmed</p>` : ""}
      ${opts.hidehands ? "" : startHtml(p, shown)}
      <dl class="pick-meta">
        <div><dt>Family</dt><dd>${p.families.map(esc).join("<br>")}</dd></div>
        <div><dt>Category</dt><dd>${esc(cat)}</dd></div>
        <div><dt>Difficulty</dt><dd>${p.stars != null
          ? difficulty(p, Math.max(...PATTERNS.map((x) => x.score || 0)))
          : "–"}</dd></div>
      </dl>`;
    if (hidden) {
      // every grey digit can be tapped (or chosen with the keyboard) to show its colour
      box.querySelectorAll(".pick-pat .ss b").forEach((b, i) => {
        if (revealed.has(i)) return;
        b.dataset.digit = i;
        b.setAttribute("role", "button");
        b.setAttribute("tabindex", "0");
        b.setAttribute("aria-label", `Show the colour of ${b.textContent}`);
      });
    }
  }

  // tap one digit open; when every digit is open, "Hide colours" switches itself off
  function reveal(i, fromKeyboard) {
    if (!current) return;
    revealed.add(i);
    const total = current.ss ? current.ss.length : (current.colors ? current.colors.join("").length : 0);
    if (revealed.size >= total) { opts.hide = false; revealed = new Set(); changed(); }
    show(current);
    const next = document.querySelector(`.pick-pat [data-digit]`);
    if (next && fromKeyboard) next.focus(); // keyboard users go on to the next grey digit
  }

  function draw() {
    const pool = candidates();
    let options = pool;
    if (current && pool.length > 1) options = pool.filter((p) => p.key !== current.key); // never the same twice in a row
    current = options.length ? options[Math.floor(Math.random() * options.length)] : null;
    revealed = new Set();
    show(current);
    $("#pick-note").hidden = true;
  }

  function syncUi() {
    document.querySelectorAll(".seg").forEach((seg) => {
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(opts[seg.dataset.opt]))));
    });
    document.querySelectorAll("[data-list]").forEach((g) => {
      g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(opts[g.dataset.list].includes(b.dataset.v))));
    });
    $("#skipfam").checked = opts.skipfam;
    $("#skipdone").checked = opts.skipdone;
    $("#hide").checked = opts.hide;
    $("#hidehands").checked = opts.hidehands;
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

  // Changing options never draws a new pattern: the pick stays until you press Draw again.
  function changed() {
    save();
    syncUi();
    const off = !!current && PATTERNS.length > 0 && !candidates().some((p) => p.key === current.key);
    $("#pick-note").hidden = !off;
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
    if (ev.target.closest("#reset-all")) { opts = { ...DEFAULTS, colorsIn: [], colorsOut: [], throwsIn: [], throwsOut: [] }; changed(); show(current); return; }
    if (ev.target.closest("#draw")) { draw(); return; }
    const digit = ev.target.closest("[data-digit]");
    if (digit) { reveal(+digit.dataset.digit); return; }
    if (ev.target.closest("#stars-reset")) { opts.lo = 0.5; opts.hi = 5; changed(); }
  });
  document.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.closest && ev.target.closest("[data-digit]")) {
      ev.preventDefault(); reveal(+ev.target.closest("[data-digit]").dataset.digit, true);
    }
  });
  $("#skipfam").addEventListener("change", (ev) => { opts.skipfam = ev.target.checked; changed(); });
  $("#skipdone").addEventListener("change", (ev) => { opts.skipdone = ev.target.checked; changed(); });
  $("#hide").addEventListener("change", (ev) => { opts.hide = ev.target.checked; revealed = new Set(); changed(); show(current); });
  $("#hidehands").addEventListener("change", (ev) => { opts.hidehands = ev.target.checked; changed(); show(current); });
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
    // phones: two rows, even throws (selfs, zip, hold) and odd throws (passes);
    // wide screens: one row from 2 to b (the rows dissolve and `order` sorts the buttons)
    const row = (odd) => `<div class="row">${order.filter((t) => parseInt(t, 36) % 2 === (odd ? 1 : 0))
      .map((t) => `<button type="button" data-v="${esc(t)}" style="order:${parseInt(t, 36)}">${esc(t)}</button>`).join("")}</div>`;
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
