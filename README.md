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
- Test xem bot trả lời có đúng ý không, chỉnh sửa `src/data/stwatchProfile.js` tới khi ưng
- Cầm điện thoại/laptop cho STWatch xem trực tiếp khi pitch — họ thấy bot chạy thật, không phải nói suông
- Lead từ demo cũng được ghi vào `leads.json` như bên Zalo, xem tại `/leads?key=...`

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

## Bản dành riêng cho STWatch (đồng hồ)

Bản này đã được customize thêm 2 phần so với bản gốc:

1. **Kiến thức nghiệp vụ** (`src/data/stwatchProfile.js`) — thông tin dịch vụ, catalog mẫu, địa chỉ, hotline của STWatch được nạp vào system prompt, để bot trả lời đúng thông tin thật thay vì bịa. **Cần cập nhật file này thường xuyên** khi shop đổi giá/thêm mẫu mới — đây là phần quan trọng nhất quyết định bot có hữu ích hay không.

2. **Tự động ghi nhận lead** (`src/leadExtractor.js` + `src/leadStore.js`) — sau mỗi tin nhắn, hệ thống âm thầm phân tích hội thoại, nếu khách thể hiện ý định mua/bán/đặt lịch rõ ràng thì tự ghi vào `leads.json` (tên, SĐT, mẫu quan tâm, ngân sách, muốn đặt lịch không).

Xem danh sách lead đã ghi nhận: mở `https://ten-app.onrender.com/leads?key=GIA_TRI_ADMIN_KEY_TRONG_ENV`

**Hướng nâng cấp tiếp theo (khi khách hàng đồng ý dùng lâu dài):**
- Đẩy `leads.json` → Google Sheet để chủ shop xem quen thuộc, không cần biết code
- Đẩy catalog thật (tồn kho, giá) từ hệ thống quản lý của shop thay vì gõ tay
- Thêm nút bấm nhanh (quick reply) trong Zalo thay vì để khách gõ tay hoàn toàn

## Tùy chỉnh

- Đổi tính cách/nhiệm vụ của bot: sửa `SYSTEM_PROMPT` trong `.env`
- Bot hiện chỉ xử lý tin nhắn văn bản. Muốn xử lý ảnh, nút bấm, hay chốt đơn tự động thì mở rộng thêm trong `src/server.js` (khối `if (event.event_name === ...)`)
- Lưu ý free tier Render sẽ "ngủ" sau ~15 phút không có request, tin nhắn đầu tiên sau khi ngủ có thể phản hồi chậm vài giây — bình thường, không phải lỗi.

## Giới hạn cần biết (free/chưa xác thực OA)

- Chỉ nhắn được cho user đã từng nhắn cho OA trong 7 ngày gần nhất (không gửi tin quảng cáo/broadcast chủ động được)
- Giới hạn số tin nhắn/tháng tùy loại tài khoản — kiểm tra lại trong trang quản trị OA nếu bot ngừng gửi được tin
