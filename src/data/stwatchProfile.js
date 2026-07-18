// Thong tin nghiep vu CO DINH cua STWatch (dia chi, dich vu) - it thay doi.
//
// Danh sach mau dong ho + gia + ton kho KHONG con go cung o day nua: chung duoc
// doc truc tiep tu Google Sheet qua src/catalog.js. File nay chi giu phan thong
// tin chung + mot ban fallback tinh de trang /demo van chay khi chua cau hinh
// Google Service Account.

const SHOP_INFO = `THÔNG TIN CỬA HÀNG (dùng để trả lời khách, không được bịa thêm):

- Tên: STWatch - Trung tâm Thu mua, Thẩm định, Bảo dưỡng Đồng hồ chính hãng
- Địa chỉ showroom: 285 Phan Văn Trị, Phường Bình Lợi Trung, TP.HCM
- Hotline: 0906.632.888
- Zalo tư vấn: zalo.me/0906632888

DỊCH VỤ:
1. Bán đồng hồ chính hãng (Rolex, Omega, Seiko, Tissot, Casio G-Shock, Orient, Citizen...)
2. Thu mua đồng hồ cũ - giá cao, thanh toán nhanh
3. Thẩm định chính hãng - kiểm tra xác thực nguồn gốc
4. Bảo dưỡng & sửa chữa - lau dầu, thay pin, thay kính, đánh bóng
5. Phụ kiện: dây đeo, khóa, mặt kính
6. Đào tạo học viên sửa đồng hồ chuyên nghiệp`;

// Ban fallback tinh (khop cau truc voi du lieu keo tu Sheet) - chi dung khi
// Google Sheet chua cau hinh / loi ket noi.
const STATIC_CATALOG_FALLBACK = [
  {
    id: 'RL001',
    name: 'Rolex Datejust 126233 Champagne',
    brand: 'Rolex',
    price: '275.000.000d',
    condition: 'Da qua su dung 95%',
    inStock: true,
    description: 'Mat so champagne - day Jubilee - day du hop va giay to',
    image: '',
  },
  {
    id: 'RL002',
    name: 'Rolex Datejust 116231',
    brand: 'Rolex',
    price: '265.000.000d',
    condition: 'Da qua su dung 90%',
    inStock: true,
    description: 'Mat so bac - day kim loai - co giay kiem dinh',
    image: '',
  },
];

module.exports = { SHOP_INFO, STATIC_CATALOG_FALLBACK };
