// Thong tin nghiep vu CO DINH cua STWatch (dia chi, dich vu) - it thay doi.
//
// Danh sach mau dong ho + gia + ton kho KHONG con go cung o day nua: chung duoc
// doc truc tiep tu Google Sheet qua src/catalog.js. File nay chi giu phan thong
// tin chung + mot ban fallback tinh de trang /demo van chay khi chua cau hinh
// Google Service Account.

const SHOP_INFO = `THONG TIN CUA HANG (dung de tra loi khach, khong duoc bia them):

- Ten: STWatch - Trung tam Thu mua, Tham dinh, Bao duong Dong ho chinh hang
- Dia chi showroom: 285 Phan Van Tri, Phuong Binh Loi Trung, TP.HCM
- Hotline: 0906.632.888
- Zalo tu van: zalo.me/0906632888

DICH VU:
1. Ban dong ho chinh hang (Rolex, Omega, Seiko, Tissot, Casio G-Shock, Orient, Citizen...)
2. Thu mua dong ho cu - gia cao, thanh toan nhanh
3. Tham dinh chinh hang - kiem tra xac thuc nguon goc
4. Bao duong & sua chua - lau dau, thay pin, thay kinh, danh bong
5. Phu kien: day deo, khoa, mat kinh
6. Dao tao hoc vien sua dong ho chuyen nghiep`;

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
