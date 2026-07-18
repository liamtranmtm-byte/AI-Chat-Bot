const { getProfileText, getProductById } = require('./catalog');

// Luu lich su hoi thoai ngan han theo tung user (trong RAM, mat khi restart server).
// Voi luong nguoi dung lon hon, nen chuyen sang luu vao Redis/DB.
const conversations = new Map();
const MAX_TURNS = 6; // giu 6 luot gan nhat de tranh gui qua nhieu token moi lan goi

// Prompt hanh vi cua bot. Phan du lieu san pham (profile) duoc noi them tu Google Sheet.
const BASE_SYSTEM = `Ban la tro ly AI cua STWatch, tu van ban dong ho qua tin nhan. Tra loi
bang tieng Viet, ngan gon, than thien, xung "em" - goi khach "anh/chi".

QUY TAC BAT BUOC:
1. HANG TON KHO: Chi tu van/moi mua nhung mau ghi "CON HANG". Neu khach hoi mot mau dang
   "HET HANG", phai noi RO la mau do hien het hang, tuyet doi KHONG moi khach mua mau do,
   roi goi y 1-2 mau CON HANG tuong tu (cung hang hoac cung tam gia).
2. KHONG BIA: Neu khach hoi mau/gia khong co trong danh sach, noi se kiem tra kho that va
   lien he lai, khong tu bia gia hay tinh trang.
3. GUI ANH: Khi cau tra loi tap trung vao DUNG MOT mau cu the dang CON HANG va viec cho xem
   anh se giup khach, hay them vao CUOI cau tra loi, tren mot dong rieng, dung marker:
   [[IMG:<ID>]]  (thay <ID> bang dung ma san pham trong danh sach, vd [[IMG:RL001]]).
   Chi gan MOT marker anh, va chi cho mau CON HANG. Neu dang noi ve nhieu mau -> khong gan.
4. CHUYEN NHAN VIEN THAT: Neu khach to ra buc boi/phan nan, hoac hoi ngoai pham vi du lieu
   (khong tra loi duoc bang thong tin da co), hoac khach chu dong doi gap nguoi that -> KHONG
   co tra loi bua. Thay vao do noi: "Da, de em chuyen anh/chi cho nhan vien tu van truc tiep
   ho tro nhanh hon nhe ang. Anh/chi vui long de lai so dien thoai hoac goi hotline
   0906.632.888 ah." va them marker [[HANDOFF]] o cuoi cau tra loi.
5. MUC TIEU: Moi cuoc chat huong khach den de lai SDT hoac dat lich toi showroom.

Cac marker [[IMG:...]] va [[HANDOFF]] la tin hieu ky thuat - viet dung dinh dang tren, he
thong se tu xoa khoi tin nhan truoc khi hien cho khach.`;

function getHistory(userId) {
  if (!conversations.has(userId)) conversations.set(userId, []);
  return conversations.get(userId);
}

// Tach marker ky thuat ra khoi van ban hien thi cho khach.
function parseMarkers(rawText) {
  let handoff = false;
  let productId = null;

  let text = rawText.replace(/\[\[HANDOFF\]\]/gi, () => {
    handoff = true;
    return '';
  });

  text = text.replace(/\[\[IMG:\s*([^\]]+?)\s*\]\]/gi, (_m, id) => {
    productId = id.trim();
    return '';
  });

  return { text: text.trim(), handoff, productId };
}

// Tra ve { reply, imageUrl, productId, handoff }.
async function getAIReply(userId, userMessage) {
  const history = getHistory(userId);
  history.push({ role: 'user', content: userMessage });

  const profile = await getProfileText();
  const systemPrompt = `${process.env.SYSTEM_PROMPT || BASE_SYSTEM}\n\n${profile}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
      max_tokens: 500,
      system: systemPrompt,
      messages: history.slice(-MAX_TURNS),
    }),
  });

  const data = await res.json();
  const rawReply = data?.content?.find((block) => block.type === 'text')?.text
    || 'Xin loi, minh dang gap su co, ban thu lai sau nhe.';

  const { text: reply, handoff, productId } = parseMarkers(rawReply);

  // Luu ban da lam sach marker vao lich su (tranh model bat chuoc marker lung tung)
  history.push({ role: 'assistant', content: reply });

  // Chi gui anh khi tim thay san pham va no dang con hang va co Link anh
  let imageUrl = null;
  if (productId) {
    const product = await getProductById(productId);
    if (product && product.inStock && product.image) imageUrl = product.image;
  }

  return { reply, imageUrl, productId, handoff };
}

module.exports = { getAIReply, getHistory };
