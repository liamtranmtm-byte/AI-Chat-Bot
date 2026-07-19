// Tu chay cac kich ban nghiem thu ngay tren server (goi Claude noi bo) va tra ve
// ket qua JSON. Dung qua GET /admin/selftest?key=ADMIN_KEY
//   - Them &leadwrite=1 de test luon ghi lead vao Sheet (tao 1 dong test, User ID
//     bat dau bang "SELFTEST-", ban co the xoa hoac chay /admin/leads-reset sau do).
// LUU Y: endpoint nay goi Claude nhieu lan -> ton token, chi dung de nghiem thu.

const { getAIReply, getAIReplyForImage } = require('./claudeClient');
const { extractLead } = require('./leadExtractor');
const { appendLead, loadLeads } = require('./leadStore');
const { checkRate } = require('./rateLimiter');
const { getProductById } = require('./catalog');

// Anh test nho (1x1) cho kich ban vision - du de kiem tra guardrail "khong ra gia".
const TEST_IMG = { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', mediaType: 'image/png' };

const MONEY_RE = /\d[\d.,]*\s*(triệu|trieu|tr\b|đ|vnd|nghìn|nghin|ngàn|ngan|\bk\b)/i;

function uid(tag) { return `selftest-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`; }
function norm(s) { return String(s || '').toLowerCase(); }

async function runSelfTest({ leadWrite = false } = {}) {
  const R = [];
  const add = (scenario, check, status, detail, reply) => R.push({ scenario, check, status, detail, reply });

  // ===== KB1 - Do chinh xac du lieu =====
  try {
    const om = await getProductById('OM001');
    const u1 = uid('kb1a');
    const r = await getAIReply(u1, 'shop oi con omega seamaster 300m gia nhieu vay a');
    const priceCore = (om && om.price || '').replace(/[^\d.]/g, ''); // 145.000.000
    const digits = priceCore.replace(/\D/g, '');
    const rl = norm(r.reply);
    const ok = rl.includes(priceCore.toLowerCase()) || rl.replace(/[.,\s]/g, '').includes(digits) || /145\s*(triệu|tr)/i.test(r.reply);
    add('KB1a-gia-omega', `Giá đúng ${om ? om.price : '?'}`, ok ? 'PASS' : 'FAIL', ok ? '' : 'Không thấy giá đúng trong câu trả lời', r.reply);
  } catch (e) { add('KB1a-gia-omega', 'Giá đúng', 'ERROR', e.message); }

  try {
    const u = uid('kb1b');
    const r = await getAIReply(u, 'cho em xin cai hinh con rolex datejust 126233 di shop');
    const ok = Boolean(r.imageUrl);
    add('KB1b-anh-126233', 'Gửi ảnh thật (RL001)', ok ? 'PASS' : 'FAIL', ok ? `imageUrl=${r.imageUrl}` : 'imageUrl rỗng (kiểm tra RL001.png đã ở Drive chưa)', r.reply);
  } catch (e) { add('KB1b-anh-126233', 'Gửi ảnh', 'ERROR', e.message); }

  try {
    const u = uid('kb1c');
    const r = await getAIReply(u, 'a muon coi con rolex datejust 116234, con hang k shop');
    const saidOut = /h[eế]t\s*h[aà]ng|hết|het hang/i.test(r.reply);
    const noImg = !r.imageUrl;
    const ok = saidOut && noImg;
    add('KB1c-116234-het-hang', 'Báo hết hàng + KHÔNG gửi ảnh', ok ? 'PASS' : 'FAIL', `báo hết=${saidOut}, không ảnh=${noImg}`, r.reply);
  } catch (e) { add('KB1c-116234-het-hang', 'Hết hàng', 'ERROR', e.message); }

  // ===== KB2 - Tinh huong kho =====
  try {
    const u = uid('kb2a');
    const r = await getAIReply(u, 'sao nhan hoai khong ai rep vay');
    const polite = /xin lỗi|thông cảm|em đây|dạ/i.test(r.reply);
    add('KB2a-phan-nan', 'Xin lỗi / xoa dịu', polite ? 'PASS' : 'REVIEW', 'Xem câu trả lời', r.reply);
  } catch (e) { add('KB2a-phan-nan', 'Xoa dịu', 'ERROR', e.message); }

  try {
    const u = uid('kb2b');
    const r = await getAIReply(u, 'thai do kieu gi vay, cho toi gap nguoi that noi chuyen');
    add('KB2b-gap-nguoi-that', 'Chuyển nhân viên (handoff)', r.handoff ? 'PASS' : 'FAIL', `handoff=${r.handoff}`, r.reply);
  } catch (e) { add('KB2b-gap-nguoi-that', 'Handoff', 'ERROR', e.message); }

  try {
    const u = uid('kb2c');
    const r = await getAIReply(u, 'shop sua dong ho hublot khong, sua may automatic ton khoang nhieu');
    const hasPrice = MONEY_RE.test(r.reply);
    add('KB2c-hublot-khong-bia-gia', 'KHÔNG bịa giá sửa (FAIL nếu có số tiền)', hasPrice ? 'REVIEW' : 'PASS', hasPrice ? '⚠️ Có token giá tiền — kiểm tra có bịa giá sửa không' : 'Không đưa giá cụ thể', r.reply);
  } catch (e) { add('KB2c-hublot-khong-bia-gia', 'Không bịa giá', 'ERROR', e.message); }

  // Spam: goi checkRate 12 lan cho 1 user
  try {
    const u = uid('kb2d');
    let allowed = 0, blocked = 0;
    for (let i = 0; i < 12; i++) { checkRate(u).allowed ? allowed++ : blocked++; }
    const ok = allowed === 10 && blocked === 2;
    add('KB2d-chong-spam', 'Chặn spam ở tin 11 (10 cho phép / 2 chặn)', ok ? 'PASS' : 'FAIL', `allowed=${allowed}, blocked=${blocked}`);
  } catch (e) { add('KB2d-chong-spam', 'Chống spam', 'ERROR', e.message); }

  // ===== KB3 - Ph...eu chuyen doi (Hoa) =====
  try {
    const u = leadWrite ? `SELFTEST-HOA-${Date.now()}` : uid('kb3');
    const turns = [
      'chao shop, e thay video con seamaster xanh tren tiktok a, con hang k a',
      'gia nay co bot duoc khong shop',
      'e o xa, co coi ky duoc may truoc khi mua khong, so mua lua',
      'vay chieu thu 7 nay e ghe duoc khong, khoang 3h',
      'da e ten Hoa, sdt 0909123456',
    ];
    let discountReply = '';
    let lastReply = '';
    for (const t of turns) {
      const r = await getAIReply(u, t);
      lastReply = r.reply;
      if (/bớt|giảm|bot duoc|giam gia/i.test(t)) discountReply = r.reply;
    }
    const gaveDiscount = /giảm \d|bớt \d|còn \d[\d.,]*\s*(triệu|tr|đ)/i.test(discountReply);
    add('KB3-khong-tu-giam-gia', 'KHÔNG tự giảm giá (FAIL nếu có)', gaveDiscount ? 'REVIEW' : 'PASS', 'Câu trả lời cho "có bớt không"', discountReply);

    // Trich lead tu hoi thoai
    const { getHistory } = require('./claudeClient');
    const lead = await extractLead(u, getHistory(u), { source: 'selftest' });
    const fieldsOk = norm(lead.name).includes('hoa') && String(lead.phone || '').includes('0909123456');
    add('KB3-trich-lead-dung-truong', 'Tên=Hoa, SĐT=0909123456 đúng trường', fieldsOk ? 'PASS' : 'FAIL',
      `name=${JSON.stringify(lead.name)}, phone=${JSON.stringify(lead.phone)}, wants_appointment=${lead.wants_appointment}, preferred_time=${JSON.stringify(lead.preferred_time)}`);

    if (leadWrite) {
      await appendLead(lead);
      await appendLead({ userId: u, source: 'selftest', has_lead: true, wants_appointment: true, preferred_time: 'chieu thu 7 khoang 3h' });
      const all = await loadLeads();
      const mine = all.filter((l) => l.userId === u);
      const row = mine[0] || {};
      const oneRow = mine.length === 1;
      const colOk = norm(row.name).includes('hoa') && String(row.phone || '').includes('0909123456') && row.wants_appointment === 'Co';
      add('KB3-sheet-1-dong-dung-cot', 'Đúng 1 dòng, đúng cột trong Sheet', (oneRow && colOk) ? 'PASS' : 'FAIL',
        `Số dòng cho User ID này=${mine.length}; Tên=${row.name}, SĐT=${row.phone}, Mẫu=${row.watch_model}, Ngân sách=${row.budget}, Muốn đặt lịch=${row.wants_appointment}, Thời gian hẹn=${row.preferred_time} (User ID test: ${u} — nhớ xoá/reset sau)`);
    }
  } catch (e) { add('KB3-pheu', 'Phễu Hoa', 'ERROR', e.message); }

  // ===== KB4 - Vision khong ra gia =====
  try {
    const u = uid('kb4');
    const r = await getAIReplyForImage(u, TEST_IMG, 'cai nay cua em dinh ban lai, shop coi gia giup em duoc khong');
    const hasPrice = MONEY_RE.test(r.reply);
    add('KB4-vision-khong-ra-gia', 'KHÔNG tự ra giá + chuyển thẩm định (FAIL nghiêm trọng nếu ra giá)',
      hasPrice ? 'FAIL' : 'PASS', hasPrice ? '⚠️ Câu trả lời có token giá tiền!' : `handoff=${r.handoff}`, r.reply);
  } catch (e) { add('KB4-vision-khong-ra-gia', 'Vision không ra giá', 'ERROR', e.message); }

  const summary = { PASS: 0, FAIL: 0, REVIEW: 0, ERROR: 0 };
  for (const x of R) summary[x.status] = (summary[x.status] || 0) + 1;
  return { build: require('./version'), ranAt: new Date().toISOString(), leadWrite, summary, results: R };
}

module.exports = { runSelfTest };
