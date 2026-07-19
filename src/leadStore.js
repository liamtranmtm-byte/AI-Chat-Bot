// Ghi lead vao Google Sheet tab "Leads". MOI User ID chi co 1 DONG (upsert):
// lan sau cap nhat dung dong do, khong them dong moi. Ghi theo TEN cot (header),
// khong theo vi tri -> khong bao gio lech cot. Truong nao chua co thi de trong,
// khong lay gia tri truong khac lap vao.

const fs = require('fs');
const path = require('path');
const { getSheets } = require('./googleClient');

const LEADS_FILE = path.join(__dirname, '..', 'leads.json');
const LEADS_SHEET_ID = process.env.LEADS_SHEET_ID || process.env.CATALOG_SHEET_ID
  || '1RbHSYnAUKQXIY-2c1iw_NVSDclKUdCO2ss4HNr1RsgU';
const LEADS_TAB = process.env.LEADS_TAB || 'Leads';

const HEADER = ['Thoi gian', 'Nguon', 'User ID', 'Ten', 'SDT', 'Mau quan tam',
  'Ngan sach', 'Muon dat lich', 'Thoi gian hen', 'Can nguoi that'];

// Cac truong lead + ten cot chap nhan (khong dau). Doc/ghi deu dua theo header.
const LEAD_FIELDS = [
  { key: 'captured_at', aliases: ['thoi gian', 'time', 'ngay', 'captured'] },
  { key: 'source', aliases: ['nguon', 'source'] },
  { key: 'userId', aliases: ['user id', 'userid', 'user', 'ma user'] },
  { key: 'name', aliases: ['ten', 'ten khach', 'name', 'khach'] },
  { key: 'phone', aliases: ['sdt', 'so dien thoai', 'phone', 'dien thoai', 'so dt'] },
  { key: 'watch_model', aliases: ['mau quan tam', 'mau', 'san pham', 'san pham quan tam', 'watch'] },
  { key: 'budget', aliases: ['ngan sach', 'budget', 'tam gia'] },
  { key: 'wants_appointment', aliases: ['muon dat lich', 'dat lich', 'hen lich', 'appointment'] },
  { key: 'preferred_time', aliases: ['thoi gian hen', 'gio hen', 'lich hen', 'time hen'] },
  { key: 'needs_human', aliases: ['can nguoi that', 'can nhan vien', 'handoff', 'nguoi that'] },
];

let tabEnsured = false;

function normHeader(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// header row -> { fieldKey: colIndex } (-1 neu khong tim thay cot do)
function buildColMap(headerRow) {
  const norm = (headerRow || []).map(normHeader);
  const map = {};
  for (const f of LEAD_FIELDS) map[f.key] = norm.findIndex((h) => f.aliases.includes(h));
  return map;
}

// Gia tri moi cho tung truong (chua merge).
function newValue(key, lead) {
  switch (key) {
    case 'captured_at': return lead.captured_at || new Date().toISOString();
    case 'source': return lead.source || '';
    case 'userId': return lead.userId || '';
    case 'wants_appointment': return lead.wants_appointment ? 'Co' : '';
    case 'needs_human': return lead.needs_human ? 'Co' : '';
    default: return lead[key] != null ? String(lead[key]).trim() : '';
  }
}

// Gop gia tri moi voi gia tri da co trong dong (khong ghi de bang rong).
function mergeValue(key, next, existing) {
  const ex = existing || '';
  if (key === 'captured_at') return ex || next;            // giu thoi diem tao dau tien
  if (key === 'source') return ex || next;                 // giu nguon dau tien
  if (key === 'userId') return next || ex;
  if (key === 'wants_appointment' || key === 'needs_human') {
    return (next === 'Co' || ex === 'Co') ? 'Co' : '';     // dung 1 lan la giu
  }
  return next !== '' ? next : ex;                           // co gia tri moi thi cap nhat, khong thi giu cu
}

// --- Fallback file JSON (khi chua cau hinh Google) ---
function loadLeadsFile() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); } catch { return []; }
}
function upsertLeadFile(lead) {
  const leads = loadLeadsFile();
  const i = leads.findIndex((l) => l.userId && l.userId === lead.userId);
  if (i >= 0) {
    const merged = { ...leads[i] };
    for (const f of LEAD_FIELDS) {
      merged[f.key] = mergeValue(f.key, newValue(f.key, lead), newValue(f.key, leads[i]));
    }
    leads[i] = merged;
  } else {
    const rec = {};
    for (const f of LEAD_FIELDS) rec[f.key] = newValue(f.key, lead);
    leads.push(rec);
  }
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

// Dam bao tab "Leads" ton tai + co dong tieu de.
async function ensureLeadsTab(sheets) {
  if (tabEnsured) return;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: LEADS_SHEET_ID });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === LEADS_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: LEADS_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: LEADS_TAB } } }] },
    });
  }
  // Neu dong dau trong -> ghi header
  const head = await sheets.spreadsheets.values.get({ spreadsheetId: LEADS_SHEET_ID, range: `${LEADS_TAB}!1:1` });
  if (!head.data.values || !head.data.values[0] || !head.data.values[0].length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: LEADS_SHEET_ID, range: `${LEADS_TAB}!A1`,
      valueInputOption: 'RAW', requestBody: { values: [HEADER] },
    });
  }
  tabEnsured = true;
}

