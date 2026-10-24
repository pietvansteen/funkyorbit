/* Funky Orbit — milestones when we log a pattern on the Add page (#44).
   check() compares the state before the new row with the state after it, so a milestone only comes once:
   logging a pattern we did before gives no progress milestones again. Each milestone has an id; a GIF in
   site/gifs/ whose name starts with that id (e.g. "birthday-cake.mp4") is used for it, otherwise one from ALIASES,
   otherwise a random one. Add a milestone = add a rule to RULES. */
(function () {
  "use strict";

  // ---------- people and patterns (#44) ----------
  const BIRTHDAYS = { Piet: "07-14", Mees: "07-08", Hanna: "09-21", Janne: "10-06" }; // "MM-DD"
  // Pattern keys (as in data.json "key"), still to be identified
  const SPECIAL = {
    brookFirst: "", brookLast: "", brookFavourite: "", jamesFavourite: "",
    brookDone: [], // every pattern Brook has done
  };

  // Existing GIFs that fit a milestone, when there is none named after it
  const ALIASES = {
    "clubs-first": ["juggler-agt"], favourite: ["dicaprio-cheers"],
    "rating-max": ["dicaprio-cheers"], hundred: ["obama-mic-drop"], final: ["obama-mic-drop"],
    "family-complete": ["success-kid-mission"], "sync-last": ["sync-first"], "clubs-many": ["juggler-agt"],
    "round": ["hundred"], "difficult": ["hardest"], "after-hard": ["repeat"], "hard-low": ["lowest"],
  };

  const SYNC_THROW = /[0-9a-oq-z]p?/g;
  const val = (c) => parseInt(c, 36);
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pick = (x) => (Array.isArray(x) ? x[Math.floor(Math.random() * x.length)] : x);
  const dayNr = (iso) => Math.round(Date.parse(iso + "T12:00:00Z") / 864e5);
  const isoOf = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  const listText = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

  // ---------- what a pattern has: clubs, zaps (5), triples (a, b), dragons (9_5), colours ----------
  // Sync throws count by spin like the vanilla ones (3p≈7, 4p≈9, 5p≈b, 3≈6, 4≈8, 5≈a).
  const SYNC_AS = { "3p": "7", "4p": "9", "5p": "b", 3: "6", 4: "8", 5: "a" };
  function facts(p) {
    if (p.ss) {
      const ss = p.ss.toLowerCase(), n = ss.length;
      let dragons = 0;
      // a 9 and then a 5 by the same juggler, one of his throws later (two beats), cyclic: as the Sheet counts them
      for (let i = 0; i < n; i++) if (ss[i] === "9" && ss[(i + 2) % n] === "5") dragons++;
      return {
        clubs: [...ss].reduce((s, c) => s + val(c), 0) / n, period: n, dragons,
        zaps: [...ss].filter((c) => c === "5").length, triples: [...ss].filter((c) => c === "a" || c === "b").length,
        hasB: ss.includes("b"), colors: new Set(p.colors || ""),
      };
    }
    const ta = (p.a || "").toLowerCase().match(SYNC_THROW) || [], tb = (p.b || "").toLowerCase().match(SYNC_THROW) || [];
    const all = [...ta, ...tb], like = all.map((t) => SYNC_AS[t] || "");
    return {
      clubs: all.reduce((s, t) => s + val(t[0]), 0) / Math.max(1, ta.length), period: ta.length, dragons: 0, zaps: 0,
      triples: like.filter((c) => c === "a" || c === "b").length, hasB: like.includes("b"),
      colors: new Set((p.colors || []).join("")),
    };
  }

  // ---------- the rules; each gives null or { title, text } (text may be a list: one is picked) ----------
  // ctx: item (the pattern on the list, or null), key, isNew, rating, date, time ("HH:MM", only when logged today),
  //      before / after: { done: Set of keys, rows: [{ key, date, time, rating }] }, list: Map key -> item, total
  const RULES = [
    { id: "final", prio: 100, test: (c) => c.isNew && c.left === 0 && { title: "This is your last pattern! Hooray!", text: "We came. We passed. We can finally rest." } },
    { id: "countdown", prio: 90, test: (c) => c.isNew && c.left > 0 && c.left <= 10 && { title: c.left === 1 ? "1 more pattern to go!" : `${c.left} more patterns to go!`, text: "The end is in sight." } },
    { id: "birthday", prio: 88, test: (c) => {
      const who = Object.keys(BIRTHDAYS).filter((n) => BIRTHDAYS[n] && c.date.slice(5) === BIRTHDAYS[n]);
      return who.length && { title: `Happy birthday, ${listText(who)}!`, text: "Another year older, still throwing things at each other." };
    } },
    { id: "brook", prio: 86, test: (c) => {
      const s = SPECIAL;
      if (s.brookFirst && c.key === s.brookFirst) return { title: "Brook's first pattern!", text: "Where it all began for Brook." };
      if (s.brookLast && c.key === s.brookLast) return { title: "Brook's last pattern!", text: "The last one Brook did. Now we have too." };
      if (s.brookFavourite && c.key === s.brookFavourite) return { title: "Brook's favourite pattern!", text: "Brook would be proud." };
      if (s.jamesFavourite && c.key === s.jamesFavourite) return { title: "James's favourite pattern!", text: "Straight from the man who made the list." };
      if (s.brookDone.length && c.isNew && !s.brookDone.includes(c.key)) return { title: "Brook never did this one!", text: "New territory." };
      return null;
    } },
    { id: "sync-last", prio: 80, test: (c) => c.isNew && c.item.kind === "Sync" && c.undone((p) => p.kind === "Sync") === 0 && { title: "Our last sync pattern!", text: "Every sync pattern on the list: done." } },
    { id: "sync-first", prio: 78, test: (c) => c.isNew && c.item.kind === "Sync" && c.countDoneBefore((p) => p.kind === "Sync") === 0 && { title: "Our first sync pattern!", text: "Both of us throwing at the same time. What could go wrong?" } },
    { id: "clubs-first", prio: 76, test: (c) => {
      const n = c.f.clubs, max = Math.max(0, ...c.doneItemsBefore.map((p) => facts(p).clubs));
      if (!c.isNew || c.doneItemsBefore.some((p) => facts(p).clubs === n)) return null;
      return { title: `Our first ${n}-club pattern!`, text: n > max ? "Sharing is caring. Until there are this many clubs." : n <= 5 ? "Less is more. Sometimes." : "More clubs, more problems." };
    } },
    { id: "dragon-first", prio: 74, test: (c) => c.isNew && c.f.dragons > 0 && !c.doneItemsBefore.some((p) => facts(p).dragons > 0) && { title: "Here be dragons!", text: "Our first pattern with a dragon: a 9 and a 5, one throw apart." } },
    { id: "dragon-most", prio: 73, test: (c) => c.isNew && c.f.dragons > 0 && c.f.dragons === c.maxOf("dragons") && { title: `The most dragons: ${c.f.dragons}!`, text: "No pattern on the list has more dragons than this one." } },
    { id: "zaps-most", prio: 72, test: (c) => c.isNew && c.f.zaps > 0 && c.f.zaps === c.maxOf("zaps") && { title: `The most zaps: ${c.f.zaps}!`, text: "No pattern on the list has more zaps than this one." } },
    { id: "triples-most", prio: 72, test: (c) => c.isNew && c.f.triples > 0 && c.f.triples === c.maxOf("triples") && { title: `The most triples: ${c.f.triples}!`, text: "No pattern on the list has more triples than this one." } },
    { id: "hundred", prio: 70, test: (c) => c.isNew && c.doneAfter % 100 === 0 && { title: `${c.doneAfter} patterns!`, text: "Another hundred down." } },
    { id: "family-complete", prio: 68, test: (c) => {
      if (!c.isNew) return null;
      const fams = c.item.families.filter((fam) => [...c.list.values()].every((p) => !p.families.includes(fam) || c.after.done.has(p.key)));
      if (!fams.length) return null;
      const hard = Math.max(...[...c.list.values()].filter((p) => p.families.includes(fams[0])).map((p) => p.stars || 0)) >= 3;
      return { title: `${fams[0]}: complete!`, text: hard ? "Passed between two jugglers. Carried by sheer determination." : "Every pattern in this family: done." };
    } },
    { id: "percent", prio: 65, test: (c) => {
      const a = Math.floor((c.doneAfter / c.total) * 100), b = Math.floor((c.doneBefore / c.total) * 100);
      return c.isNew && a > b && { title: `${a}% of the list done!`, text: c.estimate ? `Expected project completion date: ${c.estimate}.` : "One whole percent closer." };
    } },
    { id: "colours-all", prio: 62, test: (c) => c.isNew && ["W", "B", "O", "R"].every((x) => c.f.colors.has(x)) && !c.doneItemsBefore.some((p) => ["W", "B", "O", "R"].every((x) => facts(p).colors.has(x))) && { title: "Every colour at once!", text: "White, blue, orange and pink in one pattern: our first." } },
    { id: "orange-last", prio: 60, test: (c) => {
      const onlyOrange = (p) => { const s = facts(p).colors; return s.size === 1 && s.has("O"); };
      return c.isNew && onlyOrange(c.item) && c.undone(onlyOrange) === 0 && { title: "The last all-orange pattern!", text: "From now on there is always another colour in the air." };
    } },
    { id: "no-orange", prio: 58, test: (c) => {
      const noOrange = (p) => facts(p).colors.size > 0 && !facts(p).colors.has("O");
      if (!c.isNew || !noOrange(c.item)) return null;
      const left = c.undone(noOrange), all = [...c.list.values()].filter(noOrange).length;
      return left === 0 ? { title: "The final pattern without orange!", text: "No more patterns without orange clubs." }
        : { title: "No orange clubs!", text: `This is one of ${all} patterns with no orange clubs.` };
    } },
    { id: "b-first", prio: 57, test: (c) => c.isNew && c.f.hasB && !c.doneItemsBefore.some((p) => facts(p).hasB) && { title: "Our first b!", text: "A triple pass. That doesn't look legal." } },
    { id: "hardest", prio: 55, test: (c) => c.isNew && c.item.score != null && c.item.score > Math.max(0, ...c.doneItemsBefore.map((p) => p.score || 0)) && c.doneItemsBefore.length > 0 && { title: "This is the hardest pattern you can do!", text: ["We probably shouldn't have tried that.", "A new personal best for difficulty."] } },
    { id: "favourite", prio: 54, test: (c) => c.rating && c.ratedBefore.length && c.rating > Math.max(...c.ratedBefore) && { title: "This is now your favourite pattern!", text: "New favourite. Until we mess it up tomorrow." } },
    { id: "lowest", prio: 53, test: (c) => c.rating && c.ratedBefore.length && c.rating < Math.min(...c.ratedBefore) && { title: "A new lowest rating!", text: "It worked. Let's never do it again." } },
    { id: "weekday-all", prio: 52, test: (c) => c.weekdaysBefore.size === 6 && !c.weekdaysBefore.has(c.weekday) && { title: "Every day of the week!", text: "We have now logged a pattern on every day of the week." } },
    { id: "weekday-first", prio: 50, test: (c) => c.weekdaysBefore.size < 6 && !c.weekdaysBefore.has(c.weekday) && { title: `Our first ${WEEKDAYS[c.weekday]}!`, text: `The first pattern we logged on a ${WEEKDAYS[c.weekday]}.` } },
    { id: "streak", prio: 49, test: (c) => {
      if (c.datesBefore.has(c.date)) return null;
      let n = 1;
      while (c.datesBefore.has(isoOf(dayNr(c.date) - n))) n++;
      if (n < 3) return null;
      const names = Array.from({ length: Math.min(n, 7) }, (_, i) => WEEKDAYS[(c.weekday - (Math.min(n, 7) - 1) + i + 7) % 7]);
      return { title: `${n} days in a row!`, text: n <= 7 ? listText(names) + "." : "We can't stop." };
    } },
    { id: "busiest", prio: 48, test: (c) => {
      const per = {};
      c.before.rows.forEach((r) => (per[r.date] = (per[r.date] || 0) + 1));
      // once per day: the pattern that breaks the record of the other days
      const today = (per[c.date] || 0) + 1, max = Math.max(0, ...Object.entries(per).filter(([d]) => d !== c.date).map(([, n]) => n));
      return max > 0 && today === max + 1 && { title: `A new daily record: ${today} patterns!`, text: "Our busiest day so far." };
    } },
    { id: "year", prio: 47, test: (c) => {
      const first = Math.min(...[...c.datesBefore].map(dayNr)), last = Math.max(...[...c.datesBefore].map(dayNr));
      return c.datesBefore.size && dayNr(c.date) - first >= 365 && last - first < 365 && { title: "More than a year of Funky Orbit!", text: "Our first pattern after a whole year of filming days." };
    } },
    { id: "comeback", prio: 46, test: (c) => {
      const last = Math.max(...[...c.datesBefore].map(dayNr));
      return c.datesBefore.size && dayNr(c.date) - last >= 14 && { title: "Welcome back!", text: "Your clubs missed you." };
    } },
    { id: "round", prio: 40, test: (c) => c.isNew && c.doneAfter % 25 === 0 && c.doneAfter % 100 !== 0 && { title: `${c.doneAfter} patterns!`, text: "Another completely arbitrary number to celebrate!" } },
    { id: "session-first", prio: 39, test: (c) => c.datesBefore.size > 0 && !c.datesBefore.has(c.date) && { title: "First pattern of the day!", text: "Let's see how long this confidence lasts." } },
    { id: "named", prio: 38, test: (c) => c.item.name && { title: `“${c.item.name.split(";")[0].trim()}”`, text: "A pattern with a name!" } },
    { id: "notation", prio: 37, test: (c) => c.item.alt && { title: "Popcorn!", text: "That doesn't look legal." } },
    { id: "period-long", prio: 36, test: (c) => c.f.period === c.maxOf("period") && { title: `Period ${c.f.period}!`, text: "Blink and you'll miss the pattern." } },
    { id: "difficult", prio: 35, test: (c) => (c.item.stars || 0) >= 4 && { title: "That's a hard one!", text: "We make this look easy. It isn't." } },
    { id: "after-hard", prio: 34, test: (c) => {
      const prev = c.before.rows.filter((r) => r.date === c.date).at(-1);
      const p = prev && c.list.get(prev.key);
      return p && (p.stars || 0) >= 3.5 && { title: "Another one!", text: "Apparently, we haven't suffered enough." };
    } },
    { id: "hard-low", prio: 33, test: (c) => c.rating && c.rating <= 2 && (c.item.stars || 0) >= 3 && { title: "Hard work…", text: ["Hard work, questionable reward.", "All that effort for this?"] } },
    { id: "late-many", prio: 32, test: (c) => c.night && c.before.rows.filter((r) => r.date === c.date && r.time && (r.time >= "22" || r.time < "06")).length >= 2 && { title: "Still going!", text: "Sleep is temporary. Siteswaps are forever." } },
    // the time we log it (only on the day itself)
    { id: "after-midnight", prio: 31, test: (c) => c.hour !== null && c.hour < 3 && { title: "After midnight!", text: ["Normal people are asleep. We're doing this.", "Nothing good happens after midnight. Except this, apparently."] } },
    { id: "three-am", prio: 31, test: (c) => c.hour !== null && c.hour >= 3 && c.hour < 6 && { title: "3 AM club!", text: "This seemed like a good idea at 3 AM." } },
    { id: "morning", prio: 31, test: (c) => c.hour !== null && c.hour >= 6 && c.hour < 9 && { title: "Early birds!", text: "Some people go jogging. We throw clubs at each other." } },
    { id: "weekday-morning", prio: 31, test: (c) => c.hour !== null && c.hour >= 9 && c.hour < 12 && c.weekday > 0 && c.weekday < 6 && { title: "On a weekday morning?", text: "There are easier ways to spend this time." } },
    { id: "lunch", prio: 31, test: (c) => c.hour !== null && c.hour >= 12 && c.hour < 14 && { title: "Lunch break!", text: "Lunch can wait. The siteswap cannot." } },
    { id: "late-session", prio: 31, test: (c) => c.hour !== null && c.hour >= 22 && { title: "Late session!", text: "One last pattern. Famous last words." } },
    { id: "clubs-many", prio: 25, test: (c) => c.f.clubs >= 8 && { title: `${c.f.clubs} clubs!`, text: "More clubs, more problems." } },
    { id: "clubs-few", prio: 24, test: (c) => c.f.clubs <= 5 && { title: `${c.f.clubs} clubs`, text: "Less is more. Sometimes." } },
    { id: "repeat", prio: 22, test: (c) => !c.isNew && { title: "Again!", text: "We did this one before. Practice makes perfect." } },
    { id: "rating-max", prio: 21, test: (c) => c.rating === 5 && { title: "Five stars!", text: ["Flawless. Someone stop us.", "We should probably do that one again."] } },
    { id: "rating", prio: 20, test: (c) => {
      if (!c.rating || c.rating === 5) return null;
      if (c.rating <= 1) return { title: "Well…", text: ["We tried our best. The rating disagrees.", "It worked. Let's never do it again."] };
      if (c.rating <= 2) return { title: "Done!", text: "It worked. Let's leave it at that." };
      if (c.rating <= 3) return { title: "Done!", text: "Technically a success." };
      return { title: "Nice one!", text: "Okay, we're actually good at this." };
    } },
  ];

  // Expected completion date at the pace so far (unique patterns per calendar day since the first one)
  function estimate(doneAfter, total, dates, today) {
    const first = Math.min(...dates.map(dayNr));
    const days = dayNr(today) - first + 1;
    if (!isFinite(first) || days < 7 || doneAfter < 5 || doneAfter >= total) return "";
    const end = new Date((dayNr(today) + Math.ceil((total - doneAfter) * days / doneAfter)) * 864e5);
    return `${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
  }

  // All milestones for logging `key` (item = the pattern on the list, or null when it is not on it), most special first.
  function check({ item, key, rating, date, time, before, list, total }) {
    const after = { done: new Set(before.done).add(key), rows: [...before.rows, { key, date, time, rating }] };
    const doneItemsBefore = [...before.done].map((k) => list.get(k)).filter(Boolean);
    const datesBefore = new Set(before.rows.map((r) => r.date));
    const maxes = {};
    const c = {
      item, key, rating, date, time, before, after, list, total, doneItemsBefore, datesBefore,
      isNew: !!item && !before.done.has(key),
      f: item ? facts(item) : null,
      countDoneBefore: (fn) => doneItemsBefore.filter(fn).length,
      undone: (fn) => [...list.values()].filter((p) => fn(p) && !after.done.has(p.key)).length,
      maxOf: (k) => (maxes[k] ??= Math.max(0, ...[...list.values()].map((p) => facts(p)[k]))),
      ratedBefore: before.rows.map((r) => r.rating).filter((r) => r != null),
      weekday: new Date(date + "T12:00:00").getDay(),
      weekdaysBefore: new Set([...datesBefore].map((d) => new Date(d + "T12:00:00").getDay())),
      night: !!time && (time >= "22" || time < "06"),
      hour: time ? +time.slice(0, 2) : null,
    };
    // unique patterns of the list done, before and after this one
    c.doneBefore = [...before.done].filter((k) => list.has(k)).length;
    c.doneAfter = [...after.done].filter((k) => list.has(k)).length;
    c.left = total - c.doneAfter;
    c.estimate = estimate(c.doneAfter, total, [...datesBefore, date], date);
    // a pattern that is not on the list only gets the milestones that are not about the pattern
    const ANY = ["birthday", "favourite", "lowest", "weekday-all", "weekday-first", "streak", "busiest", "year", "comeback", "session-first", "late-many", "after-midnight", "three-am", "morning", "weekday-morning", "lunch", "late-session", "rating-max", "rating"];
    const out = [];
    for (const r of RULES) {
      if (!item && !ANY.includes(r.id)) continue;
      let m = null;
      try { m = r.test(c); } catch (e) { m = null; }
      if (m) out.push({ id: r.id, prio: r.prio, title: m.title, text: pick(m.text) });
    }
    // two rating messages say the same thing twice
    if (out.some((m) => m.id === "favourite" || m.id === "lowest")) return { list: out.filter((m) => m.id !== "rating" && m.id !== "rating-max"), estimate: c.estimate };
    return { list: out, estimate: c.estimate };
  }

  window.FO_MILESTONES = { check, facts, ids: RULES.map((r) => r.id), ALIASES };
})();
