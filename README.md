# Zalo AI Chatbot (Node.js + Claude API)

Bot tự động trả lời tin nhắn Zalo OA bằng AI. Đây là bản MVP để thử nghiệm nhanh — dùng lưu trạng thái đơn giản (file JSON, RAM), phù hợp test với 1 OA, sau này scale thì đổi sang Redis/DB.

## 🎯 Demo nhanh — không cần Zalo (đọc phần này trước)

Trước khi đụng gì tới Zalo OA, hãy dùng trang demo có sẵn để pitch khách trước:

```bash
npm install
cp .env.example .env
# Chỉ cần điền ANTHROPIC_API_KEY trong .env, các biến ZALO_* để trống cũng chạy được
npm start
```

Mở trình duyệt: **http://localhost:3000/demo**

Đây là giao diện chat độc lập, gọi thẳng vào bộ não AI (đúng dữ liệu STWatch đã nạp), **không đụng gì tới Zalo** — không cần OA, không cần gói Tăng trưởng, không cần chờ duyệt. Dùng để:
- Test xem bot trả lời có đúng ý không. Catalog (mẫu/giá/tồn kho) giờ lấy trực tiếp từ **Google Sheet** (xem "Nâng cấp Giai đoạn 1" bên dưới); thông tin cửa hàng cố định nằm ở `src/data/stwatchProfile.js`
- Bot **gửi kèm ảnh** khi khách hỏi 1 mẫu cụ thể còn hàng — demo hiển thị luôn ảnh, test được trước khi cần Zalo thật
- Cầm điện thoại/laptop cho STWatch xem trực tiếp khi pitch — họ thấy bot chạy thật, không phải nói suông
- Lead từ demo cũng được ghi (vào Google Sheet nếu đã cấu hình, không thì `leads.json`), xem tại `/leads?key=...`

> **Chạy demo tối giản:** nếu chưa cấu hình Google, chỉ cần `ANTHROPIC_API_KEY` là demo vẫn chạy với catalog dự phòng tĩnh. Cấu hình Google Sheet để có đủ catalog thật + ảnh + ghi lead vào Sheet.

**Deploy lên Render** (xem Bước 5 bên dưới) rồi mở `https://ten-app.onrender.com/demo` là có link demo public để gửi khách xem từ xa, không cần STWatch cài gì cả.

Chỉ khi STWatch đồng ý dùng thật, mới cần làm các bước Zalo OA bên dưới để gắn bot vào kênh khách hàng thật của họ.

---

## Bước 1 — Tạo Zalo OA (nếu chưa có)

1. Vào https://oa.zalo.me → đăng ký Official Account (miễn phí)
2. Chọn loại hình phù hợp (Doanh nghiệp/Cá nhân) — có thể dùng loại thấp nhất để test trước
3. **Lưu ý quan trọng:** OA chưa xác thực chỉ được nhắn tin cho user trong vòng **7 ngày** kể từ tin nhắn gần nhất của họ. Đủ để test và làm demo cho khách xem.

## Bước 2 — Tạo App trên Zalo Developers

1. Vào https://developers.zalo.me → tạo ứng dụng mới, chọn loại "Official Account"
2. Liên kết App với OA vừa tạo ở bước 1
3. Lấy **App ID** và **Secret Key** trong phần cấu hình app → điền vào file `.env`

## Bước 3 — Lấy access_token & refresh_token lần đầu

Zalo yêu cầu 1 lần cấp quyền thủ công qua trình duyệt (OAuth), sau đó code sẽ tự làm mới token cho các lần sau:

1. Trong trang quản trị App, tìm mục "Công cụ lấy quyền OA" hoặc làm theo hướng dẫn OAuth v4 tại tài liệu Zalo (mục Official Account API → Authentication)
2. Sau khi cấp quyền thành công, bạn sẽ nhận được `access_token` và `refresh_token` đầu tiên → dán vào `.env`

## Bước 4 — Cài đặt & chạy thử ở máy local

```bash
cd zalo-ai-chatbot
npm install
cp .env.example .env
# Mở .env, điền đủ: ZALO_APP_ID, ZALO_SECRET_KEY, ZALO_ACCESS_TOKEN, ZALO_REFRESH_TOKEN, ANTHROPIC_API_KEY
npm start
```

Mở trình duyệt vào `http://localhost:3000` — thấy chữ "Zalo AI chatbot dang chay OK" là server đã chạy.

## Bước 5 — Deploy lên Render (free)

Zalo bắt buộc webhook phải là URL **public HTTPS**, nên không dùng được localhost.

1. Đẩy code này lên 1 GitHub repo (private cũng được)
2. Vào https://render.com → đăng nhập bằng GitHub → "New Web Service" → chọn repo
3. Cấu hình:
   - Build command: `npm install`
   - Start command: `npm start`
4. Vào tab "Environment" → thêm toàn bộ biến trong `.env.example` (điền giá trị thật)
5. Deploy xong, Render cho bạn 1 URL dạng `https://ten-app.onrender.com`

## Bước 6 — Gắn Webhook vào Zalo OA

1. Vào trang quản trị OA → mục "Webhook"
2. Điền URL: `https://ten-app.onrender.com/webhook`
3. Bật các sự kiện muốn nhận, tối thiểu cần: **User gửi tin nhắn văn bản** (`user_send_text`)
4. Lưu lại

## Bước 7 — Test

