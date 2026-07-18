// Ghi lead vao Google Sheet de chu shop tu xem truc tiep (quen thuoc, khong can
// vao link /leads ky thuat). Neu chua cau hinh Google -> fallback ghi file
// leads.json de demo van chay.

const fs = require('fs');
const path = require('path');
const { getSheets } = require('./googleClient');

const LEADS_FILE = path.join(__dirname, '..', 'leads.json');
const LEADS_SHEET_ID = process.env.LEADS_SHEET_ID || process.env.CATALOG_SHEET_ID
  || '1KvKyXhIE5UV3UueSejjEJ8RZvp3D_DXl-xpWvefACTs';
const LEADS_TAB = process.env.LEADS_TAB || 'Leads';

const HEADER = ['Thoi gian', 'Nguon', 'User ID', 'Ten', 'SDT', 'Mau quan tam',
  'Ngan sach', 'Muon dat lich', 'Thoi gian hen', 'Can nguoi that'];

let tabEnsured = false;

function leadToRow(lead) {
  return [
    lead.captured_at || new Date().toISOString(),
    lead.source || '',
    lead.userId || '',
    lead.name || '',
    lead.phone || '',
    lead.watch_model || '',
    lead.budget || '',
    lead.wants_appointment ? 'Co' : '',
    lead.preferred_time || '',
    lead.needs_human ? 'Co' : '',
  ];
}

// Dam bao tab "Leads" ton tai + co dong tieu de. Chi chay 1 lan / vong doi server.
async function ensureLeadsTab(sheets) {
  if (tabEnsured) return;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: LEADS_SHEET_ID });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === LEADS_TAB);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: LEADS_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: LEADS_TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: LEADS_SHEET_ID,
      range: `${LEADS_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER] },
    });
  }

  tabEnsured = true;
}

// --- Fallback file JSON ---
function loadLeadsFile() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function appendLeadFile(lead) {
  const leads = loadLeadsFile();
  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

// --- API cong khai ---
async function appendLead(lead) {
  const record = { ...lead, captured_at: lead.captured_at || new Date().toISOString() };

  const sheets = getSheets();
  if (sheets) {
    try {
      await ensureLeadsTab(sheets);
      await sheets.spreadsheets.values.append({
        spreadsheetId: LEADS_SHEET_ID,
        range: `${LEADS_TAB}!A:J`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [leadToRow(record)] },
      });
      return record;
    } catch (err) {
      console.error('Loi ghi lead vao Google Sheet, fallback file JSON:', err.message);
    }
  }

  appendLeadFile(record);
  return record;
}

// Doc lead cho endpoint /leads. Uu tien Google Sheet, fallback file JSON.
async function loadLeads() {
  const sheets = getSheets();
  if (sheets) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: LEADS_SHEET_ID,
        range: `${LEADS_TAB}!A:J`,
      });
      const rows = res.data.values || [];
      if (rows.length <= 1) return [];
      const keys = ['captured_at', 'source', 'userId', 'name', 'phone', 'watch_model',
        'budget', 'wants_appointment', 'preferred_time', 'needs_human'];
      return rows.slice(1).map((row) => {
        const obj = {};
        keys.forEach((k, i) => { obj[k] = row[i] || ''; });
        return obj;
      });
    } catch (err) {
      console.error('Loi doc lead tu Google Sheet, fallback file JSON:', err.message);
    }
  }
  return loadLeadsFile();
}

module.exports = { appendLead, loadLeads };
