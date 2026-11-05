/* Funky Orbit: the colour and difficulty rules in JS (#62), the same rules as the Sheet tabs Kleurregels and
   Moeilijkheidsregels. Used by /rules/ (Try a siteswap). tools/check_rules.py compares it with the Sheet for every
   pattern on the list, so run that when a rule changes. No DOM in here, so it also runs without a browser. */
(function (root) {
  "use strict";

  const val = (c) => parseInt(c, 36);
  const SYNC_TOKEN = /[0-9a-oq-z]p?/g;
  const SYNC_AS = { "3p": "7", "4p": "9", "5p": "b", "3": "6", "4": "8", "5": "a", "1": "2" };

  // ---------- reading what someone typed ----------
  // {ss} for a vanilla siteswap, {a, b} for sync, or null when it is not a valid pattern.
  function parse(text) {
    const s = String(text || "").trim().toLowerCase();
    if (!s) return null;
    if (s.startsWith("(")) return parsePopcorn(s);
    const parts = s.split(/\s*\|\s*|\s+/).filter(Boolean);
    if (parts.length === 2) {
      const a = tokens(parts[0]), b = tokens(parts[1]);
      if (!a || !b || a.length !== b.length) return null;
      const p = { a: parts[0], b: parts[1] };
      return syncValid(p) ? p : null;
    }
    if (parts.length !== 1 || !/^[0-9a-z]{1,15}$/.test(s)) return null;
    const n = s.length, seen = new Set([...s].map((c, i) => (i + val(c)) % n));
    if (seen.size !== n) return null;
    if ([...s].reduce((sum, c) => sum + val(c), 0) === 0) return null;
    return { ss: s };
  }

  function tokens(s) {
    const t = s.match(SYNC_TOKEN);
    return t && t.join("") === s ? t : null;
  }

  function syncValid(p) {
    const t = [tokens(p.a), tokens(p.b)], n = t[0].length, seen = new Set();
    t.forEach((list, j) => list.forEach((x, i) => {
      seen.add(`${x.endsWith("p") ? 1 - j : j}:${(i + val(x[0])) % n}`);
    }));
    return seen.size === 2 * n;
  }

  // (6x,a)(6,6)*: every pair of brackets is one beat, left juggler A, right juggler B. The numbers are doubled,
  // x is a pass, and * means that A and B then swap roles.
  function parsePopcorn(s) {
    if (!/^(\([0-9a-z]x?,[0-9a-z]x?\))+\*?$/.test(s)) return null;
    const beats = [...s.matchAll(/\(([0-9a-z])(x?),([0-9a-z])(x?)\)/g)];
    const half = (c, x) => { const v = val(c); return v % 2 ? null : v.toString(36).replace(/.*/, (v / 2).toString(36)) + (x ? "p" : ""); };
    let a = [], b = [];
    for (const m of beats) {
      const l = half(m[1], m[2]), r = half(m[3], m[4]);
      if (l == null || r == null) return null;
      a.push(l); b.push(r);
    }
    if (s.endsWith("*")) { const a0 = a.slice(), b0 = b.slice(); a = a0.concat(b0); b = b0.concat(a0); }
    const p = { a: a.join(""), b: b.join(""), popcorn: s };
    return syncValid(p) ? p : null;
  }

  // ---------- keys: the same as the Families tab (smallest rotation; sync: both rotated, and A and B swapped) ----------
  function minRotation(ss) {
    let best = ss;
    for (let i = 1; i < ss.length; i++) {
      const r = ss.slice(i) + ss.slice(0, i);
      if (r < best) best = r;
    }
    return best;
  }

  function syncCanon(a, b) {
    const ta = tokens(a), tb = tokens(b), n = ta.length;
    let best = null;
    for (let i = 0; i < n; i++) {
      const ra = ta.slice(i).concat(ta.slice(0, i)).join(""), rb = tb.slice(i).concat(tb.slice(0, i)).join("");
      for (const c of [`${ra} ${rb}`, `${rb} ${ra}`]) if (best == null || c < best) best = c;
    }
    return best;
  }

  const keyOf = (p) => (p.popcorn ? p.popcorn : p.ss ? minRotation(p.ss) : syncCanon(p.a, p.b));

  // ---------- difficulty ----------
  const WEIGHT = { 2: 0, 4: 0.5, 6: 0.25, 7: 0.5, 8: 1, 9: 1.25, 5: 1.25, a: 3, b: 3.5 };
  const SPIN = { 5: 0.5, 7: 1, 9: 2, b: 3, 6: 1, 8: 2, a: 3 };
  const HEIGHT = 3; // a 5 next to a triple: 5 until 3.2.0, when we found a_5 in period 7 easier than that
  // From score to stars (Moeilijkheidsregels B50:C59): smaller steps in the middle, bigger ones at the top (since 3.2.0)
  const STAR_FROM = [[18.5, 5], [15.5, 4.5], [12.5, 4], [10, 3.5], [8.5, 3], [7.5, 2.5], [6.5, 2], [5.5, 1.5], [4, 1], [0, 0.5]];
  const TRIPLE = (t) => t === "a" || t === "b";
  const PASS = (t) => val(t) % 2 === 1;
  const LANDS_HARD = (t) => "89ab".includes(t);
  const round2 = (x) => Math.round(x * 1000) / 1000;

  const starsFor = (score) => STAR_FROM.find(([from]) => score >= from)[1];
  // Rounds as the script behind the Sheet does (Python's round): only an exact tie (.25 or .75) goes to the even digit,
  // so 15.25 stays 15.2. First away with the noise of adding up fractions.
  function round1(x) {
    x = Number(x.toFixed(6));
    if (Math.abs((x * 4) % 2) === 1) { const down = Math.floor(x * 10); return (down % 2 ? down + 1 : down) / 10; }
    return Number(x.toFixed(1));
  }

  // What one juggler throws, as siteswap throws: `seq` in the order they are thrown, `lands[i]` the throw it lands on.
  function sides(p) {
    if (p.ss) {
      const ss = p.ss, n = ss.length;
      const order = [];
      if (n % 2) { for (let i = 0; i < n; i++) order.push((i * 2) % n); return [side(ss, order, null)]; }
      // an even period: each juggler has their own throws
      const own = (from) => { const o = []; for (let i = from; i < n; i += 2) o.push(i); return o; };
      return [side(ss, own(0), "Piet"), side(ss, own(1), "Mees")];
    }
    const t = [tokens(p.a), tokens(p.b)], n = t[0].length;
    return [0, 1].map((j) => ({
      who: j ? "juggler B" : "juggler A",
      seq: t[j].map((x) => SYNC_AS[x] || x),
      landsOn: t[j].map((x, i) => { const to = t[x.endsWith("p") ? 1 - j : j][(i + val(x[0])) % n]; return SYNC_AS[to] || to; }),
    }));
  }

  function side(ss, order, who) {
    return {
      who,
      seq: order.map((i) => ss[i]),
      landsOn: order.map((i) => ss[(i + val(ss[i])) % ss.length]),
    };
  }

  function clubsOf(p) {
    if (p.ss) return [...p.ss].reduce((s, c) => s + val(c), 0) / p.ss.length;
    const t = [...tokens(p.a), ...tokens(p.b)];
    return t.reduce((s, x) => s + val(x[0]), 0) / tokens(p.a).length;
  }

  function layer1(s, clubs) {
    const n = s.seq.length, w = s.seq.map((t) => WEIGHT[t]);
    const items = [];
    const add = (label, points, id) => { if (points) items.push({ label, points: round2(points), id }); };
    add(`${clubs} clubs: more than 5`, 0.5 * Math.max(0, clubs - 5), "d-clubs");
    add("Average weight of the throws × 2", 2 * w.reduce((a, b) => a + b, 0) / n, "d-average");
    add("Heaviest throw × ½", 0.5 * Math.max(...w), "d-heaviest");
    if (s.seq.some(TRIPLE)) add("Has a triple", 2, "d-triple");
    const passes = s.seq.filter(PASS).length;
    add("Share of passes × 3", (3 * passes) / n, "d-passes");
    let changes = 0;
    for (let i = 0; i < n; i++) if (PASS(s.seq[i]) !== PASS(s.seq[(i + 1) % n])) changes++;
    add("Switches between pass and self", (3.5 * Math.max(0, changes - 2)) / n, "d-switches");
    const zips = s.seq.filter((t) => t === "2").length;
    add("Rest from zips", -0.5 * Math.min(2, zips), "d-zips");
    if (passes === n) add("Only passes, nowhere to rest", 3, "d-allpass");
    return items;
  }

  // The points for the 4 throws after a 5/a pair (fewer in a short period), which take off part of the penalty.
  function restAfter(seq, from) {
    const n = seq.length, count = Math.min(4, n - 2);
    let rest = 0;
    for (let k = 0; k < count; k++) {
      const t = seq[(from + 2 + k) % n];
      if ("5ab".includes(t)) break;
      if ("2467".includes(t)) rest += 1;
      else if ("89".includes(t)) rest += 0.5;
    }
    return rest;
  }

  function layer2(s) {
    const seq = s.seq, n = seq.length, found = [];
    // two dragons back to back (9 5 9 5): their 5-9 is part of the known sequence, not an extra change of height
    const backToBack = (seq.join("") + seq.join("")).includes("9595");
    const add = (label, points, id, note) => found.push({ label, points, id, note });
    for (let i = 0; i < n; i++) {
      const x = seq[i], y = seq[(i + 1) % n];
      if (x === "9" && y === "5") add("Dragon 9_5", 3.5, "d-dragon");
      else if (x === "b" && y === "7") add("Dragon variant b_7", 3.5, "d-dragon");
      else if (x === "b" && y === "5") add("b_5", 4, "d-dragon");
      if ((x === "5" && TRIPLE(y)) || (TRIPLE(x) && y === "5")) {
        const rest = restAfter(seq, i), off = Math.min(0.6, rest * 0.15);
        add("A 5 next to a triple", HEIGHT * (1 - off), "d-height", rest ? `rest ${rest}` : "");
      }
      if (TRIPLE(x) && TRIPLE(y)) add("Two triples in a row", 2.5, "d-triples");
      if (TRIPLE(x) && TRIPLE(y) && TRIPLE(seq[(i + 2) % n])) add("Three triples in a row", 0.5, "d-triples");
      if (x === "a" && y === "b") add("a to b", 0.5, "d-triples");
      if (x === "b" && y === "a") add("b to a", 0.25, "d-triples");
      if (PASS(x) && PASS(y) && SPIN[y] > SPIN[x]) {
        if (val(y) === val(x) + 2) add(`Stack ${x}-${y}`, 0.75 * (SPIN[y] - SPIN[x]), "d-stack");
        else if (!(x === "5" && TRIPLE(y)) && !(x === "5" && y === "9" && backToBack)) add(`Alternating passes ${x}-${y}`, 0.75 * (SPIN[y] - SPIN[x]), "d-stack");
      }
      if (!PASS(x) && !PASS(y) && (x + y === "68" || x + y === "8a")) add(`Stack ${x}-${y}`, 0.375, "d-stack");
      if ("89".includes(x) && "89".includes(y)) add(`Two doubles ${x}${y}`, 0.25, "d-doubles");
      const to = s.landsOn[i];
      if (LANDS_HARD(to)) {
        if (x === "9") add(`In a hurry: 9 lands on ${to}`, 1.25, "d-hurry");
        else if (x === "5") add(`In a hurry: 5 lands on ${to}`, 1, "d-hurry");
        else if ("8ab".includes(x)) add(`In a hurry: ${x} lands on ${to}`, 0.25, "d-hurry");
      }
      if (x === "5" && to === "5") add("5 lands on 5", 0.25, "d-hurry");
    }
    // the same combination again: the 2nd time half, after that nothing; the biggest counts first
    const seen = {};
    const items = [];
    found.slice().sort((p, q) => q.points - p.points).forEach((f) => {
      const k = f.label;
      seen[k] = (seen[k] || 0) + 1;
      if (seen[k] > 2) return;
      items.push({ ...f, points: seen[k] === 2 ? f.points / 2 : f.points, again: seen[k] === 2 });
    });
    return items;
  }

  // {score, stars, who, layer1, layer2} of the hardest side; {unknown: [...]} for throws that have no weight in our rules.
  function score(p) {
    const list = sides(p), clubs = clubsOf(p);
    const unknown = [...new Set(list.flatMap((s) => s.seq).filter((t) => !(t in WEIGHT)))];
    if (unknown.length) return { unknown };
    let best = null;
    for (const s of list) {
      const one = layer1(s, clubs), two = layer2(s);
      const sum = (l) => l.reduce((a, b) => a + b.points, 0);
      const exact = sum(one) + sum(two);
      if (!best || exact > best.exact) best = { exact, who: s.who, seq: s.seq.join(""), layer1: one, layer2: two, l1: sum(one), l2: sum(two) };
    }
    best.score = round1(best.exact);
    best.stars = starsFor(best.score);
    return best;
  }

  // ---------- colours ----------
  // Rule ids are the ids of the boxes in the colour flowchart on /rules/.
  // Every throw is a place {j, i}: juggler (always 0 for vanilla) and its position.
  function places(p) {
    if (p.ss) {
      const n = p.ss.length;
      return { n, sync: false, list: [...p.ss].map((t, i) => ({ j: 0, i, t, v: val(t), pass: val(t) % 2 === 1, to: `0:${(i + val(t)) % n}` })) };
    }
    const t = [tokens(p.a), tokens(p.b)], n = t[0].length, list = [];
    t.forEach((tok, j) => tok.forEach((x, i) => {
      const pass = x.endsWith("p");
      list.push({ j, i, t: x, v: val(x[0]), pass, to: `${pass ? 1 - j : j}:${(i + val(x[0])) % n}` });
    }));
    return { n, sync: true, list };
  }

  function orbitsOf(all) {
    const byId = new Map(all.list.map((x) => [`${x.j}:${x.i}`, x]));
    const seen = new Set(), orbits = [];
    for (const x of all.list) {
      const id = `${x.j}:${x.i}`;
      if (seen.has(id)) continue;
      const throws = [];
      let at = id;
      while (!seen.has(at)) { seen.add(at); const y = byId.get(at); throws.push(y); at = y.to; }
      orbits.push({ throws, clubs: throws.reduce((s, y) => s + y.v, 0) / all.n });
    }
    return orbits;
  }

  const multiset = (o) => o.throws.map((x) => x.t).sort().join(",");
  const distinct = (o) => new Set(o.throws.map((x) => x.t)).size;
  const passesOf = (o) => o.throws.filter((x) => x.pass).map((x) => x.v);
  const hasPass = (o) => passesOf(o).length > 0;
  const highPass = (o) => Math.max(...passesOf(o));
  const lowPass = (o) => Math.min(...passesOf(o));
  const isDragon = (o) => o.throws.length === 2 && multiset(o) === "5,9";

  // A2: orbits with exactly the same throws are one; dragons never.
  function merge(orbits) {
    const out = [];
    for (const o of orbits) {
      const same = !isDragon(o) && out.find((m) => m.sig === multiset(o));
      if (same) { same.throws = same.throws.concat(o.throws); same.clubs += o.clubs; same.parts++; }
      else out.push({ ...o, parts: 1, sig: multiset(o) });
    }
    return out;
  }

  // Which of two equal orbits goes first for orange (period 5 step 4, sync step 4). Answers [orange, other, rule].
  function pickOrange(x, y, lane) {
    if (hasPass(x) !== hasPass(y)) return hasPass(x) ? [y, x, `${lane}-tie-a`] : [x, y, `${lane}-tie-a`];
    if (hasPass(x) && highPass(x) !== highPass(y)) return highPass(x) > highPass(y) ? [y, x, `${lane}-tie-b`] : [x, y, `${lane}-tie-b`];
    return distinct(x) >= distinct(y) ? [x, y, `${lane}-tie-c`] : [y, x, `${lane}-tie-c`];
  }

  function byClubs(list) {
    return list.slice().sort((x, y) => y.clubs - x.clubs);
  }

  const paint = (o, color, rule) => { o.color = color; o.rule = rule; };

  // Period 3 and 5, and sync: the fixed colours first; then orange; the rest what is free.
  function colourFixedThenOrange(rest, used, prefix) {
    const sorted = byClubs(rest);
    if (!sorted.length) return;
    let orange = sorted[0], others = sorted.slice(1), rule = `${prefix}-orange`;
    if (others.length && others[0].clubs === orange.clubs) {
      const [o, other, why] = pickOrange(orange, others[0], prefix);
      orange = o;
      others = [other, ...others.slice(1)];
      rule = why;
    }
    paint(orange, "O", rule);
    used.add("O");
    return others;
  }

  function otherColour(o, used, prefer) {
    const free = prefer.find((c) => !used.has(c));
    if (free) { used.add(free); return free; }
    if (!used.has("R") && o.clubs === 1) { used.add("R"); return "R"; }
    return used.has("R") ? prefer[0] : "R";
  }

  function colours3(orbits) {
    const used = new Set(), rest = [];
    for (const o of orbits) {
      if (o.throws.every((x) => x.t === "9")) { paint(o, "W", "c3-9"); used.add("W"); }
      else if (o.throws.every((x) => x.t === "6")) { paint(o, "B", "c3-6"); used.add("B"); }
      else rest.push(o);
    }
    const others = colourFixedThenOrange(rest, used, "c3") || [];
    others.forEach((o) => paint(o, otherColour(o, used, hasPass(o) ? ["W", "B"] : ["B", "W"]), "c3-orange"));
  }

  function colours5(orbits) {
    const used = new Set(), rest = [];
    for (const o of orbits) {
      if (o.throws.every((x) => x.t === "a")) { paint(o, "W", "c5-a"); used.add("W"); }
      else if (o.throws.every((x) => x.t === "5")) { paint(o, "B", "c5-5"); used.add("B"); }
      else rest.push(o);
    }
    const others = colourFixedThenOrange(rest, used, "c5") || [];
    others.forEach((o) => {
      const want = used.has("B") ? ["W", "B"] : used.has("W") ? ["B", "W"] : hasPass(o) ? ["W", "B"] : ["B", "W"];
      paint(o, otherColour(o, used, want), "c5-other");
    });
  }

  function colours7(orbits, ss) {
    const key = minRotation(ss);
    const used = new Set();
    const seven = orbits.find((o) => o.throws.every((x) => x.t === "7"));
    const firstNine = (o) => Math.min(...o.throws.filter((x) => x.t === "9").map((x) => x.i));
    const dragons = orbits.filter(isDragon).sort((x, y) => firstNine(x) - firstNine(y));
    let rest = orbits.filter((o) => o !== seven && !dragons.includes(o));

    // the patterns the rules cannot choose for
    if (key === minRotation("a862225") || key === minRotation("a862925")) {
      for (const o of orbits) {
        const m = multiset(o);
        if (m === "2,2,a") paint(o, "W", "c7-a86");
        else if (m === "6,8") paint(o, "O", "c7-a86");
        else paint(o, "B", "c7-a86");
      }
      return;
    }
    if (key === minRotation("9955867")) {
      paint(seven, "R", "c7-x9955867");
      paint(dragons[0], "B", "c7-dragon");
      paint(dragons[1], "W", "c7-dragon");
      rest.forEach((o) => paint(o, "O", "c7-x9955867"));
      return;
    }

    if (seven) { paint(seven, "W", "c7-7"); used.add("W"); }
    if (dragons.length) {
      paint(dragons[0], "B", "c7-dragon"); used.add("B");
      if (dragons[1]) { const c = seven ? "O" : "W"; paint(dragons[1], c, "c7-dragon"); used.add(c); }
      if (dragons[2]) {
        paint(dragons[2], "W", "c7-dragon");
        if (seven) paint(seven, "R", "c7-dragon");
      }
      const sorted = byClubs(rest);
      if (!used.has("O") && sorted.length) { paint(sorted.shift(), "O", "c7-dragon-rest"); used.add("O"); }
      sorted.forEach((o) => {
        if (!seven && !used.has("W")) { paint(o, "W", "c7-dragon-rest"); used.add("W"); }
        else paint(o, "R", "c7-pink");
      });
      return;
    }
    const sorted = byClubs(rest);
    if (!sorted.length) return;
    let orange = sorted[0], others = sorted.slice(1), rule = "c7-orange";
    if (others.length && others[0].clubs === orange.clubs) {
      const x = orange, y = others[0];
      let o, other;
      if (hasPass(x) && hasPass(y)) {
        if (lowPass(x) !== lowPass(y)) { [o, other] = lowPass(x) > lowPass(y) ? [x, y] : [y, x]; rule = "c7-tie-a"; }
        else { [o, other] = distinct(x) >= distinct(y) ? [x, y] : [y, x]; rule = "c7-tie-c"; }
      } else if (hasPass(x) !== hasPass(y)) { [o, other] = hasPass(x) ? [y, x] : [x, y]; rule = "c7-tie-b"; }
      else { [o, other] = distinct(x) >= distinct(y) ? [x, y] : [y, x]; rule = "c7-tie-c"; }
      orange = o;
      others = [other, ...others.slice(1)];
    }
    paint(orange, "O", rule);
    others.forEach((o) => paint(o, "B", "c7-orange"));
  }

  function coloursSync(orbits, n) {
    const used = new Set(), rest = [];
    for (const o of orbits) {
      if (o.throws.every((x) => x.v === n && !x.pass)) { paint(o, "B", "cs-self"); used.add("B"); }
      else if (o.throws.every((x) => x.v === n && x.pass)) { paint(o, "W", "cs-pass"); used.add("W"); }
      else rest.push(o);
    }
    const others = colourFixedThenOrange(rest, used, "cs") || [];
    others.forEach((o) => paint(o, otherColour(o, used, hasPass(o) ? ["W", "B"] : ["B", "W"]), "cs-other"));
  }

  // Other periods are not on our list: the general idea of the rules, so a typed pattern still gets a colour.
  function coloursOther(orbits, n) {
    const used = new Set(), rest = [];
    for (const o of orbits) {
      if (o.throws.every((x) => x.v % n === 0)) {
        const c = hasPass(o) ? "W" : "B";
        paint(o, used.has(c) ? (c === "W" ? "B" : "W") : c, "c-general");
        used.add(o.color);
      } else rest.push(o);
    }
    const others = colourFixedThenOrange(rest, used, "c-general") || [];
    others.forEach((o) => paint(o, otherColour(o, used, hasPass(o) ? ["W", "B"] : ["B", "W"]), "c-general"));
  }

  // {orbits: [{throws, clubs, color, rule}], code} with code a string for vanilla, [a, b] for sync.
  function colours(p) {
    const all = places(p);
    const orbits = merge(orbitsOf(all));
    if (all.sync) coloursSync(orbits, all.n);
    else if (all.n === 3) colours3(orbits);
    else if (all.n === 5) colours5(orbits);
    else if (all.n === 7) colours7(orbits, p.ss);
    else coloursOther(orbits, all.n);
    const color = {};
    orbits.forEach((o) => o.throws.forEach((x) => { color[`${x.j}:${x.i}`] = o.color; }));
    const code = (j) => all.list.filter((x) => x.j === j).map((x) => color[`${x.j}:${x.i}`] || "").join("");
    return { orbits, n: all.n, sync: all.sync, general: !all.sync && ![3, 5, 7].includes(all.n), code: all.sync ? [code(0), code(1)] : code(0) };
  }

  root.FORules = { parse, keyOf, minRotation, syncCanon, tokens, score, colours, starsFor, round1, clubsOf };
})(typeof window !== "undefined" ? window : this);
