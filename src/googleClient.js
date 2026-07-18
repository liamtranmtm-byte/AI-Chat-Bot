// Xac thuc Google Service Account de doc/ghi Google Sheets.
//
// Cach cau hinh (chon 1 trong 2, uu tien JSON):
//  1. GOOGLE_SERVICE_ACCOUNT_JSON = toan bo noi dung file key JSON tai tu Google
//     Cloud Console (dan nguyen ca khoi { ... } vao bien moi truong).
//  2. GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY (private key co the thay xuong dong
//     bang chuoi "\n", code se tu doi lai).
//
// Neu chua cau hinh gi -> tra ve null, cac module goi se tu dong fallback (vd
// catalog dung du lieu tinh, lead ghi vao file JSON) de trang /demo van chay duoc.

const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly', // doc anh san pham tu folder Drive
];

let cachedAuth;   // undefined = chua thu; null = khong cau hinh
let cachedSheets;
let cachedDrive;

function readCredentials() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawJson && rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson);
      return { client_email: parsed.client_email, private_key: parsed.private_key };
    } catch (err) {
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON khong phai JSON hop le:', err.message);
      return null;
    }
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    // Render/.env thuong luu private key voi "\n" thay vi xuong dong that
    return { client_email: clientEmail, private_key: privateKey.replace(/\\n/g, '\n') };
  }

  return null;
}

// Tra ve JWT auth da xac thuc (dung chung cho Sheets + Drive), hoac null neu chua cau hinh.
function getAuth() {
  if (cachedAuth !== undefined) return cachedAuth;

  const creds = readCredentials();
  if (!creds || !creds.client_email || !creds.private_key) {
    console.warn('Chua cau hinh Google Service Account - se fallback (catalog tinh, lead ghi file).');
    cachedAuth = null;
    return null;
  }

  cachedAuth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
  });
  console.log(`Google Service Account san sang: ${creds.client_email}`);
  return cachedAuth;
}

// Tra ve sheets client da xac thuc, hoac null neu chua cau hinh.
function getSheets() {
  if (cachedSheets !== undefined) return cachedSheets;
  const auth = getAuth();
  cachedSheets = auth ? google.sheets({ version: 'v4', auth }) : null;
  return cachedSheets;
}

// Tra ve drive client da xac thuc, hoac null neu chua cau hinh.
function getDrive() {
  if (cachedDrive !== undefined) return cachedDrive;
  const auth = getAuth();
  cachedDrive = auth ? google.drive({ version: 'v3', auth }) : null;
  return cachedDrive;
}

function isConfigured() {
  return getAuth() !== null;
}

module.exports = { getAuth, getSheets, getDrive, isConfigured };
