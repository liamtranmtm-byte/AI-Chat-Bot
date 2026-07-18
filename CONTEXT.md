# Bối cảnh dự án — Watch AI Chatbot Kit

Tóm tắt để bất kỳ ai (hoặc AI nào) tiếp quản dự án đều nắm được ngay, không cần hỏi lại từ đầu.

## Mục tiêu kinh doanh

Xây bộ chatbot AI bán cho các shop đồng hồ cũ ở TP.HCM, bắt đầu từ khách hàng đầu tiên là
**STWatch** (285 Phan Văn Trị, Bình Thạnh — hotline 0906 632 888 — stwatch.vn).

Mô hình bán hàng của các shop này: khách xem TikTok review đồng hồ → nhắn Zalo hỏi/tư vấn →
tới showroom chốt. Vấn đề: nhân viên trả lời chậm/bỏ sót tin nhắn ngoài giờ, không có hệ
thống ghi nhận lead có cấu trúc.

**Mô hình giá đang chào STWatch:**
- Setup 1 lần: 2.000.000đ (dựng bot, nạp catalog, kịch bản tư vấn riêng)
- Duy trì: 500.000đ/tháng (chi phí Claude API + hosting + hỗ trợ)
- Riêng phí gói Zalo OA (Tăng trưởng, 1.4tr/6th hoặc 2.5tr/năm) khách tự trả thẳng cho Zalo,
  không qua mình — bắt buộc để bật Chatbot/API (Zalo đổi cấu trúc gói từ 01/06/2026).

