/* Funky Orbit — funny stats: every block of the Statistics area in the Sheet (data.json -> statBlocks). */
(function () {
  "use strict";

  const { esc, updated } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };

  function niceValue(v) {
    const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/yyyy from the Sheet
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return v;
  }

  function statBlock(b, d) {
    const cols = b.columns.map((c) => c.toLowerCase());
    const iTotal = cols.indexOf("total"), iDone = cols.indexOf("done");
    if (iTotal >= 0 && iDone >= 0) {
      // progress-like rows; the ones already shown as tiles at the top are left out
      const skip = new Set(["all patterns", ...(d.summary || []).map((t) => t.name.toLowerCase())]);
      const rows = b.rows.filter((r) => !skip.has(r[0].toLowerCase()));
      if (!rows.length) return "";
      return `<div class="stat-card"><h3>Patterns with…</h3>${rows.map((r) => {
        const total = num(r[iTotal + 1]) || 0, done = num(r[iDone + 1]) || 0;
        const p = total ? (done / total) * 100 : 0;
        return `<div class="cat"><span>${esc(r[0].replace(/^patterns with /i, ""))}</span>
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
