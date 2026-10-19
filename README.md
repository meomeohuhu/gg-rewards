# GG Rewards

Web quản lý tài khoản Microsoft Rewards bằng tiếng Việt, hàng đợi tuần tự và runner Microsoft Edge. Mỗi tài khoản có **một hồ sơ Edge độc lập**, được lưu ở `.local/edge-profiles/<account-id>`; không dùng chung cookie. Chỉ một hồ sơ được mở tại một thời điểm.

## Chạy trên máy của bạn

Yêu cầu Node.js 22+ và Microsoft Edge trên máy có giao diện đồ họa.

```sh
npm ci
npm run prepare:extension
npm start
```

Mở dashboard trên cổng 3000 của máy đang chạy. Trong terminal thứ hai, cùng thư mục:

```sh
# Nếu chưa cài Edge: npx playwright install msedge
npm run runner
```

Nếu Edge nằm ở vị trí tùy chỉnh, đặt `EDGE_EXECUTABLE` thành đường dẫn file thực thi Edge. Không chỉ định Chromium nếu muốn giữ đúng môi trường Edge.

1. Thêm tên và email (không nhập mật khẩu).
2. Chọn tài khoản, bấm **Mở đăng nhập**. Runner mở hồ sơ Edge riêng cho tài khoản đó.
3. Đăng nhập trực tiếp trên Microsoft, tự xử lý 2FA / CAPTCHA nếu có, kiểm tra đúng email rồi đóng cửa sổ Edge để lưu hồ sơ.
4. Chọn các tài khoản và **Chạy đã chọn**. Runner lần lượt mở từng hồ sơ và gửi lệnh cho tiện ích Search Auto.
5. Xem trạng thái, lịch sử và log. **Dừng hàng đợi** hủy lượt chưa chạy và yêu cầu đóng lượt đang chạy.

## Tích hợp nguồn mẫu

`prepare:extension` lấy nguyên bản https://github.com/vanhobmt99/reward tại commit `d2d7bc1761987d41411834a050930d4014d1dceb` vào thư mục cục bộ được Git bỏ qua. Không phân phối lại mã nguồn hoặc tài sản của repo mẫu. Runner mở popup và gọi API nội bộ `chrome.runtime.sendMessage({action:'start', searches})`; đọc `chrome.storage.local.config.runtime` để nhận tiến độ. Không sửa mã upstream. Các hồ sơ phải được dùng đúng tài khoản; chưa có bước xác minh tự động email đăng nhập.

**Giới hạn đã biết:** upstream ghi rõ Edge có thể chặn thao tác Rewards; chính sách Edge cũng có thể chặn nạp tiện ích bằng cờ dòng lệnh. Khi đó runner sẽ báo lỗi, không báo thành công. Kết thúc của tiện ích chưa chứng minh điểm đã được ghi nhận: trạng thái là “Đã chạy · chưa xác minh”. Tổng điểm hiển thị `—` cho tới khi có nguồn đồng bộ đã xác minh; không có điểm hoặc tài khoản mẫu giả. Chưa kiểm thử nhiệm vụ thật bằng tài khoản Microsoft trong môi trường cloud không có đăng nhập của bạn. Chưa hỗ trợ proxy, lịch chạy hằng ngày hoặc đồng bộ điểm tự động.

Dữ liệu ở `.local/data.json`, phiên đăng nhập ở `.local/edge-profiles`; không commit / chia sẻ các thư mục này. Hồ sơ có chứa phiên đăng nhập Microsoft, nên bảo vệ máy và bản sao lưu. Xóa tài khoản trên dashboard không xóa hồ sơ trên đĩa. Server chỉ bind loopback, dành cho một người dùng trên máy cục bộ; không đưa trực tiếp lên Internet. Runner xác thực bằng token tạm trong `.local/runner-token`. Khởi động lại server cần khởi động lại runner. Nếu runner dừng đột ngột và còn `runner.lock`, kiểm tra không còn runner rồi xóa file đó.

## Kiểm tra

```sh
npm test
```

Các kiểm tra API dùng dữ liệu tạm, kiểm tra tính tuần tự, chống xếp hàng trùng, dừng và lưu dữ liệu. Không thực hiện nhiệm vụ Microsoft thật.