Dùng điện thoại, tìm OA của bạn trên Zalo, nhắn 1 tin bất kỳ → bot sẽ tự trả lời bằng AI trong vài giây.

## Nâng cấp Giai đoạn 1 (catalog Google Sheet, ảnh, hết hàng, handoff, chống spam, lead vào Sheet)

Bản này đã bổ sung 6 tính năng so với bản MVP gốc:

1. **Catalog đọc từ Google Sheet** (`src/catalog.js`) — mẫu/giá/tồn kho lấy trực tiếp từ Google Sheet của shop, cache 5 phút (không gọi API mỗi tin nhắn). Chủ shop tự sửa Sheet là bot cập nhật, không cần đụng code. Thông tin cửa hàng cố định (địa chỉ, dịch vụ) vẫn ở `src/data/stwatchProfile.js`.
2. **Gửi kèm ảnh** (`src/zaloClient.js` — `sendImageMessage`) — khi bot xác định đúng 1 mẫu cụ thể **còn hàng**, nó lấy cột "Link ảnh" và gửi ảnh qua Zalo (loại tin `image`). Áp dụng luôn cho `/demo-chat` để test ảnh trước khi cần Zalo thật. *(Chiều khách gửi ảnh nhờ định giá — để dành giai đoạn sau.)*
3. **Xử lý hết hàng** — nếu khách hỏi mẫu "Hết hàng", bot nói rõ hết hàng, gợi ý mẫu tương tự còn hàng, không mời mua mẫu đã hết, không gửi ảnh mẫu đó.
4. **Chuyển nhân viên thật (handoff)** — khi khách bực bội/phàn nàn, hỏi ngoài phạm vi dữ liệu, hoặc đòi gặp người thật → bot không trả lời bừa mà báo "để em chuyển anh/chị cho nhân viên tư vấn trực tiếp" + hotline, đồng thời đánh dấu lead cần người thật.
5. **Chống spam cơ bản** (`src/rateLimiter.js`) — giới hạn mỗi user tối đa 10 tin/60 giây (chỉnh qua `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_SEC`); vượt ngưỡng bot trả lời câu mặc định, không gọi Claude → tránh 1 người phá gây tốn API.
6. **Lead ghi vào Google Sheet** (`src/leadStore.js`) — lead tự ghi vào tab "Leads" trong Google Sheet để chủ shop tự xem, không cần link `/leads` kỹ thuật (vẫn giữ `/leads?key=...` để tra nhanh).

### Cấu hình Google Sheet (Service Account)

1. Vào https://console.cloud.google.com → tạo (hoặc chọn) 1 project.
2. **APIs & Services → Library** → bật **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account** → tạo xong vào tab **Keys → Add key → JSON** → tải file JSON về.
4. Mở Google Sheet catalog → **Share** → dán **email service account** (dạng `xxx@yyy.iam.gserviceaccount.com`) với quyền **Editor** (cần Editor để ghi được tab Leads).
5. Đổ biến môi trường (xem `.env.example`):
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = dán **toàn bộ nội dung** file JSON vừa tải.
   - `CATALOG_SHEET_ID` = phần `<ID>` trong URL Sheet `.../spreadsheets/d/<ID>/edit`.
   - (Tùy chọn) `LEADS_SHEET_ID` / `LEADS_TAB` nếu muốn ghi lead sang Sheet/tab khác; mặc định cùng Sheet, tab tên `Leads` (tự tạo nếu chưa có).

> Cấu trúc Sheet catalog: 8 cột theo đúng thứ tự — **ID | Tên mẫu | Hãng | Giá (VND) | Tình trạng | Còn hàng | Mô tả | Link ảnh**. Cột "Còn hàng" ghi `Còn hàng` / `Hết hàng`. "Link ảnh" là URL công khai (Zalo tự tải ảnh từ URL này).

Xem danh sách lead: mở tab **Leads** trong Google Sheet, hoặc `https://ten-app.onrender.com/leads?key=GIA_TRI_ADMIN_KEY_TRONG_ENV`.

**Hướng nâng cấp tiếp theo (chưa làm ở giai đoạn này — cố ý):**
- Khách gửi ảnh nhờ định giá (chiều ngược lại)
- Nhiều shop (multi-tenant)
- Nút bấm nhanh (quick reply) trong Zalo

## Tùy chỉnh

- Đổi tính cách/nhiệm vụ của bot: sửa `SYSTEM_PROMPT` trong `.env` (để trống thì dùng prompt built-in trong `src/claudeClient.js`, đã bao gồm quy tắc hết hàng / gửi ảnh / handoff)
- Bot xử lý tin nhắn văn bản và **gửi ảnh** mẫu khi khách hỏi mẫu cụ thể. Chiều khách gửi ảnh (nhờ định giá), nút bấm, chốt đơn tự động thì mở rộng thêm trong `src/server.js` (khối `if (event.event_name === ...)`)
- Lưu ý free tier Render sẽ "ngủ" sau ~15 phút không có request, tin nhắn đầu tiên sau khi ngủ có thể phản hồi chậm vài giây — bình thường, không phải lỗi.

## Giới hạn cần biết (free/chưa xác thực OA)

- Chỉ nhắn được cho user đã từng nhắn cho OA trong 7 ngày gần nhất (không gửi tin quảng cáo/broadcast chủ động được)
- Giới hạn số tin nhắn/tháng tùy loại tài khoản — kiểm tra lại trong trang quản trị OA nếu bot ngừng gửi được tin
