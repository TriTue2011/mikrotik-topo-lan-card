# Lịch sử thay đổi

## 0.3.0
- `access_points[].clients_sensor`: bộ phát tự báo danh sách máy WiFi (MAC, băng tần, tín hiệu); máy trong danh sách tự vào nhóm bộ phát, hiện `5G · -65 dBm`.
- `tools/zte_e2633.py`: phân tích dữ liệu `GetALLClients`/`GetALLAP` của ZTE E2633 (chỉ đọc tệp, không đăng nhập).

## 0.2.0
- **Người dùng tự thêm switch / bộ phát WiFi ngay trên card** (nút ✎): chọn nơi cắm (cổng MikroTik hoặc nút khác), gán thiết bị bằng nút 📶, lưu theo người dùng Home Assistant. Hỗ trợ nhiều switch nối tiếp.
- Khai báo sẵn bằng YAML: `switches`, `access_points[].switch`, `mac_sensor` toàn cục.
- Làm sạch dữ liệu lưu (tối đa 40 nút, id/khoá hợp lệ), tên nút luôn được thoát HTML.

## 0.1.0 — bản đầu
- Sơ đồ cây: Internet (PPPoE/WAN) → MikroTik → cổng/bridge/đường hầm VPN → thiết bị. Đọc thẳng tích hợp MikroTik của Home Assistant, **không cần SNMP**.
- Đường nối chuyển động theo lưu lượng thật; chip tổng tải ↓↑ và số thiết bị đang kết nối.
- Nhóm thiết bị theo **bộ phát WiFi** (ví dụ một con ZTE): gán theo MAC/IP cấu hình, theo bảng MAC của cổng từ MikroTik (`mac_sensor`), hoặc gán tay bằng nút 📶 (lưu trong trình duyệt).
- `tools/mikrotik_bridge_hosts.py`: lấy «MAC theo cổng» từ RouterOS API (chỉ đọc) cho cảm biến Home Assistant.
- Mọi chuỗi từ mạng (tên máy, ghi chú cổng) đều được thoát HTML.