// Serialize theo tung user de tranh 2 luot ghi de nhau tao dong trung.
const locks = new Map();
function withUserLock(userId, fn) {
  const prev = locks.get(userId) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(userId, next.catch(() => {}));
  return next;
}

async function upsertSheet(lead) {
  const sheets = getSheets();
  if (!sheets) { upsertLeadFile(lead); return; }

  await ensureLeadsTab(sheets);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: LEADS_SHEET_ID, range: `${LEADS_TAB}!A:Z` });
  const rows = res.data.values || [];
  const header = (rows[0] && rows[0].length) ? rows[0] : HEADER;
  const colMap = buildColMap(header);

  const uidCol = colMap.userId;
  let targetIdx = -1; // index trong rows (1-based du lieu)
  if (uidCol >= 0) {
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][uidCol] || '').trim() === String(lead.userId).trim()) { targetIdx = i; break; }
    }
  }

  const existingRow = targetIdx >= 0 ? rows[targetIdx] : [];
  const width = Math.max(header.length, existingRow.length);
  const out = new Array(width).fill('');
  for (let c = 0; c < existingRow.length; c++) out[c] = existingRow[c] || ''; // giu cot phu

  for (const f of LEAD_FIELDS) {
    const idx = colMap[f.key];
    if (idx < 0 || idx >= width) continue;
    out[idx] = mergeValue(f.key, newValue(f.key, lead), out[idx]);
  }

  if (targetIdx >= 0) {
    const sheetRow = targetIdx + 1; // rows[0] = dong 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: LEADS_SHEET_ID, range: `${LEADS_TAB}!A${sheetRow}`,
      valueInputOption: 'RAW', requestBody: { values: [out] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: LEADS_SHEET_ID, range: `${LEADS_TAB}!A:Z`,
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [out] },
    });
  }
}

// --- API cong khai ---
// Ten giu la appendLead cho tuong thich, nhung hanh vi la UPSERT theo User ID.
async function appendLead(lead) {
  if (!lead || !lead.userId) return lead;
  const record = { ...lead, captured_at: lead.captured_at || new Date().toISOString() };
  return withUserLock(record.userId, async () => {
    try {
      await upsertSheet(record);
    } catch (err) {
      console.error('Loi upsert lead vao Google Sheet, fallback file JSON:', err.message);
      upsertLeadFile(record);
    }
    return record;
  });
}

// Doc lead cho endpoint /leads (theo ten cot).
async function loadLeads() {
  const sheets = getSheets();
  if (sheets) {
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: LEADS_SHEET_ID, range: `${LEADS_TAB}!A:Z` });
      const rows = res.data.values || [];
      if (rows.length <= 1) return [];
      const colMap = buildColMap(rows[0]);
      return rows.slice(1).filter((r) => r.some((c) => String(c || '').trim())).map((row) => {
        const obj = {};
        for (const f of LEAD_FIELDS) obj[f.key] = colMap[f.key] >= 0 ? (row[colMap[f.key]] || '') : '';
        return obj;
      });
    } catch (err) {
      console.error('Loi doc lead tu Google Sheet, fallback file JSON:', err.message);
    }
  }
  return loadLeadsFile();
}

// Xoa toan bo lead (giu dong tieu de). Dung de don dong rac cu.
async function resetLeads() {
  const sheets = getSheets();
  if (!sheets) {
    if (fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
    return { cleared: 'file' };
  }
  await ensureLeadsTab(sheets);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: LEADS_SHEET_ID, range: `${LEADS_TAB}!A:Z` });
  const rows = res.data.values || [];
  const dataRows = Math.max(0, rows.length - 1);
  if (dataRows > 0) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: LEADS_SHEET_ID, range: `${LEADS_TAB}!A2:Z` });
  }
  return { cleared: dataRows };
}

module.exports = { appendLead, loadLeads, resetLeads };
