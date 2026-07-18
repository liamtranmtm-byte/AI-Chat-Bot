// Luu lead vao file JSON dang mang (demo MVP). Len production nen doi sang
// Google Sheet (de chu shop xem quen thuoc) hoac DB that.
const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, '..', 'leads.json');

function loadLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function appendLead(lead) {
  const leads = loadLeads();
  leads.push({ ...lead, captured_at: new Date().toISOString() });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

module.exports = { loadLeads, appendLead };
