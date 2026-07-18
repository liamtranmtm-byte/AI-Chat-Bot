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
src/server.js (Express)
        ↓
src/claudeClient.js → gọi Anthropic API (model: claude-sonnet-5)
        kèm system prompt = SYSTEM_PROMPT + STWATCH_PROFILE (src/data/stwatchProfile.js)
        ↓
Trả lời → (Zalo that: src/zaloClient.js gửi qua Zalo Send API)
          (Demo: trả thẳng JSON cho public/index.html hiển thị)
        ↓
src/leadExtractor.js chạy ngầm, phân tích hội thoại, trích JSON lead
        ↓
src/leadStore.js ghi vào leads.json nếu có lead thật
```

**File quan trọng:**
- `src/server.js` — Express app, có 4 route: `/webhook` (Zalo that), `/demo-chat` (API cho demo),
  `/demo` (serve trang tĩnh `public/index.html`), `/leads?key=...` (xem lead, bảo vệ bằng ADMIN_KEY)
- `src/data/stwatchProfile.js` — **kiến thức nghiệp vụ của STWatch, cần cập nhật thường xuyên**
  khi đổi giá/mẫu mới. Đây là phần quyết định bot có hữu ích hay không, quan trọng hơn code.
- `src/zaloClient.js` — refresh token Zalo (hết hạn ~25h) + gửi tin nhắn qua Zalo Send API
- `public/index.html` — giao diện demo, thiết kế riêng tông đồng hồ cao cấp (đen/vàng/đỏ),
  không phụ thuộc Zalo
- `README.md` — hướng dẫn setup đầy đủ, gồm cả các bước Zalo OA (đọc phần "Demo nhanh — không
  cần Zalo" trước tiên)

## Trạng thái hiện tại

- ✅ Code đã lên GitHub
- ⬜ Chưa deploy lên Render
- ⬜ Chưa đụng tới Zalo OA thật (đúng chủ đích — chỉ làm sau khi có khách chốt)
- ✅ Đã có file pitch "De-xuat-hop-tac-STWatch.docx" và danh sách 16 khách hàng tiềm năng
  (lưu ngoài repo, không phải file code)

## Việc cần làm tiếp theo

1. Deploy repo này lên Render (Build: `npm install`, Start: `npm start`)
2. Set biến môi trường tối thiểu: `ANTHROPIC_API_KEY` (từ console.anthropic.com), `ADMIN_KEY`
   (tự đặt). Biến `ZALO_*` để trống — chưa cần.
3. Set spend limit cho Anthropic API key (Settings → Billing) để tránh phát sinh chi phí ngoài ý
   muốn khi test.
4. Mở `https://<ten-app>.onrender.com/demo` để test, chỉnh `src/data/stwatchProfile.js` tới khi
   bot trả lời đúng ý.
5. Dùng link demo đó + file pitch để tiếp cận STWatch và các shop trong danh sách dự phòng.
6. CHỈ khi có khách đồng ý dùng thật mới quay lại xử lý phần Zalo OA (README có hướng dẫn chi
   tiết mục "OA thử nghiệm kỹ thuật" và đăng ký gói Tăng trưởng).
