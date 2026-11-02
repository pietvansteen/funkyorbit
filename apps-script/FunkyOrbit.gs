/*
 * Funky Orbit: writes a pattern we juggled as a new row in the "Done" tab.
 * Called by the likes API (POST /api/done, from the hidden Add page); it is a web app bound to the Sheet.
 *
 * Setup (once), see the README:
 *   1. In the Sheet: Extensions > Apps Script, add a new script file (+ > Script) called FunkyOrbit and paste this file
 *      in it. Other files (like Code.gs with COUNTBYCOLOR) stay as they are: all files share one project, so the
 *      names here are kept unique and there must be no other doPost.
 *   2. Project Settings > Script properties: add SECRET with a long random value.
 *   3. Deploy > New deployment > Web app: execute as Me, access Anyone. Copy the /exec URL.
 *   4. On the server, in .env: SHEET_WRITE_URL=<the /exec URL> and SHEET_WRITE_SECRET=<the same SECRET>.
 * After changing this file: Deploy > Manage deployments > edit > New version (the URL stays the same).
 *
 * Request body (JSON): {"secret", "id", "pattern", "date": "YYYY-MM-DD", "time": "HH:MM" | "", "rating": 0.5..5 | null,
 *                      "felt": 0.5..5 | null, "firstTry": true | false, "niceVideo": true | false}
 * Answer: {"ok": true, "row", "nr", "name", "family"} or {"error": "..."}
 *
 * Only date (with the time, when given), pattern, rating, difficulty felt, first try and nice video / location are
 * written (the last three in the columns with those headers, wherever they are): "nr" is already filled in on the empty rows (and added when missing),
 * "known name" and "family" are formulas over the whole column.
 */

const DONE_TAB = "Done";
const DONE_COL = { nr: 1, date: 2, pattern: 3, name: 4, family: 5, rating: 6 };
const DONE_FELT = "difficulty felt", DONE_FIRST_TRY = "first try", DONE_NICE_VIDEO = "nice video / location"; // found by header

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return doneAnswer({ error: "invalid JSON" });
  }
  const secret = PropertiesService.getScriptProperties().getProperty("SECRET");
  if (!secret || body.secret !== secret) return doneAnswer({ error: "wrong secret" });

  const pattern = String(body.pattern || "").trim();
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.date || "");
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(body.time || "");
  const rating = body.rating == null || body.rating === "" ? "" : Number(body.rating);
  if (!pattern || !date) return doneAnswer({ error: "pattern and date are needed" });
  if (rating !== "" && !(rating >= 0.5 && rating <= 5)) return doneAnswer({ error: "rating goes from 0.5 to 5" });
  const felt = body.felt == null || body.felt === "" ? "" : Number(body.felt);
  if (felt !== "" && !(felt >= 0.5 && felt <= 5)) return doneAnswer({ error: "difficulty goes from 0.5 to 5" });
  const firstTry = body.firstTry === true;
  const niceVideo = body.niceVideo === true;

  // The same request twice (a retry after a slow answer) gives the first answer again instead of a second row.
  const cache = CacheService.getScriptCache();
  const id = body.id ? "done:" + String(body.id).slice(0, 64) : "";
  const seen = id && cache.get(id);
  if (seen) return doneAnswer(JSON.parse(seen));

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(DONE_TAB);
    if (!sheet) return doneAnswer({ error: "no tab called " + DONE_TAB });

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((h) => h.trim().toLowerCase());
    const feltCol = headers.indexOf(DONE_FELT) + 1, firstTryCol = headers.indexOf(DONE_FIRST_TRY) + 1, niceVideoCol = headers.indexOf(DONE_NICE_VIDEO) + 1;
    if (felt !== "" && !feltCol) return doneAnswer({ error: "no column called " + DONE_FELT });
    if (firstTry && !firstTryCol) return doneAnswer({ error: "no column called " + DONE_FIRST_TRY });
    if (niceVideo && !niceVideoCol) return doneAnswer({ error: "no column called " + DONE_NICE_VIDEO });

    // the new row: right below the last row with a pattern
    const patterns = sheet.getRange(2, DONE_COL.pattern, sheet.getMaxRows() - 1, 1).getDisplayValues();
    let last = 1;
    patterns.forEach((r, i) => { if (r[0].trim() !== "") last = i + 2; });
    const row = last + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 50);

    let nr = sheet.getRange(row, DONE_COL.nr).getValue();
    if (nr === "") {
      nr = (row > 2 ? Number(sheet.getRange(row - 1, DONE_COL.nr).getValue()) || 0 : 0) + 1;
      sheet.getRange(row, DONE_COL.nr).setValue(nr);
    }
    // date and time in one cell; the Progress formulas round it down to the day where they count days.
    // Read in the Sheet's own time zone: the script's time zone may differ (then 00:00 here showed as 09:00 there).
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    const when = Utilities.parseDate(body.date + " " + (time ? time[0] : "00:00"), tz, "yyyy-MM-dd HH:mm");
    sheet.getRange(row, DONE_COL.date).setNumberFormat(time ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy").setValue(when);
    // as text, so 8556666 stays a siteswap and 1e3 never turns into a number
    sheet.getRange(row, DONE_COL.pattern).setNumberFormat("@").setValue(pattern);
    if (rating !== "") sheet.getRange(row, DONE_COL.rating).setValue(rating);
    if (felt !== "") sheet.getRange(row, feltCol).setValue(felt);
    if (firstTry) sheet.getRange(row, firstTryCol).setValue(true);
    if (niceVideo) sheet.getRange(row, niceVideoCol).setValue(true);
    SpreadsheetApp.flush();

    const result = {
      ok: true, row: row, nr: Number(nr),
      name: sheet.getRange(row, DONE_COL.name).getDisplayValue(),
      family: sheet.getRange(row, DONE_COL.family).getDisplayValue(),
    };
    if (id) cache.put(id, JSON.stringify(result), 600);
    return doneAnswer(result);
  } finally {
    lock.releaseLock();
  }
}

function doneAnswer(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
