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
      ["Dates", dateRows([
        ["First recording", first],
        ["Last recording", last, last && ago(last)],
        ["Busiest date", busiest, onBusiest && `${onBusiest} pattern${onBusiest === "1" ? "" : "s"}`],
      ]), true],
      ["Recording days", [
        item("Recording days", esc(get("recording days") ?? "")),
        item("Patterns per recording day", esc(get("videos per recording day") ?? get("patterns per recording day") ?? "")),
      ]],
    ];
    const rest = b.rows.filter((r) => !used.has(r[0].trim().toLowerCase()));
    if (rest.length) groups.push(["More", rest.map((r) => item(r[0], esc(niceValue(r[1] ?? ""))))]);
    return `<div class="stat-card wide"><div class="stat-groups">${groups.map(([title, items, raw]) =>
      `<section class="grp-${esc(title.toLowerCase().replace(/[^a-z]+/g, "-"))}${raw ? " dates" : ""}"><h3>${esc(title)}</h3>${raw ? items : `<dl class="stat-grid">${items.join("")}</dl>`}</section>`).join("")}</div></div>`;
  }

  // Each date on its own row: label, date (never broken), extra info after it
  function dateRows(rows) {
    return `<div class="date-rows">${rows.filter((r) => r[1]).map(([label, date, extra]) =>
      `<div class="dr"><span class="dl">${esc(label)}</span><span class="dv">${esc(day(date))}</span><span class="dx">${extra ? "· " + esc(extra) : ""}</span></div>`).join("")}</div>`;
  }

  // Juggling time: the estimate from the Sheet, with "time juggled so far" as the eye-catcher
  function jugglingBlock(b) {
    const val = new Map(b.rows.map((r) => [r[0].trim().toLowerCase(), r[1]]));
    const big = val.get("time juggled so far");
    const rest = b.rows.filter((r) => r[0].trim().toLowerCase() !== "time juggled so far");
    return `<div class="stat-card wide juggle-card">
      <h3>${esc(b.title.replace(/\s*\(estimate\)\s*/i, ""))} <span class="est">estimate</span></h3>
      <div class="juggle">
        ${big ? `<div class="juggle-big"><b>${esc(big)}</b><span>time juggled so far</span></div>` : ""}
        <dl class="stat-grid">${rest.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1] ?? "")}</dd></div>`).join("")}</dl>
      </div>
      <div class="juggle-note"><span class="tip" tabindex="0" aria-describedby="juggle-tip">Estimate based on the difficulty of each pattern
        <span class="tip-text" id="juggle-tip" role="tooltip"><b>How we estimate</b>
          Every pattern gets a time from its difficulty stars: ½ ★ 15 min, 1 ★ 19, 1½ ★ 23, 2 ★ 26, 2½ ★ 30, 3 ★ 40, 3½ ★ 50,
          4 ★ 60, 4½ ★ 2 h and 5 ★ 4 h. Within a star level it goes from 10% less (lowest score) to 10% more (highest score).
          Time juggled so far adds up the patterns we have thrown; time to go the rest.</span></span></div>
      ${hours(val.get("whole list")) ? `<div class="plan" data-total="${hours(val.get("whole list"))}">
        <h4>How long would the whole list take?</h4>
        <label class="plan-row"><span>Practice days per week</span><input type="range" id="plan-days" min="1" max="7" step="1" value="2"><b id="plan-days-v"></b></label>
        <label class="plan-row"><span>Hours per session</span><input type="range" id="plan-hours" min="1" max="8" step="1" value="2"><b id="plan-hours-v"></b></label>
        <p class="plan-out" aria-live="polite"><b id="plan-result"></b><span id="plan-sub"></span></p>
      </div>` : ""}
    </div>`;
  }

  // "828 h 51 min" -> 828.85
  function hours(v) {
    const h = String(v || "").match(/(\d+(?:[.,]\d+)?)\s*h/), m = String(v || "").match(/(\d+)\s*min/);
    const t = (h ? num(h[1]) : 0) + (m ? +m[1] / 60 : 0);
    return t > 0 ? Math.round(t * 100) / 100 : 0;
  }

  // The practice calculator under Juggling time: whole list / (days x hours) weeks, as years and weeks
  const WEEKS_PER_YEAR = 365.25 / 7;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  function updatePlan() {
    const box = $(".plan");
    if (!box) return;
    const days = +$("#plan-days").value, per = +$("#plan-hours").value, weekly = days * per;
    const weeks = +box.dataset.total / weekly;
    let years = Math.floor(weeks / WEEKS_PER_YEAR), rest = Math.round(weeks - years * WEEKS_PER_YEAR);
    if (rest >= 52) { years += 1; rest = 0; }
    $("#plan-days-v").textContent = plural(days, "day");
    $("#plan-hours-v").textContent = `${per} h`;
    $("#plan-result").textContent = years ? (rest ? `${plural(years, "year")} and ${plural(rest, "week")}` : plural(years, "year"))
      : plural(Math.max(1, Math.ceil(weeks)), "week");
    $("#plan-sub").textContent = `${weekly} h of practice a week · about ${plural(Math.ceil(weeks), "week")}`;
    for (const r of box.querySelectorAll("input")) r.style.setProperty("--fill", ((r.value - r.min) / (r.max - r.min)) * 100 + "%");
  }

  // "Patterns with triple self (a)" -> "Triple Self (a)"; zaps get their throw too: "Zaps (5)"
  function withLabel(name) {
    const label = name.replace(/^patterns with /i, "").replace(/\b[a-z]{2,}/g, (w) => w[0].toUpperCase() + w.slice(1));
    return /^zaps$/i.test(label) ? "Zaps (5)" : label;
  }

  function statBlock(b, d) {
    if (/^recording$/i.test(b.title.trim())) return recordingBlock(b);
    if (/^juggling time/i.test(b.title.trim())) return jugglingBlock(b);
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
    // juggling time first (eye-catcher), then the other wide cards, then the smaller cards side by side
    const rank = (h) => (h.includes("juggle-card") ? 0 : h.includes("stat-card wide") ? 1 : 2);
    const html = parts.map((h, i) => [rank(h), i, h]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]).join("");
    $("#stats").innerHTML = html;
    for (const r of document.querySelectorAll(".plan input")) r.addEventListener("input", updatePlan);
    updatePlan();
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
