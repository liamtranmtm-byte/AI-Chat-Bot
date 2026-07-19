// Goi them 1 lan Claude (rieng biet voi cau tra loi chinh) de "doc" hoi thoai
// va rut ra thong tin lead dang JSON. Tach rieng khoi cau tra loi chinh de
// prompt tra loi khach khong bi anh huong boi yeu cau "xuat JSON".

const SYSTEM = `Ban doc doan hoi thoai giua KHACH va BOT tu van dong ho, rut ra thong tin lead.
Tra ve DUY NHAT mot JSON object (khong markdown, khong chu thua), dung schema:
{"has_lead": boolean, "name": string|null, "phone": string|null, "watch_model": string|null, "budget": string|null, "wants_appointment": boolean, "preferred_time": string|null}

DINH NGHIA TUNG TRUONG (rat quan trong, khong duoc nham lan):
- name: TEN RIENG cua KHACH (con nguoi), vd "Hoa", "anh Nam". TUYET DOI khong phai ten/ma
  dong ho (vd "Rolex Datejust 116231" KHONG phai name).
- phone: SO DIEN THOAI khach de lai (chuoi chu so, vd "0909123456"). KHONG phai gia tien,
  KHONG phai so tham chieu dong ho.
- watch_model: mau dong ho khach quan tam.
- budget: ngan sach/tam gia khach noi ra (neu co). KHONG phai gio hen, KHONG phai gia niem yet.
- wants_appointment: true neu khach muon dat lich/ghe showroom.
- preferred_time: thoi gian khach muon hen/ghe (vd "chieu thu 7 khoang 3h"). KHONG bo vao budget.

QUY TAC:
- has_lead = true CHI KHI khach de lai ten/SDT, HOAC the hien y dinh mua/ban/tham dinh/dat lich
  RO RANG. Chi hoi gia, xin xem anh, hoi dia chi... => has_lead = false.
- Truong nao KHONG chac chan hoac khach chua cung cap => de null. TUYET DOI khong suy doan,
  khong lay gia tri cua truong khac lap vao cho trong.`;

// SDT hop le: du chu so, khong phai gia tien.
function looksLikePhone(v) {
  if (!v) return false;
  const s = String(v);
  if (/[đ₫]|vnd|trieu|tr\b/i.test(s)) return false;      // co don vi tien
  if (/\d[.,]\d{3}([.,]\d{3})*/.test(s)) return false;    // dinh dang nghin: 265.000.000
  const digits = (s.match(/\d/g) || []).length;
  return digits >= 8 && digits <= 15;
}

// Ten co ve la ten dong ho (khong phai ten khach)?
function looksLikeWatch(v) {
  if (!v) return false;
  return /rolex|omega|seiko|tissot|casio|orient|citizen|datejust|seamaster|g-?shock|snk|prx|powermatic|\b\d{4,6}\b/i.test(String(v));
}

function sanitize(lead) {
  const out = { ...lead };
  if (out.phone && !looksLikePhone(out.phone)) out.phone = null;
  if (out.name && looksLikeWatch(out.name)) out.name = null;
  // has_lead thuc su: phai co it nhat 1 tin hieu chac chan
  const hasSignal = Boolean(out.name || out.phone || out.wants_appointment);
  if (!hasSignal) out.has_lead = false;
  return out;
}

async function extractLead(userId, history, meta = {}) {
  const recentTurns = history.slice(-8)
    .map((m) => `${m.role === 'user' ? 'Khach' : 'Bot'}: ${m.content}`)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: 'user', content: recentTurns }],
    }),
  });

  const data = await res.json();
  const text = data?.content?.find((b) => b.type === 'text')?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/); // Claude doi khi boc ```json

  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return { userId, ...sanitize(parsed), ...meta };
  } catch (err) {
    console.error('Khong parse duoc JSON lead extraction:', text);
    return { userId, has_lead: false, ...meta };
  }
}

module.exports = { extractLead };
