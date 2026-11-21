/**
 * Ember — sync endpoint for a Google Sheet.
 * Paste this into Extensions → Apps Script of your Ember sheet, set SECRET, and deploy as a Web app
 * (Execute as: Me, Who has access: Anyone). See SETUP.md.
 */

// Any long random text. Paste the same text into Ember → Settings → Sync key.
const SECRET = 'PASTE-YOUR-OWN-LONG-RANDOM-KEY-HERE';

const TABLES = {
  Log: ['id', 'date', 'itemId', 'item', 'topic', 'grade', 'bpm', 'mode', 'note', 'updatedAt', 'deleted'],
  Items: ['id', 'topic', 'section', 'name', 'bpm', 'note', 'links', 'active', 'setlist', 'kind', 'method', 'chords', 'updatedAt', 'deleted'],
};

function doGet() {
  return out({ ok: true, app: 'Ember' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return out({ ok: false, error: 'Bad request' });
  }
  if (!SECRET || SECRET.indexOf('PASTE-') === 0 || body.key !== SECRET) return out({ ok: false, error: 'Wrong sync key' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.items && body.items.length) upsert('Items', body.items);
    if (body.log && body.log.length) upsert('Log', body.log);
    return out({ ok: true, items: readAll('Items'), log: readAll('Log') });
  } finally {
    lock.releaseLock();
  }
}

function sheetFor(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const cols = TABLES[name];
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // keep text as text
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function upsert(name, records) {
  const sh = sheetFor(name);
  const cols = TABLES[name];
  const last = sh.getLastRow();
  const existing = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
  const rowOf = {};
  existing.forEach(function (r, i) { rowOf[r[0]] = i; });
  const updAt = cols.indexOf('updatedAt');
  const appends = [];

  records.forEach(function (rec) {
    if (!rec || !rec.id) return;
    const row = cols.map(function (c) {
      const v = rec[c];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
    if (rec.id in rowOf) {
      const i = rowOf[rec.id];
      if (Number(rec.updatedAt || 0) >= Number(existing[i][updAt] || 0)) {
        sh.getRange(i + 2, 1, 1, cols.length).setValues([row]);
      }
    } else {
      appends.push(row);
      rowOf[rec.id] = -1;
    }
  });
  if (appends.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, appends.length, cols.length).setNumberFormat('@').setValues(appends);
  }
}

function readAll(name) {
  const sh = sheetFor(name);
  const cols = TABLES[name];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols.length).getValues().map(function (r) {
    const o = {};
    cols.forEach(function (c, i) {
      let v = r[i];
      if (v === '' || v === null) return;
      if (c === 'links') { try { v = JSON.parse(v); } catch (e) { v = []; } }
      else if (c === 'bpm' || c === 'updatedAt') v = Number(v);
      else if (c === 'active' || c === 'setlist' || c === 'deleted') v = String(v) === 'true';
      else v = String(v);
      o[c] = v;
    });
    return o;
  });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