**Danh sách khách hàng tiềm năng khác** (đã research, xếp ưu tiên): SGWatch (Gò Vấp, TikTok
@sgwatchvn 47.3K follower, có review phàn nàn trả lời chậm — dùng đúng góc đó để mở lời),
Trường Watch (Q4, chủ shop tên Trường, review toàn tích cực — góc pitch là "mở rộng cái đang
tốt" chứ không phải "sửa lỗi"). Chi tiết đầy đủ 16 shop nằm trong file Excel
"Danh-sach-shop-dong-ho-cu-HCM.xlsx" (không nằm trong repo này, lưu riêng).

## Chiến lược quan trọng nhất: tách Demo khỏi Zalo

Zalo OA giờ **không còn miễn phí** cho việc tích hợp Chatbot/API (đổi từ 01/06/2026, xác nhận
tại zalo.solutions/oa/pricing) — bắt buộc khách phải mua gói Tăng trưởng trở lên mới chạy được.

→ Vì vậy toàn bộ việc **build/test/demo cho khách xem KHÔNG được phụ thuộc vào Zalo**. Route
`/demo` chạy hoàn toàn độc lập, gọi thẳng vào cùng bộ não AI, không cần Zalo OA/API key Zalo gì
cả. Chỉ khi khách đồng ý dùng thật, mới cần xử lý phần Zalo OA (đăng ký gói Tăng trưởng, hoặc
xin "OA thử nghiệm kỹ thuật" qua email oa@zalo.me để test trước khi khách trả tiền).

## Kiến trúc kỹ thuật

```
Khách nhắn (Zalo that HOẶC trang /demo)
        ↓
src/server.js (Express)  ── chặn spam (src/rateLimiter.js, 10 tin/60s/user)
        ↓
src/claudeClient.js → gọi Anthropic API (model: claude-sonnet-5)
        system prompt = BASE_SYSTEM (có dấu, quy tắc hết hàng/ảnh/handoff)
                       + SHOP_INFO (src/data/stwatchProfile.js)
                       + catalog động đọc từ Google Sheet (src/catalog.js, cache 5')
        bot phát marker [[IMG:<ID>]] / [[HANDOFF]] -> server tách ra xử lý
        ↓
Trả lời → (Zalo that: src/zaloClient.js gửi text + ảnh qua Zalo Send API)
          (Demo: trả JSON {reply, imageUrl, handoff} cho public/index.html)
        ↓
Ảnh sản phẩm: src/driveImages.js lấy từ folder Google Drive (tên file = mã SP),
              phục vụ qua route /img/<ID> (ổn định cho cả Zalo lẫn demo)
        ↓
src/leadExtractor.js chạy ngầm, trích JSON lead
        ↓
src/leadStore.js ghi lead vào Google Sheet tab "Leads" (fallback leads.json)
```

**File quan trọng:**
- `src/server.js` — Express app: `/webhook` (Zalo), `/demo-chat` (API demo), `/demo` (trang tĩnh),
  `/img/<ID>` (ảnh sản phẩm từ Drive), `/leads?key=...` (xem lead, bảo vệ bằng ADMIN_KEY)
- `src/catalog.js` — **đọc catalog từ Google Sheet** + cache + build profile cho bot. Dữ liệu
  sản phẩm (giá/mẫu/tồn kho) giờ nằm trong Sheet, KHÔNG gõ cứng nữa — chủ shop tự sửa Sheet.
- `src/data/stwatchProfile.js` — chỉ còn **thông tin cửa hàng cố định** (địa chỉ, dịch vụ) +
  fallback tĩnh khi chưa cấu hình Google.
- `src/googleClient.js` — xác thực Service Account (Sheets + Drive)
- `src/driveImages.js` — lấy ảnh sản phẩm từ folder Drive theo mã, phục vụ qua `/img/<ID>`
- `src/rateLimiter.js` — chặn spam
- `src/leadExtractor.js` + `src/leadStore.js` — trích lead + ghi vào Google Sheet tab "Leads"
- `src/claudeClient.js` — gọi Claude, prompt hành vi (có dấu), xử lý marker ảnh/handoff
- `src/zaloClient.js` — refresh token Zalo (~25h) + gửi text/ảnh qua Zalo Send API
- `public/index.html` — giao diện demo (tông đồng hồ cao cấp), hiển thị ảnh + cờ handoff
- `README.md` — hướng dẫn setup đầy đủ (đọc "Demo nhanh — không cần Zalo" + "Nâng cấp Giai đoạn 1")

## Trạng thái hiện tại

- ✅ Code đã lên GitHub (branch `claude/git-init-add-commit-push-3jkfpv`)
- ✅ **Đã deploy Render** (`ai-chat-bot-oqzq.onrender.com`) — demo chạy thật
- ✅ **Google Sheet nối thông**: catalog + lead (tab "Leads") + ảnh sản phẩm (folder Drive)
- ⬜ Chưa đụng tới Zalo OA thật (đúng chủ đích — chỉ làm sau khi có khách chốt)
- ✅ Đã có file pitch "De-xuat-hop-tac-STWatch.docx" và danh sách 16 khách hàng tiềm năng
  (lưu ngoài repo, không phải file code)

## Giai đoạn 1 — ĐÃ HOÀN THÀNH (đã test trên bản deploy)

1. ✅ Catalog đọc từ Google Sheet (cache 5'), không còn gõ cứng
2. ✅ Bot gửi kèm ảnh khi khách hỏi 1 mẫu cụ thể còn hàng — ảnh thật từ folder Drive
   (tên file = mã SP), phục vụ qua `/img/<ID>`; link `placehold.co` bị bỏ qua
3. ✅ Xử lý hết hàng: báo hết hàng + gợi ý mẫu tương tự, không gửi ảnh mẫu đã hết
4. ✅ Chuyển nhân viên thật (handoff) khi khách bực/hỏi ngoài dữ liệu/đòi gặp người
5. ✅ Chống spam: 10 tin/60s mỗi user
6. ✅ Lead ghi vào Google Sheet tab "Leads"
   Cộng thêm: bot trả lời tiếng Việt CÓ DẤU.

**Config cần cho vận hành (đã set trên Render):** `ANTHROPIC_API_KEY`, `ADMIN_KEY`,
`GOOGLE_SERVICE_ACCOUNT_JSON`, `CATALOG_SHEET_ID`, `DRIVE_IMAGE_FOLDER_ID`. Chi tiết ở README
mục "Nâng cấp Giai đoạn 1". Ảnh hiện là ảnh minh hoạ có nhãn — cần thay bằng ảnh thật của shop.

## Giai đoạn 2 — ĐÃ LÀM (chờ nghiệm thu trên demo)

1. ✅ Khách gửi ảnh nhờ định giá (Claude vision) — Zalo nhận `user_send_image`; demo có nút 📷.
   Bot mô tả + hỏi thêm thông tin + chuyển nhân viên thẩm định; KHÔNG tự ra giá thu mua.
2. ✅ Clip sản phẩm — cột thứ 9 "Link clip" trong Sheet; marker [[CLIP:ID]]; demo hiện nút "Xem
   clip", Zalo gửi link.
3. ✅ Thông báo lead/handoff cho nhân viên qua webhook (`LEAD_NOTIFY_WEBHOOK_URL`,
   Slack/Google Chat/Discord). Để trống = tắt.

Config GĐ2 (tuỳ chọn): thêm cột "Link clip" vào Sheet; đặt `LEAD_NOTIFY_WEBHOOK_URL` nếu muốn
thông báo. Chi tiết ở README mục "Nâng cấp Giai đoạn 2".

## Việc cần làm tiếp theo (backlog còn lại)

- Quick-reply (nút bấm nhanh) trong Zalo — cần Zalo thật mới test đầy đủ
- Multi-tenant: 1 hệ thống phục vụ nhiều shop (mỗi shop 1 Sheet/OA riêng)

**Nguyên tắc giữ nguyên:** CHỈ khi có khách đồng ý dùng thật mới xử lý Zalo OA thật (README có
mục "OA thử nghiệm kỹ thuật" + gói Tăng trưởng). Không tự ý mở rộng ngoài phạm vi đã chốt.
