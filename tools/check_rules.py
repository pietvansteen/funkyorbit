#!/usr/bin/env python3
"""
Compare site/rules/engine.js with the Sheet for every pattern on the list (#62).

  python3 tools/check_rules.py [folder]

The folder holds difficulty.csv, colors.csv and sync_colors.csv (default testdata/). The rules run in headless Chrome,
or in JavaScriptCore on a Mac. Lists every difference; exits with 1 when there is one.
"""

import csv
import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"

CHECK = r"""
const R = FORules, out = [];
let nScore = 0, nColour = 0, nRound = 0;
const nRoundStars = [];
const pat = (s) => R.parse(s.includes("|") ? s.replace(/\s*\|\s*/, " ") : s);
for (const r of SHEET.difficulty) {
  const p = pat(r.pattern);
  if (!p) { out.push(`score ${r.pattern}: not read as a valid pattern`); continue; }
  const s = R.score(p);
  nScore++;
  if (s.unknown) { out.push(`score ${r.pattern}: no weight for ${s.unknown}`); continue; }
  const l = [];
  // Up to 0.1 is rounding: the Sheet's layer 2 column does not always equal the sum of its own breakdown (a5a8522: 8.0 and 8.1).
  const gap = Math.abs(s.score - r.score);
  if (gap > 0.01 && gap < 0.101) { nRound++; if (s.stars !== r.stars) nRoundStars.push(`${r.pattern} (${s.score} ${s.stars}★, sheet ${r.score} ${r.stars}★)`); }
  else if (gap > 0.01) l.push(`score ${s.score} sheet ${r.score}`);
  if (gap <= 0.01 && s.stars !== r.stars) l.push(`stars ${s.stars} sheet ${r.stars}`);
  if (l.length) out.push(`score ${r.pattern} (${s.seq}): ${l.join(", ")}\n    sheet: ${r.detail}\n    js:    ${s.layer2.map((x) => x.label + (x.again ? " (h)" : "") + " " + x.points).join(" · ")}`);
}
for (const r of SHEET.colors) {
  const p = pat(r.pattern);
  if (!p) { out.push(`colour ${r.pattern}: not read as a valid pattern`); continue; }
  const c = R.colours(p);
  nColour++;
  const code = Array.isArray(c.code) ? c.code.join(" ") : c.code;
  if (code !== r.code) out.push(`colour ${r.pattern}: js ${code} sheet ${r.code}  [${c.orbits.map((o) => o.throws.map((x) => x.t).join("") + "=" + o.color + ":" + o.rule).join("  ")}]`);
}
out.push(`${nRound} score(s) 0.1 off by rounding, of which ${nRoundStars.length} on the edge of a star: ${nRoundStars.join(", ")}`);
out.push(`checked ${nScore} scores and ${nColour} colour codes: ${out.length - 1} difference(s)`);
RESULT(out.join("\n"));
"""


def main():
    folder = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "testdata"
    rows = lambda name: list(csv.DictReader(open(folder / name, encoding="utf-8")))
    sheet = {
        "difficulty": [{"pattern": r["Patroon"], "score": float(r["Score"]), "l1": float(r["Laag 1"]), "l2": float(r["Laag 2"]),
                        "stars": float(r["Sterren"]), "detail": r["Opbouw laag 2"]} for r in rows("difficulty.csv")],
        "colors": [{"pattern": r["Siteswap"], "code": r["Kleurcode"]} for r in rows("colors.csv")]
                  + [{"pattern": f'{r["Jongleur A"]} {r["Jongleur B"]}', "code": r["Kleurcode"]} for r in rows("sync_colors.csv") if r["Jongleur A"].strip()],
    }
    engine = (ROOT / "site/rules/engine.js").read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory() as d:
        script = os.path.join(d, "check.js")
        with open(script, "w", encoding="utf-8") as f:
            f.write(f"var SHEET = {json.dumps(sheet)};\nvar RESULT = print;\n{engine}\n{CHECK}")
        if not os.path.exists(JSC):
            sys.exit("Needs JavaScriptCore (Mac); on another system, run the check script in any browser console.")
        res = subprocess.run([JSC, script], capture_output=True, text=True)
    print(res.stdout, end="")
    if res.returncode or res.stderr:
        sys.exit(res.stderr or "the check crashed")
    last = res.stdout.strip().splitlines()[-1]
    sys.exit(0 if last.endswith(": 0 difference(s)") else 1)


if __name__ == "__main__":
    main()
