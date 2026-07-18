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
    || 'Dạ em xin lỗi, hệ thống đang gặp chút sự cố, anh/chị thử lại sau ít phút giúp em nhé ạ.';

  const { text: reply, handoff, productId } = parseMarkers(rawReply);

  // Luu ban da lam sach marker vao lich su (tranh model bat chuoc marker lung tung)
  history.push({ role: 'assistant', content: reply });

  // Chi gui anh khi tim thay san pham dang con hang va co anh that
  let imageUrl = null;
  if (productId) {
    const product = await getProductById(productId);
    if (product && product.inStock) imageUrl = await resolveImageUrl(product);
  }

  return { reply, imageUrl, productId, handoff };
}

module.exports = { getAIReply, getHistory };
