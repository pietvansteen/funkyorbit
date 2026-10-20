/* Funky Orbit — funny stats: every block of the Statistics area in the Sheet (data.json -> statBlocks). */
(function () {
  "use strict";

  const { esc, updated, day, ago } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };

  const sheetDate = (v) => { // dd/mm/yyyy from the Sheet
    const m = String(v || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  };
  const niceValue = (v) => (sheetDate(v) ? day(sheetDate(v)) : v);

  // The Recording block in small groups. Videos recorded and Rated videos are left out: we film and
  // rate every pattern, so they equal Unique patterns thrown. Rows the Sheet adds later go under "More".
  function recordingBlock(b) {
    const val = new Map(b.rows.map((r) => [r[0].trim().toLowerCase(), r[1]]));
    const used = new Set(["videos recorded", "rated videos"]);
    const get = (k) => { used.add(k); return val.get(k); };
    const item = (label, value, sub) => value == null || value === "" ? "" :
      `<div><dt>${esc(label)}</dt><dd>${value}</dd>${sub ? `<span class="sub">${sub}</span>` : ""}</div>`;

    const first = sheetDate(get("first recording")), last = sheetDate(get("last recording"));
    get("days since last recording");
    const busiest = sheetDate(get("busiest date")), onBusiest = get("videos on busiest date");
    const rating = get("average rating");

    const groups = [
      ["Patterns", [
        item("Unique patterns thrown", esc(get("unique patterns thrown") ?? "")),
        item("Average rating", rating ? `${esc(rating)} ★` : ""),
      ]],
      ["Dates", [
        item("First → last recording", first && last ? `${esc(day(first))} → ${esc(day(last))}` : "", last ? `last one ${esc(ago(last))}` : ""),
        item("Busiest date", busiest ? esc(day(busiest)) : "", onBusiest ? `${esc(onBusiest)} pattern${onBusiest === "1" ? "" : "s"}` : ""),
      ]],
      ["Recording days", [
        item("Recording days", esc(get("recording days") ?? "")),
        item("Patterns per recording day", esc(get("videos per recording day") ?? get("patterns per recording day") ?? "")),
      ]],
    ];
    const rest = b.rows.filter((r) => !used.has(r[0].trim().toLowerCase()));
    if (rest.length) groups.push(["More", rest.map((r) => item(r[0], esc(niceValue(r[1] ?? ""))))]);
    return `<div class="stat-card wide"><div class="stat-groups">${groups.map(([title, items]) =>
      `<section><h3>${esc(title)}</h3><dl class="stat-grid">${items.join("")}</dl></section>`).join("")}</div></div>`;
  }

  // "Patterns with triple self (a)" -> "Triple Self (a)"; zaps get their throw too: "Zaps (5)"
  function withLabel(name) {
    const label = name.replace(/^patterns with /i, "").replace(/\b[a-z]{2,}/g, (w) => w[0].toUpperCase() + w.slice(1));
    return /^zaps$/i.test(label) ? "Zaps (5)" : label;
  }

  function statBlock(b, d) {
    if (/^recording$/i.test(b.title.trim())) return recordingBlock(b);
    const cols = b.columns.map((c) => c.toLowerCase());
    const iTotal = cols.indexOf("total"), iDone = cols.indexOf("done");
    if (iTotal >= 0 && iDone >= 0) {
      // progress-like rows; the ones already shown as tiles at the top are left out
      const skip = new Set(["all patterns", ...(d.summary || []).map((t) => t.name.toLowerCase())]);
      const rows = b.rows.filter((r) => !skip.has(r[0].toLowerCase()));
      // rows the sync computes itself, such as Dragons (95)
      for (const x of d.patternsWith || []) {
        const r = [x.name]; r[iTotal + 1] = String(x.total); r[iDone + 1] = String(x.done); rows.push(r);
      }
      if (!rows.length) return "";
      return `<div class="stat-card"><h3>Patterns with…</h3>${rows.map((r) => {
        const total = num(r[iTotal + 1]) || 0, done = num(r[iDone + 1]) || 0;
        const p = total ? (done / total) * 100 : 0;
        return `<div class="cat"><span>${esc(withLabel(r[0]))}</span>
          <div class="bar sm"><i class="${done ? "some" : ""}" style="width:${p}%"></i></div>
          <span class="n"><b>${done}</b>/${total}</span></div>`;
      }).join("")}</div>`;
    }
    const numeric = b.rows.filter((r) => num(r[1]) !== null);
    if (cols[0] !== "value" && numeric.length >= 2) {
      // a small bar chart, e.g. videos per weekday; text rows become a highlight line
      const max = Math.max(1, ...numeric.map((r) => num(r[1])));
      const notes = b.rows.filter((r) => num(r[1]) === null);
      return `<div class="stat-card"><h3>${esc(b.title)}</h3>${numeric.map((r) =>
        `<div class="hbar"><span>${esc(r[0])}</span><span class="track"><i style="width:${(num(r[1]) / max) * 100}%"></i></span><b>${esc(r[1])}</b></div>`).join("")}
        ${notes.map((r) => `<p class="stat-note">${esc(r[0])}: <b>${esc(r[1])}</b></p>`).join("")}</div>`;
    }
    return `<div class="stat-card wide"><h3>${esc(b.title)}</h3><dl class="stat-grid">${b.rows.map((r) =>
      `<div><dt>${esc(r[0])}</dt><dd>${esc(niceValue(r[1] ?? ""))}</dd></div>`).join("")}</dl></div>`;
  }

  function renderStats(d) {
    const parts = (d.statBlocks || []).map((b) => statBlock(b, d)).filter(Boolean);
    // the block with key figures first, the smaller cards side by side below it
    const html = [...parts.filter((h) => h.includes("stat-card wide")), ...parts.filter((h) => !h.includes("stat-card wide"))].join("");
    $("#stats").innerHTML = html;
  }

  async function start() {
    let data;
    try {
      data = await (await fetch("/data.json", { cache: "no-cache" })).json();
    } catch (e) {
      $("#stats").innerHTML = `<p class="empty">The stats could not be loaded. Please try again in a few minutes.</p>`;
      return;
    }
    $("#updated").textContent = updated(data.updated);
    renderStats(data);
  }
  start();
})();
