const { getProfileText, getProductById } = require('./catalog');
const driveImages = require('./driveImages');

// Link test (placehold.co) khong tinh la anh that -> bo qua de dung anh Drive.
function isPlaceholder(url) {
  return /placehold\.co/i.test(url || '');
}

// Chon URL anh gui cho khach:
//  1. Link that dat tay trong cot "Link anh" cua Sheet (bo qua link placeholder)
//  2. Anh that trong folder Drive, khop theo ma san pham -> proxy qua /img/<ID>
//  3. Khong co anh that -> null (khong gui anh placeholder)
async function resolveImageUrl(product) {
  if (product.image && !isPlaceholder(product.image)) return product.image;
  if (driveImages.isConfigured() && await driveImages.hasImage(product.id)) {
    return driveImages.imageProxyUrl(product.id);
  }
  return null;
}

// Luu lich su hoi thoai ngan han theo tung user (trong RAM, mat khi restart server).
// Voi luong nguoi dung lon hon, nen chuyen sang luu vao Redis/DB.
const conversations = new Map();
const MAX_TURNS = 6; // giu 6 luot gan nhat de tranh gui qua nhieu token moi lan goi

// Prompt hanh vi cua bot. Phan du lieu san pham (profile) duoc noi them tu Google Sheet.
// LUU Y: viet prompt bang tieng Viet CO DAU de bot tra loi co dau (mo hinh bat chuoc van
// phong cua prompt). Du lieu san pham trong Sheet co the khong dau, nhung bot van phai
// tra loi co dau day du.
const BASE_SYSTEM = `Bạn là trợ lý AI của STWatch, tư vấn bán đồng hồ qua tin nhắn. Xưng "em",
gọi khách "anh/chị", trả lời ngắn gọn, thân thiện, lịch sự.

NGÔN NGỮ (RẤT QUAN TRỌNG):
- LUÔN trả lời bằng tiếng Việt CÓ DẤU đầy đủ. Ví dụ đúng: "Dạ còn hàng anh/chị ơi".
  TUYỆT ĐỐI KHÔNG viết tiếng Việt không dấu kiểu "Da con hang anh chi oi".
- Dữ liệu sản phẩm bên dưới có thể viết KHÔNG dấu; bạn vẫn phải trả lời khách CÓ dấu
  (tự thêm dấu cho tên mẫu, mô tả khi nhắc lại cho khách).

QUY TẮC BẮT BUỘC:
1. HÀNG TỒN KHO: Chỉ tư vấn/mời mua những mẫu ghi "CON HANG". Nếu khách hỏi một mẫu đang
   "HET HANG", phải nói RÕ là mẫu đó hiện hết hàng, tuyệt đối KHÔNG mời khách mua mẫu đó,
   rồi gợi ý 1-2 mẫu CÒN HÀNG tương tự (cùng hãng hoặc cùng tầm giá).
2. KHÔNG BỊA: Nếu khách hỏi mẫu/giá không có trong danh sách, nói sẽ kiểm tra kho thật và
   liên hệ lại, không tự bịa giá hay tình trạng.
3. GỬI ẢNH: Khi câu trả lời tập trung vào ĐÚNG MỘT mẫu cụ thể đang CÒN HÀNG và việc cho xem
   ảnh sẽ giúp khách, hãy thêm vào CUỐI câu trả lời, trên một dòng riêng, đúng marker:
   [[IMG:<ID>]]  (thay <ID> bằng đúng mã sản phẩm trong danh sách, ví dụ [[IMG:RL001]]).
   Chỉ gắn MỘT marker ảnh, và chỉ cho mẫu CÒN HÀNG. Nếu đang nói về nhiều mẫu thì không gắn.
   Nếu mẫu đó có ghi "Co clip san pham", hãy CHỦ ĐỘNG mời khách xem clip và gắn thêm marker
   [[CLIP:<ID>]] (trên dòng riêng ở cuối). Chỉ gắn khi mẫu thật sự có ghi "Co clip san pham".
4. CHUYỂN NHÂN VIÊN THẬT: Nếu khách tỏ ra bực bội/phàn nàn, hoặc hỏi ngoài phạm vi dữ liệu
   (không trả lời được bằng thông tin đã có), hoặc khách chủ động đòi gặp người thật -> KHÔNG
   trả lời bừa. Thay vào đó nói: "Dạ, để em chuyển anh/chị cho nhân viên tư vấn trực tiếp hỗ
   trợ nhanh hơn nhé ạ. Anh/chị vui lòng để lại số điện thoại hoặc gọi hotline 0906.632.888
   ạ." và thêm marker [[HANDOFF]] ở cuối câu trả lời.
5. MỤC TIÊU: Mỗi cuộc chat hướng khách đến để lại SĐT hoặc đặt lịch tới showroom.

Các marker [[IMG:...]] và [[HANDOFF]] là tín hiệu kỹ thuật — viết đúng định dạng trên, hệ
thống sẽ tự xóa khỏi tin nhắn trước khi hiển thị cho khách.`;

function getHistory(userId) {
  if (!conversations.has(userId)) conversations.set(userId, []);
  return conversations.get(userId);
}

