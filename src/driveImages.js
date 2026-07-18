// Anh san pham that: doc tu 1 folder Google Drive, khop file theo MA san pham.
// Chu shop chi can dat ten file theo ma (vd RL001.jpg) roi tha vao folder, khong
// can dan link vao Sheet.
//
// Server phuc vu lai anh qua chinh domain cua minh: GET /img/<ID>. Cach nay giup
// Zalo (va trinh duyet) tai anh on dinh, thay vi hotlink truc tiep Drive (hay bi tu choi).
//
// Setup 1 lan: share folder Drive do cho email service account (hoac "anyone with
// link: viewer"), va set DRIVE_IMAGE_FOLDER_ID = ID folder.

const { getDrive } = require('./googleClient');

const FOLDER_ID = process.env.DRIVE_IMAGE_FOLDER_ID || '';
const CACHE_MS = (Number(process.env.DRIVE_CACHE_MINUTES) || 5) * 60 * 1000;
// URL goc de tao link tuyet doi cho Zalo. Render tu set RENDER_EXTERNAL_URL.
const BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

let cache = { map: null, fetchedAt: 0 };

function isConfigured() {
  return Boolean(FOLDER_ID) && Boolean(getDrive());
}

// Chuan hoa ten file -> cac khoa co the khop voi ma san pham.
// "RL001.jpg" -> ["rl001"];  "RL001 - mat truoc.png" -> ["rl001 - mat truoc", "rl001"]
function keysFromFileName(name) {
  const noExt = name.replace(/\.[^.]+$/, '').trim().toLowerCase();
  const firstToken = noExt.split(/[\s._-]+/)[0];
  return firstToken && firstToken !== noExt ? [noExt, firstToken] : [noExt];
}

// Lay map { key -> {id, mimeType} } tu folder Drive (co cache).
async function getMap() {
  const now = Date.now();
  if (cache.map && now - cache.fetchedAt < CACHE_MS) return cache.map;

  const drive = getDrive();
  if (!drive || !FOLDER_ID) return null;

  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`,
    fields: 'files(id, name, mimeType)',
    pageSize: 1000,
  });

  const map = new Map();
  for (const f of res.data.files || []) {
    for (const key of keysFromFileName(f.name)) {
      if (!map.has(key)) map.set(key, { id: f.id, mimeType: f.mimeType });
    }
  }
  cache = { map, fetchedAt: now };
  return map;
}

async function findFile(productId) {
  if (!productId) return null;
  const map = await getMap();
  if (!map) return null;
  return map.get(String(productId).trim().toLowerCase()) || null;
}

// Co anh that cho ma nay khong?
async function hasImage(productId) {
  try {
    return Boolean(await findFile(productId));
  } catch (err) {
    console.error('Loi kiem tra anh Drive:', err.message);
    return false;
  }
}

// URL anh de gui cho khach (tuyet doi neu biet BASE_URL, khong thi tuong doi cho demo).
function imageProxyUrl(productId) {
  const path = `/img/${encodeURIComponent(productId)}`;
  return BASE_URL ? `${BASE_URL}${path}` : path;
}

// Stream bytes anh ra HTTP response. Tra ve true neu gui duoc, false neu khong tim thay.
async function streamImage(productId, res) {
  const file = await findFile(productId);
  if (!file) return false;

  const drive = getDrive();
  const driveRes = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'stream' },
  );

  res.setHeader('Content-Type', file.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=300'); // cache 5 phut phia client/Zalo
  await new Promise((resolve, reject) => {
    driveRes.data.on('end', resolve).on('error', reject).pipe(res);
  });
  return true;
}

module.exports = { isConfigured, hasImage, imageProxyUrl, streamImage };
