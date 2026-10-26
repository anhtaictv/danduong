# Tìm đường & Phân loại tài liệu

Ứng dụng web minh họa các thuật toán tìm kiếm trên bản đồ đường bộ thật (tỉnh Đắk Lắk, dữ liệu OpenStreetMap) và các thuật toán phân loại văn bản tiếng Việt.

## Tính năng

**Tìm đường.** Chọn điểm đi A và điểm đến B (tìm theo tên hoặc click trên bản đồ). App chạy 7 thuật toán rồi so sánh quãng đường, số đỉnh mở rộng và thời gian chạy của từng thuật toán:

| Thuật toán | Ý tưởng |
|---|---|
| BFS | Duyệt theo chiều rộng (theo số cạnh) |
| DFS | Duyệt theo chiều sâu |
| DLS | DFS giới hạn độ sâu |
| IDS | DLS với giới hạn tăng dần |
| UCS | Mở rộng đỉnh có tổng quãng đường nhỏ nhất (Dijkstra) |
| A\* | f = g + h, với h là khoảng cách đường chim bay đến đích |
| Greedy Best-First | Chỉ dựa vào h |

Click một dòng trong bảng kết quả để xem quá trình tìm kiếm của thuật toán đó (màu xanh) và đường đi tìm được (màu vàng). Có thể chọn tốc độ vẽ chậm lại để dễ trình bày.

**Phân loại tài liệu.** Gồm 3 mô hình Naive Bayes, kNN (TF-IDF + cosine) và Decision Tree (ID3), huấn luyện trên 48 tài liệu mẫu thuộc 4 chủ đề: Thể thao, Công nghệ, Kinh tế, Sức khỏe. Độ chính xác được đánh giá bằng leave-one-out. Có thể xem cây quyết định mà ID3 dựng được.

## Chạy

Cần cài [Node.js](https://nodejs.org) phiên bản 22 trở lên.

```sh
npm install
npm run dev        # chạy thử khi phát triển
node test.mjs      # kiểm tra thuật toán
npm run exe        # đóng gói thành release/danduong.exe
```

File `danduong.exe` chạy được trên Windows mà không cần cài Node: nhấp đúp để mở app trong trình duyệt, đóng cửa sổ console để tắt app.

## Dữ liệu

- Đường bộ vùng TP Buôn Ma Thuột có sẵn trong `public/osm-bmt.json`. Muốn tải lại file này thì chạy `node scripts/prefetch.mjs`.
- Các vùng khác được tải từ Overpass API theo từng ô và lưu vào cache của trình duyệt. App có nhiều máy chủ dự phòng: máy nào lỗi thì chuyển sang máy khác.
- Nền bản đồ và chức năng tìm địa điểm cần kết nối internet.

## Cấu trúc

```
src/search.js    các thuật toán tìm kiếm
src/graph.js     tải dữ liệu OSM, dựng đồ thị
src/worker.js    chạy thuật toán ở luồng riêng
src/classify.js  các thuật toán phân loại
src/docs.js      dữ liệu huấn luyện mẫu
src/App.jsx      giao diện (React + Leaflet)
scripts/         tải dữ liệu, đóng gói exe
```
