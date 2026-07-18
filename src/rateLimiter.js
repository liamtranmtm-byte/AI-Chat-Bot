// Chan spam co ban: gioi han so lan goi Claude cho 1 user trong 1 cua so thoi
// gian ngan, tranh 1 nguoi nhan lien tuc gay ton API. Luu trong RAM (mat khi
// restart) - du cho MVP; luong lon hon nen chuyen sang Redis.

const MAX_CALLS = Number(process.env.RATE_LIMIT_MAX) || 10; // so tin toi da
const WINDOW_MS = (Number(process.env.RATE_LIMIT_WINDOW_SEC) || 60) * 1000; // moi cua so

const hits = new Map(); // userId -> [timestamp, ...]

// Tra ve { allowed, remaining, retryAfterSec }. Goi 1 lan moi tin nhan; neu
// allowed=false thi KHONG goi Claude, tra ve cau tra loi mac dinh.
function checkRate(userId) {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const recent = (hits.get(userId) || []).filter((t) => t > windowStart);

  if (recent.length >= MAX_CALLS) {
    hits.set(userId, recent);
    const retryAfterSec = Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  recent.push(now);
  hits.set(userId, recent);
  return { allowed: true, remaining: MAX_CALLS - recent.length, retryAfterSec: 0 };
}

// Don rac dinh ky de Map khong phinh vo han khi co nhieu user.
setInterval(() => {
  const windowStart = Date.now() - WINDOW_MS;
  for (const [userId, times] of hits) {
    const recent = times.filter((t) => t > windowStart);
    if (recent.length) hits.set(userId, recent);
    else hits.delete(userId);
  }
}, WINDOW_MS).unref();

module.exports = { checkRate };