// Tach marker ky thuat ra khoi van ban hien thi cho khach.
function parseMarkers(rawText) {
  let handoff = false;
  let productId = null;
  let clipId = null;

  let text = rawText.replace(/\[\[HANDOFF\]\]/gi, () => {
    handoff = true;
    return '';
  });

  text = text.replace(/\[\[IMG:\s*([^\]]+?)\s*\]\]/gi, (_m, id) => {
    productId = id.trim();
    return '';
  });

  text = text.replace(/\[\[CLIP:\s*([^\]]+?)\s*\]\]/gi, (_m, id) => {
    clipId = id.trim();
    return '';
  });

  return { text: text.trim(), handoff, productId, clipId };
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
    || 'Dạ em xin lỗi, hệ thống đang gặp chút sự cố, anh/chị thử lại sau ít phút giúp em nhé ạ.';

  const { text: reply, handoff, productId, clipId } = parseMarkers(rawReply);

  // Luu ban da lam sach marker vao lich su (tranh model bat chuoc marker lung tung)
  history.push({ role: 'assistant', content: reply });

  // Chi gui anh khi tim thay san pham dang con hang va co anh that.
  // Neu mau do co clip -> tu dong dinh kem clip luon (khong phu thuoc bot phat marker CLIP).
  let imageUrl = null;
  let clipUrl = null;
  if (productId) {
    const product = await getProductById(productId);
    if (product && product.inStock) {
      imageUrl = await resolveImageUrl(product);
      if (product.clip) clipUrl = product.clip;
    }
  }

  // Marker CLIP tuong minh (neu bot chu dong gan cho 1 mau co clip)
  if (!clipUrl && clipId) {
    const product = await getProductById(clipId);
    if (product && product.clip) clipUrl = product.clip;
  }

  return { reply, imageUrl, clipUrl, productId, handoff };
}

// System prompt rieng cho ca khach GUI ANH nho dinh gia / thu mua.
const APPRAISAL_SYSTEM = `Khách gửi ẢNH một chiếc đồng hồ để nhờ định giá / bán lại cho STWatch.
Bạn là trợ lý của STWatch, trả lời tiếng Việt CÓ DẤU, xưng "em", gọi khách "anh/chị".

Nhiệm vụ:
1. Quan sát ảnh và mô tả ngắn gọn những gì thấy được: hãng/dòng nếu nhận ra, kiểu dáng, màu mặt,
   loại dây, tình trạng bề ngoài. Nếu ảnh mờ/thiếu góc, lịch sự xin thêm ảnh rõ hơn.
2. TUYỆT ĐỐI KHÔNG đưa ra giá thu mua cụ thể hay cam kết. Định giá chính xác phải do nhân viên
   thẩm định trực tiếp (cần kiểm tra máy, giấy tờ, độ thật giả). Cùng lắm chỉ nói một khoảng rất
   chung nếu chắc chắn, kèm câu "giá chính xác cần thẩm định trực tiếp ạ".
3. Hỏi thêm thông tin quan trọng để thẩm định: model/mã tham chiếu, năm mua, tình trạng máy còn
   chạy tốt không, có đủ hộp và giấy tờ không.
4. Mời khách để lại số điện thoại hoặc mang máy tới showroom 285 Phan Văn Trị để nhân viên thẩm
   định báo giá chính xác.
Kết thúc câu trả lời bằng marker [[HANDOFF]] (đây là ca cần nhân viên thẩm định).`;

// Tra loi khi khach GUI ANH (dinh gia/thu mua). image = {url} hoac {base64, mediaType}.
async function getAIReplyForImage(userId, image, caption) {
  const history = getHistory(userId);

  const userContent = [];
  if (image.url) {
    userContent.push({ type: 'image', source: { type: 'url', url: image.url } });
  } else if (image.base64) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType || 'image/jpeg', data: image.base64 },
    });
  }
  userContent.push({
    type: 'text',
    text: (caption && caption.trim()) ? caption.trim() : 'Anh/chị nhờ shop định giá chiếc đồng hồ này ạ.',
  });

  const profile = await getProfileText();
  const messages = [...history.slice(-MAX_TURNS), { role: 'user', content: userContent }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
      max_tokens: 600,
      system: `${APPRAISAL_SYSTEM}\n\n${profile}`,
      messages,
    }),
  });

  const data = await res.json();
  const rawReply = data?.content?.find((block) => block.type === 'text')?.text
    || 'Dạ em đã nhận ảnh của anh/chị. Để em chuyển nhân viên thẩm định hỗ trợ báo giá chính xác nhé ạ.';

  const { text: reply } = parseMarkers(rawReply);

  // Luu placeholder van ban vao lich su (khong luu anh de tranh gui lai moi luot)
  history.push({ role: 'user', content: `[Khách gửi ảnh đồng hồ nhờ định giá]${caption ? ' - ' + caption : ''}` });
  history.push({ role: 'assistant', content: reply });

  // Ca dinh gia luon can nhan vien that
  return { reply, imageUrl: null, clipUrl: null, productId: null, handoff: true };
}

module.exports = { getAIReply, getAIReplyForImage, getHistory };
