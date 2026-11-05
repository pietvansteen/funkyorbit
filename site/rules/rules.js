/* Funky Orbit — How it works (#62): the flowcharts and Try a siteswap. The rules themselves are in engine.js.
   The flowcharts are written here by hand: when a rule changes in the Sheet, change the box here and the rule in engine.js. */
(function () {
  "use strict";

  const { esc, siteswap, syncPattern, initPopup, openPattern, stars, track } = window.FO;
  const R = window.FORules;
  const $ = (sel) => document.querySelector(sel);
  const CLUB_NAME = { W: "white", B: "blue", O: "orange", R: "pink" };
  const CLUB_FILL = { W: "#eeeff2", B: "#1f4fd1", O: "#ee5a2c", R: "#e6386a" };

  // ---------- the flowcharts: [box id, text, colour stripe] from top to bottom ----------
  const COLOUR_CHARTS = [
    ["For every pattern", [
      ["c-merge", "Orbits with exactly the same throws become one orbit, with one colour. Their clubs add up. Dragons never merge."],
      ["c-orange-goal", "There is always orange, the orbit with the most clubs. Only when every throw already has a fixed colour is there none (a5555)."],
      ["c-pink", "Pink is only there once, for one club: an exception, when an orbit would otherwise be left without a colour.", "R"],
    ]],
    ["Period 3", [
      ["c3-9", "Is there a 9? It is white.", "W"],
      ["c3-6", "Is there a 6? It is blue.", "B"],
      ["c3-orange", "The orbit that is left, with the most clubs, is orange.", "O"],
    ]],
    ["Period 5", [
      ["c5-a", "Is there an a? It is white.", "W"],
      ["c5-5", "Is there a 5? It is blue.", "B"],
      ["c5-orange", "Of the orbits left, the one with the most clubs is orange.", "O"],
      ["c5-tie-a", "Equal clubs, and only one has a pass: the one without a pass is orange.", "O"],
      ["c5-tie-b", "Equal clubs, both with a pass: the one with the highest pass gets the other colour, the other is orange.", "O"],
      ["c5-tie-c", "The same highest pass too: the one with the most different throws is orange.", "O"],
      ["c5-other", "The orbit that is not orange: white if there's a 5, blue if there's an a. With neither: white with a pass, blue without."],
    ]],
    ["Period 7", [
      ["c7-7", "Is there a 7? All 7s together are white.", "W"],
      ["c7-dragon", "Dragons (a 9 with a 5 two places on), by their first 9: dragon 1 blue, dragon 2 orange if there's a 7, otherwise white, dragon 3 white.", "B"],
      ["c7-dragon-rest", "With a dragon: the orbit with the most clubs is orange. One left and no 7? It is white.", "O"],
      ["c7-pink", "Dragons and a 7, and one orbit left without a colour: it is pink.", "R"],
      ["c7-x9955867", "Exception 9955867: 7 pink, dragons blue and white, 86 orange.", "R"],
      ["c7-orange", "No dragon: the orbit with the most clubs is orange, all others blue.", "O"],
      ["c7-tie-a", "Equal clubs, both with a pass: the one with the lowest pass is blue, the other orange."],
      ["c7-tie-b", "Equal clubs, only one with a pass: that one is blue, the other orange."],
      ["c7-tie-c", "The same lowest pass: the one with the most different throws is orange, the other blue."],
      ["c7-a86", "Exceptions a862225 and a862925: a22 white, 86 orange, 25 or 95 blue. The rules can't choose, so we picked what looks best."],
    ]],
    ["Sync and popcorns", [
      ["cs-self", "A self that returns after exactly one period (3 in a 3-count)? All together blue.", "B"],
      ["cs-pass", "An orbit of only passes that return after one period (3p)? White.", "W"],
      ["cs-orange", "Of the orbits left, the one with the most clubs is orange.", "O"],
      ["cs-tie-a", "Equal clubs, and only one has a pass: the one without a pass is orange.", "O"],
      ["cs-tie-b", "Equal clubs, both with a pass: the one with the highest pass gets the other colour, the other is orange.", "O"],
      ["cs-tie-c", "The same highest pass too: the one with the most different throws is orange.", "O"],
      ["cs-other", "The others: white with a pass, blue without. Colour taken? Then the other one."],
    ]],
  ];

  const SCORE_CHARTS = [
    ["1. The throws", [
      ["d-order", "Put the throws in the order one juggler throws them. Sync: both jugglers separately, and the harder side counts."],
      ["d-average", "Weight per throw: zip 2: 0, self 6: ¼, hold 4 and pass 7: ½, heff 8: 1, zap 5 and pass 9: 1¼, triple a: 3, triple b: 3½. Add the average × 2."],
      ["d-heaviest", "Add ½ × the weight of the heaviest throw."],
      ["d-clubs", "Add ½ for every club above 5."],
      ["d-triple", "A triple in the pattern: add 2."],
      ["d-passes", "Add 3 × the share of passes: selfs give rest to correct a bad pass."],
      ["d-switches", "Switches between pass and self: one block of each is free. Add 3½ per extra switch, divided by the period."],
      ["d-zips", "Zips give rest: take off ½ per zip, at most 2 zips."],
      ["d-allpass", "Only passes, nowhere to rest: add 3."],
    ]],
    ["2. Tricky combinations", [
      ["d-dragon", "Known sequences: dragon 9_5 or b_7, add 3½. b_5: add 4."],
      ["d-height", "A 5 next to a triple: add 3. Looking up for the triple, quickly down for the zap. Each rest point in the 4 throws after it takes off 15%, at most 60%."],
      ["d-triples", "Two triples in a row: add 2½. Three: ½ more. a to b: ½ more, b to a: ¼ more."],
      ["d-stack", "Passes going up: 5-7, 7-9, 9-b, and others such as 5-9, 7-b: add ¾ per spin of difference. Selfs 6-8 and 8-a: half of that."],
      ["d-doubles", "Two doubles in a row (88, 89, 98, 99): add ¼."],
      ["d-hurry", "In a hurry: a 9 landing on 8, 9, a or b adds 1¼, a 5 adds 1, an 8, a or b adds ¼. A 5 landing on a 5 adds ¼."],
      ["d-repeat", "The same combination again: the 2nd time counts half, after that not at all."],
    ]],
    ["3. The result", [
      ["d-score", "Add up everything: that's the score."],
      ["d-stars", "The score gives the stars: ½ ★ below 4, 5 ★ at 18.5 or more, with the smallest steps in the middle (see the table)."],
    ]],
  ];

  const RULE_TEXT = Object.fromEntries([...COLOUR_CHARTS, ...SCORE_CHARTS].flatMap(([, boxes]) => boxes.map((b) => [b[0], b[1]])));
  RULE_TEXT["c-general"] = "Our colour rules are made for period 3, 5, 7 and sync, so this is the general idea: fixed colours first, then orange for the most clubs.";

  function wrap(text, chars) {
    const lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      if ((line + " " + word).trim().length > chars) { lines.push(line); line = word; }
      else line = (line + " " + word).trim();
    }
    if (line) lines.push(line);
    return lines;
  }

  function chart([title, boxes]) {
    const W = 300, LINE = 16, PAD = 10, GAP = 18, CHARS = 44;
    let y = 1;
    let body = "";
    boxes.forEach((b, i) => {
      const lines = wrap(b[1], CHARS), h = lines.length * LINE + PAD * 2 - 4;
      body += `<g class="fc-box" id="box-${b[0]}"><rect class="body" x="1" y="${y}" width="${W - 2}" height="${h}" rx="9"/>` +
        (b[2] ? `<rect x="1" y="${y + 8}" width="5" height="${h - 16}" rx="2" fill="${CLUB_FILL[b[2]]}"/>` : "") +
        `<text x="${PAD + 4}" y="${y + PAD + 9}">${lines.map((l, k) => `<tspan x="${PAD + 4}" dy="${k ? LINE : 0}">${esc(l)}</tspan>`).join("")}</text></g>`;
      y += h;
      if (i < boxes.length - 1) {
        body += `<path class="fc-arrow" d="M${W / 2} ${y + 1}V${y + GAP - 6}"/><path class="fc-head" d="M${W / 2 - 4} ${y + GAP - 7}h8l-4 6z"/>`;
        y += GAP;
      }
    });
    return `<figure class="chart" style="margin:0"><h4>${esc(title)}</h4><svg viewBox="0 0 ${W} ${y + 2}" role="group" aria-label="${esc(title)}: flowchart">${body}</svg></figure>`;
  }

  // ---------- pieces of the page ----------
  const coloured = (p, colors, size = "sm") => (p.ss ? siteswap(p.ss, size, colors) : syncPattern(p.a, p.b, size, colors));
  const orbitThrows = (o) => o.throws.map((x) => x.t).join(" ");
  const clubsWord = (n) => `${n} club${n === 1 ? "" : "s"}`;

  function exampleHtml(ss, what) {
    const p = R.parse(ss), c = R.colours(p);
    return `<li><b>${esc(what)}</b>${coloured(p, c.code)}
      ${c.orbits.map((o) => `<div class="orbit-line"><i class="sw c-${o.color.toLowerCase()}"></i><em>${esc(orbitThrows(o))}</em> ${clubsWord(o.clubs)}: ${CLUB_NAME[o.color]}. ${esc(RULE_TEXT[o.rule] || "")}</div>`).join("")}</li>`;
  }

  // ---------- Try a siteswap ----------
  const byKey = new Map(); // key -> the pattern on the list; also sync patterns by their a/b, as a popcorn has its notation for key
  const pts = (x) => `${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}`;

  function step(rule, html, right = "") {
    const known = rule && RULE_TEXT[rule];
    return `<li><button type="button" class="step" data-box="${esc(rule || "")}"${known ? ` title="${esc(known)}"` : ""}>${html}</button>${right}</li>`;
  }

  function colourSteps(p, item) {
    const c = R.colours(p);
    // on the list the colours come from data.json, so they always match the rest of the site
    const at = (x) => (item ? (item.ss ? item.colors && item.colors[x.i] : item.colors && item.colors[x.j] && item.colors[x.j][x.i]) : null);
    const list = c.orbits.map((o) => {
      const color = at(o.throws[0]) || o.color;
      const merged = o.parts > 1 ? ` <small>(${o.parts} orbits with the same throws)</small>` : "";
      return step(o.rule, `<i class="sw c-${color.toLowerCase()}"></i> <b>${esc(orbitThrows(o))}</b> · ${clubsWord(o.clubs)}${merged}: <b>${CLUB_NAME[color]}</b>. ${esc(RULE_TEXT[o.rule] || "")}`);
    }).join("");
    const rules = c.orbits.map((o) => o.rule);
    if (c.orbits.some((o) => o.parts > 1)) rules.push("c-merge");
    if (c.orbits.some((o) => o.color === "R")) rules.push("c-pink");
    return { html: list, rules, code: item ? item.colors : c.code, general: c.general };
  }

  function scoreSteps(p, item) {
    const s = R.score(p);
    if (s.unknown) return { html: `<li>We never throw a ${esc(s.unknown.join(" or a "))}, so these throws have no weight in our rules, and there is no score.</li>`, rules: [], none: true };
    const rules = ["d-order"], lines = [];
    if (s.who) lines.push(`<li>The harder side is ${esc(s.who)}.</li>`);
    lines.push(step("d-order", `In the order one juggler throws them: <b>${esc(s.seq)}</b>`));
    for (const x of s.layer1) { rules.push(x.id); lines.push(step(x.id, esc(x.label), `<span class="pts">${pts(x.points)}</span>`)); }
    for (const x of s.layer2) {
      rules.push(x.id);
      if (x.again) rules.push("d-repeat");
      lines.push(step(x.again ? "d-repeat" : x.id, `${esc(x.label)}${x.again ? " (again: half)" : ""}${x.note ? ` <small>(${esc(x.note)})</small>` : ""}`, `<span class="pts">${pts(x.points)}</span>`));
    }
    rules.push("d-score", "d-stars");
    const score = item && item.score != null ? item.score : s.score, st = item && item.stars != null ? item.stars : s.stars;
    return { html: lines.join(""), rules, total: `<div class="try-total">Score ${score} · ${stars(st).replace(/title="[^"]*"/, "")} ${st} ★</div>` };
  }

  function clearHighlight() {
    document.querySelectorAll(".fc-box.hl").forEach((b) => b.classList.remove("hl"));
  }

  function showTry(text, fromUrl) {
    const typed = String(text || "").trim();
    const box = $("#try-result");
    clearHighlight();
    try {
      const url = new URL(location.href);
      typed ? url.searchParams.set("try", typed) : url.searchParams.delete("try");
      history.replaceState(null, "", url);
    } catch (e) {}
    if (!typed) { box.innerHTML = ""; return; }
    const p = R.parse(typed);
    if (!p) {
      box.innerHTML = `<p>That is not a valid siteswap. In a siteswap, no two throws may land on the same beat: 756 works, 7a6 does not. Sync is written as two parts, like <b>33p3 4p44</b>.</p>`;
      return;
    }
    const item = byKey.get(p.popcorn ? R.syncCanon(p.a, p.b) : R.keyOf(p));
    const use = item ? (item.ss ? { ss: item.ss } : { a: item.a, b: item.b }) : p;
    const col = colourSteps(use, item), sc = scoreSteps(use, item);
    const same = item && (item.ss ? item.ss === p.ss : `${item.a} ${item.b}` === `${p.a} ${p.b}`);
    box.innerHTML = `<div class="try-head">${coloured(use, col.code, "lg")}
        ${item ? `<span class="try-tag">On our list</span><button type="button" class="try-open" data-open="${esc(item.key)}">Open this pattern</button>`
          : `<span class="try-tag off">Not on our list</span>`}</div>
      ${item && !same ? `<p class="wish-note">On our list it is written as ${esc(item.ss || `${item.a} ${item.b}`)}.</p>` : ""}
      ${item ? "" : `<p class="wish-note">Worked out here with the same rules.${col.general ? " " + esc(RULE_TEXT["c-general"]) : ""}</p>`}
      <h3 style="margin:0">Colours</h3><ul class="try-steps">${col.html}</ul>
      <h3 style="margin:0">Difficulty</h3><ul class="try-steps">${sc.html}</ul>${sc.total || ""}
      ${item && !sc.none ? `<p class="wish-note">The total comes from our Sheet, which can round 0.1 differently from these steps.</p>` : ""}`;
    [...col.rules, ...sc.rules].forEach((r) => { const el = document.getElementById(`box-${r}`); if (el) el.classList.add("hl"); });
    if (!fromUrl) track("Try a siteswap", { siteswap: typed.slice(0, 40), listed: !!item });
  }

  // ---------- the page ----------
  $("#colour-charts").innerHTML = COLOUR_CHARTS.map(chart).join("");
  $("#score-charts").innerHTML = SCORE_CHARTS.map(chart).join("");
  $("#examples").innerHTML = exampleHtml("756", "Period 3") + exampleHtml("97586", "Period 5") + exampleHtml("9757266", "Period 7");
  $("#stars-table").innerHTML = [["0", 0.5, "456, 8882225"], ["4", 1, "786, 79662"], ["5.5", 1.5, "8556666, 89742"], ["6.5", 2, "96677, 9667777"], ["7.5", 2.5, "8897926, 97522"],
    ["8.5", 3, "9695677, 945"], ["10", 3.5, "a8aa722, 99552"], ["12.5", 4, "a7a6295, b67"], ["15.5", 4.5, "975, aa555"], ["18.5", 5, "b97"]]
    .map(([from, st, ex]) => `<tr><td class="num">${from}</td><td>${stars(st)}</td><td>${esc(ex)}</td></tr>`).join("");
  $("#throws-table").innerHTML = [["2", "1", "Zip: goes blind, to the other hand"], ["4", "", "Hold: an active single spin in the same hand"], ["5", "", "Zap: half a spin, a quick low pass"],
    ["6", "3", "Self: single spin to the other hand"], ["7", "3p", "Single pass, the easiest pass"], ["8", "4", "Heff: double self"], ["9", "4p", "Double pass"], ["a", "5", "Triple self"], ["b", "5p", "Triple pass"]]
    .map(([t, s, what]) => `<tr><td class="t">${t}</td><td class="t">${s}</td><td style="white-space:normal">${what}</td></tr>`).join("");
  $("#try-examples").insertAdjacentHTML("beforeend", ["756", "97586", "9955966", "33p3 4p44", "b97"].map((s) => `<button type="button" data-try="${s}">${s}</button>`).join(""));

  $("#try-form").addEventListener("submit", (ev) => { ev.preventDefault(); showTry($("#try-input").value); });
  $("#try-input").addEventListener("input", (ev) => { showTry(ev.target.value, true); });
  document.addEventListener("click", (ev) => {
    const ex = ev.target.closest("[data-try]");
    if (ex) { $("#try-input").value = ex.dataset.try; showTry(ex.dataset.try); return; }
    const open = ev.target.closest(".try-open");
    if (open) { openPattern(open.dataset.open); return; }
    const st = ev.target.closest("button.step");
    if (st) { const el = document.getElementById(`box-${st.dataset.box}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }
  });

  (async function init() {
    const given = new URLSearchParams(location.search).get("try");
    if (given) $("#try-input").value = given;
    try {
      const d = await (await fetch("/data.json", { cache: "no-cache" })).json();
      for (const p of d.all || []) {
        if (p.key && !byKey.has(p.key)) byKey.set(p.key, p);
        if (p.a) byKey.set(R.syncCanon(p.a, p.b), p);
      }
      initPopup(d);
    } catch (e) { /* offline without a copy: everything is worked out here */ }
    if (given) showTry(given, true);
    // the hash may point at a section whose content was only just written
    if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  })();
})();
