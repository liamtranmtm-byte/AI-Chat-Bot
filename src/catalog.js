// Nguon du lieu san pham: doc truc tiep tu Google Sheet cua shop (thay cho viec
// go cung trong stwatchProfile.js). Cache lai vai phut de khong goi Sheets API
// moi tin nhan -> nhanh hon + tiet kiem quota.
//
// Sheet co 8 cot (dong dau la tieu de):
//   ID | Ten mau | Hang | Gia (VND) | Tinh trang | Con hang | Mo ta | Link anh

const { getSheets } = require('./googleClient');
const { SHOP_INFO, STATIC_CATALOG_FALLBACK } = require('./data/stwatchProfile');

const SHEET_ID = process.env.CATALOG_SHEET_ID || '1RbHSYnAUKQXIY-2c1iw_NVSDclKUdCO2ss4HNr1RsgU';
// Cot A..I: ID | Ten mau | Hang | Gia | Tinh trang | Con hang | Mo ta | Link anh | Link clip
const SHEET_RANGE = process.env.CATALOG_RANGE || 'A:I';
const CACHE_MS = (Number(process.env.CATALOG_CACHE_MINUTES) || 5) * 60 * 1000;

let cache = { products: null, profileText: null, fetchedAt: 0 };

function formatPrice(raw) {
  const n = Number(String(raw).replace(/[^\d]/g, ''));
  if (!n) return String(raw || '').trim() || 'lien he';
  return n.toLocaleString('vi-VN') + 'd';
}

// "Con hang" / "Het hang" / rong -> boolean. Mac dinh con hang neu khong ghi "het".
function parseInStock(value) {
  return !/h[eế]t/i.test(String(value || ''));
}

// Nhan dien dong tieu de (co Sheet co header, co Sheet khong) de khong lam mat
// san pham o dong dau. Coi la header neu cot ID ghi "ID" hoac cot gia khong phai so.
function looksLikeHeader(row) {
  if (!row) return false;
  const first = String(row[0] || '').trim().toLowerCase();
  if (first === 'id') return true;
  const priceCell = String(row[3] || '');
  const secondCell = String(row[1] || '').toLowerCase();
  const hasPriceDigits = /\d/.test(priceCell);
  return !hasPriceDigits && /ten|mau|mẫu|name/.test(secondCell);
}

function rowToProduct(row) {
  const [id, name, brand, price, condition, stock, description, image, clip] = row;
  if (!id && !name) return null; // bo qua dong trong
  if (String(id || '').trim().toLowerCase() === 'id') return null; // bo dong header lot vao
  return {
    id: String(id || '').trim(),
    name: String(name || '').trim(),
    brand: String(brand || '').trim(),
    price: formatPrice(price),
    condition: String(condition || '').trim(),
    inStock: parseInStock(stock),
    description: String(description || '').trim(),
    image: String(image || '').trim(),
    clip: String(clip || '').trim(),
  };
}

function buildProfileText(products) {
  const lines = products.map((p) => {
    const stock = p.inStock ? 'CON HANG' : 'HET HANG';
    const parts = [
      `- [${p.id}] ${p.name}${p.brand ? ` (${p.brand})` : ''}`,
      `Gia: ${p.price}`,
      p.condition ? `Tinh trang: ${p.condition}` : null,
      `Kho: ${stock}`,
      p.description ? `Mo ta: ${p.description}` : null,
      p.clip ? 'Co clip san pham' : null,
    ].filter(Boolean);
    return parts.join(' | ');
  });

  return `${SHOP_INFO}

DANH SACH SAN PHAM HIEN CO (nguon: he thong quan ly kho, cap nhat dinh ky - chi
duoc tra loi dua tren danh sach nay, KHONG bia mau/gia ngoai danh sach):
${lines.join('\n')}`;
}

async function fetchFromSheet() {
  const sheets = getSheets();
  if (!sheets) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
  });

  const rows = res.data.values || [];
  if (!rows.length) return null;

  // Bo dong header neu co; Sheet khong header thi giu nguyen tu dong dau
  const dataRows = looksLikeHeader(rows[0]) ? rows.slice(1) : rows;
  const products = dataRows.map(rowToProduct).filter(Boolean);
  return products.length ? products : null;
}

// Tra ve mang san pham (da cache). Fallback sang du lieu tinh neu chua cau hinh
// Google hoac Sheet loi -> trang /demo van chay duoc.
async function getProducts() {
  const now = Date.now();
  if (cache.products && now - cache.fetchedAt < CACHE_MS) return cache.products;

  try {
    const products = await fetchFromSheet();
    if (products) {
      cache = { products, profileText: buildProfileText(products), fetchedAt: now };
      return products;
    }
    console.warn('Sheet catalog rong hoac chua cau hinh - dung du lieu tinh fallback.');
  } catch (err) {
    console.error('Loi doc Google Sheet catalog, dung fallback tinh:', err.message);
  }

  // Fallback: giu lai cache cu neu co, neu khong dung du lieu tinh
  if (cache.products) return cache.products;
  const fb = STATIC_CATALOG_FALLBACK;
  cache = { products: fb, profileText: buildProfileText(fb), fetchedAt: now };
  return fb;
}

// Chuoi mo ta san pham nhet vao system prompt cua bot.
async function getProfileText() {
  await getProducts(); // dam bao cache.profileText da duoc dung
  return cache.profileText;
}

// Tra ve san pham theo ID (dung de lay Link anh khi bot muon gui anh).
async function getProductById(id) {
  if (!id) return null;
  const products = await getProducts();
  const target = String(id).trim().toLowerCase();
  return products.find((p) => p.id.toLowerCase() === target) || null;
}

module.exports = { getProducts, getProfileText, getProductById };
