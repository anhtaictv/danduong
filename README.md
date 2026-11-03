# Tìm đường & Phân loại tài liệu

Ứng dụng web minh họa **các thuật toán tìm kiếm** trên bản đồ đường bộ thật (tỉnh Đắk Lắk, dữ liệu OpenStreetMap) và **các thuật toán phân loại văn bản** tiếng Việt. Ứng dụng cho thấy trực quan từng thuật toán duyệt đồ thị ra sao, mở rộng bao nhiêu đỉnh và tìm được đường dài bao nhiêu, đồng thời so sánh độ chính xác của ba mô hình phân loại.

**Dùng thử ngay trên trình duyệt:** https://anhtaictv.github.io/danduong/ (không cần cài đặt). Bản chạy trên Windows: tải `danduong.exe` ở mục [Releases](https://github.com/anhtaictv/danduong/releases/latest).

Công nghệ: React 19, Leaflet (react-leaflet), Vite, Web Worker. Dữ liệu bản đồ lấy từ OpenStreetMap (Overpass API), tìm địa điểm bằng Nominatim.

---

## Mục lục

1. [Thành viên nhóm](#thành-viên-nhóm)
2. [Tính năng](#tính-năng)
3. [Cài đặt và chạy](#cài-đặt-và-chạy)
4. [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
5. [Thuật toán tìm kiếm](#thuật-toán-tìm-kiếm)
6. [Thuật toán phân loại](#thuật-toán-phân-loại)
7. [Dữ liệu bản đồ](#dữ-liệu-bản-đồ)
8. [Kiến trúc và cấu trúc mã nguồn](#kiến-trúc-và-cấu-trúc-mã-nguồn)
9. [Kiểm thử](#kiểm-thử)
10. [Đóng gói file .exe](#đóng-gói-file-exe)
11. [Giới hạn đã biết](#giới-hạn-đã-biết)

---

## Thành viên nhóm

| Thành viên | MSSV | Vai trò | Nhiệm vụ | Tỷ lệ đóng góp |
|---|---|---|---|:---:|
| **Tạ Anh Tài** | K23DTCN307 | Trưởng nhóm | Lập kế hoạch, phân chia công việc; thiết kế kiến trúc; tải dữ liệu OpenStreetMap và dựng đồ thị (`graph.js`); cài đặt các thuật toán tìm kiếm (BFS, DFS, DLS, IDS, UCS, A\*, Greedy) và Web Worker; đóng gói .exe; tổng hợp báo cáo. | **40%** |
| **Đặng Thị Tiểu My** | K23DTCN431 | Thành viên | Thiết kế và cài đặt giao diện (React, Leaflet): chọn điểm A/B, bảng kết quả, vẽ quá trình tìm kiếm, chế độ so sánh, chú thích màu, biểu đồ; chụp hình minh họa; viết Chương II. | **30%** |
| **Nguyễn Minh Đức** | K23DTCN097 | Thành viên | Xây dựng tập dữ liệu văn bản; cài đặt Naive Bayes, kNN, ID3 và đánh giá leave-one-out; viết kiểm thử (`test.mjs`); chạy thực nghiệm, tổng hợp số liệu; viết Chương I và III. | **30%** |
| | | | **Tổng** | **100%** |

---

## Tính năng

### 1. Tìm đường trên bản đồ thật

- Chọn **điểm đi A** và **điểm đến B** bằng ba cách: gõ tên địa điểm (chỉ tìm trong tỉnh Đắk Lắk), click lên bản đồ, hoặc kéo ghim A/B.
- Chạy **8 thuật toán** trên cùng một đồ thị: BFS, DFS, DLS, IDS, UCS, A\*, **Weighted A\*** (nhập hệ số w), Greedy Best-First.
- **Tối ưu theo quãng đường hoặc thời gian**: ở chế độ thời gian, mỗi loại đường có tốc độ giả định (cao tốc 80, quốc lộ 60–70, tỉnh lộ 50, đường huyện 40, khu dân cư 25 km/h), bảng kết quả có thêm cột số phút.
- **Bảng kết quả** cho mỗi thuật toán: quãng đường (km), số đỉnh mở rộng, thời gian chạy (ms). Đường ngắn nhất được đánh dấu ★.
- **Biểu đồ cột** số đỉnh mở rộng theo thang logarit (IDS có thể duyệt nhiều gấp hàng nghìn lần Greedy).
- **Vẽ quá trình tìm kiếm**: các cạnh thuật toán đã duyệt hiện dần (màu xanh), vẽ xong thì hiện đường đi tìm được (màu vàng). Có 3 tốc độ vẽ: nhanh 3 giây, vừa 10 giây, chậm 30 giây để dễ trình bày. Có nút "Xem lại".
- **Chế độ so sánh**: vẽ chồng thêm một thuật toán thứ hai (màu tím) với cùng tốc độ, nên thấy ngay thuật toán nào duyệt ít hơn và xong trước.
- **Chú thích màu** góc bản đồ, đường **ranh giới tỉnh** (đỏ, nét đứt).
- Thuật toán chạy trong **Web Worker** nên giao diện không bị đơ. Kết quả hiện dần, IDS (chậm nhất) chạy sau cùng.

### 2. Chạy từng bước trên đồ thị nhỏ

- Tab **Từng bước** chạy từng thuật toán trên một đồ thị 7 đỉnh (S → G) để xem rõ tập biên **Open** và tập đã xét **Closed** thay đổi sau mỗi bước.
- Nút Đầu / Lùi / Tự chạy / Tiếp / Cuối; mỗi bước có một câu giải thích (lấy đỉnh nào ra, thêm đỉnh nào, cập nhật g ra sao, đỉnh nào bị cắt ở DLS...).
- Đỉnh tô màu theo trạng thái (vừa lấy ra / trong Open / trong Closed), cây tìm kiếm và đường đi được vẽ trên đồ thị; hiện g, h, f của từng đỉnh trong Open.
- Bảng vết toàn bộ các bước, click một dòng để nhảy đến bước đó. Bảng này trùng với các bảng chạy tay trong báo cáo.

### 3. Phân loại tài liệu

- Ba mô hình: **Naive Bayes**, **kNN** (TF-IDF + cosine), **Decision Tree (ID3)**.
- Huấn luyện trên **48 tài liệu mẫu** thuộc 4 chủ đề: Thể thao, Công nghệ, Kinh tế, Sức khỏe (mỗi chủ đề 12 tài liệu).
- Hiện độ chính xác **leave-one-out** của từng mô hình; nhập văn bản mới để xem cả ba mô hình dự đoán.
- **Ma trận nhầm lẫn** và **precision, recall, F1** theo từng nhãn cho mô hình đang chọn.
- Xem **cây quyết định** mà ID3 dựng được dưới dạng văn bản.

---

## Cài đặt và chạy

### Yêu cầu

- [Node.js](https://nodejs.org) **22 trở lên** (bản 22+ cần cho phần đóng gói .exe).
- Kết nối internet (nền bản đồ, tìm địa điểm và tải đường bộ ngoài vùng có sẵn).

### Các lệnh

```sh
git clone https://github.com/anhtaictv/danduong.git
cd danduong
npm install

npm run dev        # chạy bản phát triển, mở http://localhost:5173
npm run build      # build bản tĩnh vào dist/
npm run preview    # xem thử bản build
node test.mjs      # kiểm tra thuật toán
npm run exe        # đóng gói thành release/danduong.exe
```

### Bản web (GitHub Pages)

Mỗi lần push lên `main`, workflow `.github/workflows/deploy.yml` chạy kiểm thử, build và đăng lại trang tại https://anhtaictv.github.io/danduong/. Vite dùng `base: './'` (đường dẫn tương đối) nên cùng một bản build chạy được cả ở thư mục con của GitHub Pages lẫn trong file exe.

### Chạy bằng file .exe (không cần cài Node)

Nhấp đúp `danduong.exe`: app tự mở trong trình duyệt tại `http://localhost:51730/`. Đóng cửa sổ console để tắt app. Nếu đã có một bản đang chạy, mở thêm sẽ chỉ mở lại trình duyệt.

---

## Hướng dẫn sử dụng

### Tab "Tìm đường"

1. Chọn điểm A: gõ tên rồi Enter và chọn kết quả, hoặc bấm nút **A · Điểm đi** rồi click lên bản đồ.
2. Chọn điểm B tương tự (sau khi chọn A, chế độ click tự chuyển sang B).
3. (Tùy chọn) Đổi **Giới hạn độ sâu DLS** (mặc định 200 cạnh), **hệ số w của Weighted A\*** (mặc định 2) và **Tối ưu theo** quãng đường hoặc thời gian.
4. Bấm **Tìm đường**. App tải dữ liệu đường, dựng đồ thị rồi chạy lần lượt 8 thuật toán.
5. Click một dòng trong bảng để xem quá trình tìm kiếm của thuật toán đó.
6. Chọn **So sánh với** để vẽ chồng thuật toán thứ hai; chọn **Tốc độ vẽ** để vẽ chậm hơn.

Ý nghĩa màu trên bản đồ:

| Màu | Ý nghĩa |
|---|---|
| Xanh lá / Đỏ | Ghim A (điểm đi) / Ghim B (điểm đến) |
| Đỏ nét đứt | Ranh giới tỉnh Đắk Lắk |
| Xám mờ | Mạng đường đã tải |
| Xanh dương | Các cạnh thuật toán chính đã duyệt |
| Vàng | Đường đi của thuật toán chính |
| Hồng tím / Tím đậm | Cạnh đã duyệt / đường đi của thuật toán so sánh |

### Tab "Từng bước"

1. Chọn thuật toán (với DLS chọn thêm giới hạn l, với Weighted A\* chọn w).
2. Bấm **Tiếp** hoặc **Tự chạy** để đi qua từng bước; đọc câu giải thích và bảng Open/Closed bên dưới.
3. Gợi ý so sánh trên đồ thị này:

| Thuật toán | Đường đi | Chi phí | Số lượt mở rộng | Nhận xét |
|---|---|:---:|:---:|---|
| BFS | S → B → G | 9 | 7 | Ít cạnh nhất nhưng không rẻ nhất |
| DFS | S → C → E → G | 14 | 4 | Đi theo nhánh đầu tiên, đường tệ nhất |
| DLS (l = 1) | không tìm thấy | — | 4 | Giới hạn nhỏ hơn độ sâu lời giải |
| IDS | S → B → G | 9 | 12 | Giống BFS nhưng mở rộng lặp lại các tầng nông |
| UCS | S → A → D → G | 6 | 7 | Tối ưu |
| A\* | S → A → D → G | 6 | 4 | Tối ưu, ít đỉnh hơn UCS nhờ heuristic |
| Greedy | S → B → G | 9 | 3 | Ít đỉnh nhất nhưng bị h(B) = 4 dụ sai |

### Tab "Phân loại"

1. Xem độ chính xác leave-one-out của ba mô hình trong bảng; click một mô hình để xem ma trận nhầm lẫn và precision/recall/F1.
2. Nhập nội dung văn bản, bấm **Dự đoán** để xem nhãn mỗi mô hình đưa ra.
3. Mở **Xem cây quyết định** để xem cây ID3.

---

## Thuật toán tìm kiếm

Đồ thị có hướng: mỗi đỉnh là một nút giao/điểm trên đường OSM, mỗi cạnh là đoạn đường giữa hai điểm liên tiếp, trọng số là khoảng cách thực (mét) tính bằng công thức **haversine**. Đường một chiều (`oneway`, vòng xuyến, cao tốc) chỉ tạo cạnh theo một hướng.

| Thuật toán | Cấu trúc dữ liệu | Ý tưởng | Tối ưu theo quãng đường? |
|---|---|---|:---:|
| **BFS** | Hàng đợi (FIFO) | Duyệt theo từng lớp, tối thiểu số cạnh | Không (chỉ ít cạnh nhất) |
| **DFS** | Ngăn xếp (LIFO) | Đi sâu nhất có thể rồi quay lui | Không |
| **DLS** | Ngăn xếp + độ sâu | DFS nhưng dừng ở độ sâu `limit`; có thể không tìm thấy nếu limit nhỏ | Không |
| **IDS** | DLS lặp | Chạy DLS với `limit = 0, 1, 2, ...` đến khi tìm thấy | Không (ít cạnh nhất) |
| **UCS** | Hàng đợi ưu tiên (heap) | Mở rộng đỉnh có `g` (quãng đường từ A) nhỏ nhất, chính là Dijkstra | **Có** |
| **A\*** | Hàng đợi ưu tiên | `f = g + h`, `h` = khoảng cách đường chim bay đến B (heuristic chấp nhận được) | **Có** |
| **Weighted A\*** | Hàng đợi ưu tiên | `f = g + w·h`, w > 1 tìm nhanh hơn nhưng mất tối ưu; chi phí ≤ w × tối ưu | Không (khi w > 1) |
| **Greedy Best-First** | Hàng đợi ưu tiên | Chỉ dựa vào `h`, đi thẳng về phía đích | Không |

Chi tiết cài đặt (`src/search.js`):

- UCS, A\* và Greedy dùng chung hàm `bestFirst` với một min-heap tự viết; chỉ khác hàm ưu tiên `f(g, v)`.
- DLS cho phép thăm lại một đỉnh nếu đến được ở độ sâu nhỏ hơn, để không bỏ sót đường. Danh sách kề được chuyển sang dạng phẳng (CSR, `Int32Array`) để vòng lặp của IDS chạy nhanh.
- IDS không ghi cây duyệt ở các vòng trung gian, chỉ chạy lại vòng cuối để lấy đường đi và cây.
- Mỗi thuật toán trả về: đường đi, quãng đường, số đỉnh mở rộng, và **cây duyệt** (danh sách cạnh cha → con theo thứ tự mở rộng) để giao diện vẽ lại.
- Cây có thể tới hàng triệu cạnh (IDS) nên giao diện lấy mẫu đều tối đa 40.000 cạnh khi vẽ.

**Tối ưu theo thời gian.** Mỗi cạnh lưu thêm tốc độ theo loại đường (`SPEED` trong `src/graph.js`). Ở chế độ thời gian, trọng số = độ dài / tốc độ (giây) và heuristic = khoảng cách chim bay / 80 km/h (tốc độ lớn nhất). Vì không đoạn đường nào cho đi nhanh hơn 80 km/h, heuristic vẫn **chấp nhận được và nhất quán** nên A\* vẫn tối ưu. Đổi lại, heuristic "lạc quan" hơn nên A\* mở rộng 35–60% số đỉnh của UCS, thay vì 13–26% như ở chế độ quãng đường.

**Một số kết quả thực nghiệm** (vùng Buôn Ma Thuột, chi tiết trong báo cáo):

| Thí nghiệm | Kết quả |
|---|---|
| A\* so với UCS (quãng đường) | Cùng đường ngắn nhất, A\* mở rộng ít hơn 4–8 lần |
| Weighted A\*, w = 1,5 | Số đỉnh mở rộng giảm tới 11 lần so với A\*, đường dài hơn tối ưu dưới 7% |
| Weighted A\*, w = 3 | Có trường hợp đường dài hơn tối ưu 55% (vẫn ≤ w × tối ưu) |
| Nhanh nhất so với ngắn nhất | Một tuyến 9,75 km: đường nhanh nhất dài hơn 0,67 km nhưng nhanh hơn 4 phút (−19%) |

---

## Thuật toán phân loại

Cài đặt trong `src/classify.js`, dữ liệu mẫu trong `src/docs.js`.

**Tách từ.** Văn bản chuyển về chữ thường, tách thành các âm tiết, rồi thêm các **cặp âm tiết liền kề** (ví dụ `bóng_đá`), vì tiếng Việt có nhiều từ ghép hai âm tiết.

| Mô hình | Cách làm |
|---|---|
| **Naive Bayes** | Multinomial NB, làm trơn Laplace (+1), tính trong không gian log để tránh tràn số. |
| **kNN** | Vector TF-IDF chuẩn hóa, độ tương đồng cosine, k = 3. Hòa phiếu thì chọn nhãn của láng giềng gần nhất. |
| **Decision Tree (ID3)** | Đặc trưng nhị phân "văn bản có chứa token w" (chỉ xét token xuất hiện ở ≥ 2 tài liệu), chọn đặc trưng theo information gain (entropy), độ sâu tối đa 8. |

**Đánh giá.** Dùng **leave-one-out**: mỗi lần bỏ ra một tài liệu, huấn luyện trên 47 tài liệu còn lại rồi dự đoán tài liệu đó.

Kết quả trên bộ 48 tài liệu mẫu:

| Mô hình | Độ chính xác (LOO) |
|---|:---:|
| Naive Bayes | 98% |
| kNN | 98% |
| Decision Tree (ID3) | 65% |

Ma trận nhầm lẫn cho thấy Naive Bayes và kNN mỗi mô hình chỉ sai 1 văn bản, còn ID3 sai có hệ thống: dồn nhiều bài Thể thao, Kinh tế, Sức khỏe về nhãn Công nghệ (Công nghệ có recall 92% nhưng precision chỉ 42%).

ID3 thấp hơn vì với ít dữ liệu, mỗi nhánh chỉ dựa vào sự có mặt của một vài từ cụ thể nên dễ khớp quá mức (overfit). Naive Bayes và kNN tận dụng được toàn bộ từ trong văn bản.

---

## Dữ liệu bản đồ

- **Vùng có sẵn:** đường bộ quanh TP Buôn Ma Thuột (khung `[12.55, 107.9] – [12.8, 108.2]`) lưu trong `public/osm-bmt.json`, nên khu vực này chạy được ngay. Tải lại file bằng `node scripts/prefetch.mjs`.
- **Vùng khác:** tải từ **Overpass API** theo từng ô 0,1° (~11 km) và lưu vào **Cache Storage** của trình duyệt, nên vẫn còn sau khi tải lại trang. Khi kéo/zoom bản đồ (từ mức zoom 11 trở lên), app tự tải ngầm các ô trong vùng đang xem, ô gần giữa màn hình tải trước.
- **Máy chủ dự phòng:** có 3 máy chủ Overpass; máy nào lỗi hoặc treo quá 90 giây thì chuyển sang máy khác, thử 2 vòng. Máy chạy được lần trước sẽ được thử đầu tiên ở lần sau.
- **Loại đường:**
  - Hai điểm cách nhau dưới ~13 km (0,12°): tải **toàn bộ đường** (cả đường dân sinh, ngõ xóm).
  - Xa hơn: chỉ tải **đường chính** (quốc lộ, tỉnh lộ, đường cấp 1–3) để dữ liệu không quá lớn.
  - Phạm vi tối đa khoảng 2,5° (cả tỉnh).
- **Ghim A/B vào mạng đường chính:** app tìm thành phần liên thông mạnh chính của đồ thị và chỉ ghim A/B vào các đỉnh trong đó. Điều này tránh trường hợp ghim vào một đoạn đường lẻ không nối được với mạng (do đường một chiều hoặc nối qua loại đường không tải).

---

## Kiến trúc và cấu trúc mã nguồn

```
danduong/
├── .github/workflows/
│   └── deploy.yml         Build và đăng lên GitHub Pages khi push main
├── index.html
├── package.json
├── vite.config.js
├── test.mjs               Kiểm thử thuật toán (node test.mjs)
├── public/
│   └── osm-bmt.json       Đường bộ vùng Buôn Ma Thuột tải sẵn
├── scripts/
│   ├── prefetch.mjs       Tải lại public/osm-bmt.json
│   ├── build-exe.mjs      Đóng gói thành release/danduong.exe
│   └── server.cjs         Server tĩnh chạy bên trong file exe
└── src/
    ├── main.jsx           Điểm khởi động React
    ├── App.jsx            Giao diện: bản đồ, bảng kết quả, biểu đồ, tab phân loại
    ├── App.css            Giao diện (CSS)
    ├── search.js          8 thuật toán tìm kiếm, heap, haversine
    ├── stepper.js         Chạy từng bước trên đồ thị nhỏ (tab "Từng bước")
    ├── graph.js           Tải dữ liệu OSM, cache theo ô, dựng đồ thị, tốc độ theo loại đường
    ├── worker.js          Chạy thuật toán ở luồng riêng
    ├── classify.js        Naive Bayes, kNN, ID3, leave-one-out, ma trận nhầm lẫn
    └── docs.js            48 tài liệu mẫu
```

Luồng xử lý khi bấm **Tìm đường**:

```
Chọn A, B ─▶ tính khung bao (bbox) quanh A, B
          ─▶ graph.js: lấy dữ liệu (file có sẵn → cache ô → Overpass)
          ─▶ buildGraph: dựng đồ thị có hướng, trọng số = mét
          ─▶ nearest: ghim A, B vào đỉnh gần nhất trong mạng chính
          ─▶ worker.js: (chế độ thời gian: đổi trọng số sang giây) chạy lần lượt 8 thuật toán, gửi từng kết quả về
          ─▶ App.jsx: cập nhật bảng, biểu đồ, vẽ cây duyệt và đường đi
```

---

## Kiểm thử

```sh
node test.mjs
```

`test.mjs` dựng một lưới 4×4 nhỏ có đường một chiều và một đoạn đường lẻ không nối vào lưới, rồi kiểm tra:

- Cả 8 thuật toán đều tìm được đường từ góc này sang góc kia.
- UCS và A\* cho quãng đường **tối ưu**; không thuật toán nào cho đường ngắn hơn tối ưu.
- DLS với `limit = 5` không tìm thấy (cần 6 cạnh), IDS dừng đúng ở độ sâu 6.
- Đường một chiều không bị đi ngược.
- Ghim điểm không rơi vào đoạn đường lẻ.
- Chế độ thời gian: A\* cho chi phí bằng UCS; Weighted A\* (w = 3) cho chi phí ≤ 3 × tối ưu.
- Đồ thị nhỏ của tab "Từng bước" cho đúng các đường đi, chi phí và số lượt mở rộng như bảng ở trên.
- Độ chính xác tính từ ma trận nhầm lẫn bằng độ chính xác leave-one-out.
- Ba mô hình phân loại có độ chính xác leave-one-out > 40%, và Naive Bayes phân loại đúng câu "cầu thủ ghi bàn trong trận đấu" là *Thể thao*.

Kết quả mong đợi:

```
Naive Bayes LOO accuracy 0.98
kNN LOO accuracy 0.98
Decision Tree LOO accuracy 0.65
OK
```

---

## Đóng gói file .exe

```sh
npm run exe
```

Script `scripts/build-exe.mjs` thực hiện:

1. `vite build` ra thư mục `dist/`.
2. Nhúng toàn bộ `dist/` làm asset vào một **Node Single Executable Application** (SEA), với `scripts/server.cjs` làm chương trình chính.
3. Sao chép `node.exe` thành `release/danduong.exe` rồi chèn blob bằng `postject`.

Khi chạy, `server.cjs` phục vụ các file đã nhúng tại `127.0.0.1:51730` rồi mở trình duyệt. Cổng được cố định để cache bản đồ (lưu theo origin) giữ lại giữa các lần chạy.

---

## Giới hạn đã biết

- Cần internet cho nền bản đồ, tìm địa điểm (Nominatim) và tải đường ngoài vùng Buôn Ma Thuột. Máy chủ Overpass miễn phí đôi khi quá tải, khi đó app tự thử lại.
- IDS tăng giới hạn từng bước một nên rất chậm với quãng đường dài (có thể vài chục giây). App chạy IDS sau cùng để các thuật toán khác có kết quả trước.
- Tốc độ ở chế độ thời gian là giả định theo loại đường, chưa tính giới hạn tốc độ thực tế, kẹt xe hay cấm rẽ.
- Với quãng đường dài (> ~13 km), app chỉ dùng đường chính nên đường tìm được có thể dài hơn thực tế một chút.
- Bộ dữ liệu phân loại nhỏ (48 tài liệu) nên chỉ mang tính minh họa.

---

Dữ liệu bản đồ © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
