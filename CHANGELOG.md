# Lịch sử thay đổi

## 0.1.0 — bản đầu
- Sơ đồ cây: Internet (PPPoE/WAN) → MikroTik → cổng/bridge/đường hầm VPN → thiết bị. Đọc thẳng tích hợp MikroTik của Home Assistant, **không cần SNMP**.
- Đường nối chuyển động theo lưu lượng thật; chip tổng tải ↓↑ và số thiết bị đang kết nối.
- Nhóm thiết bị theo **bộ phát WiFi** (ví dụ một con ZTE): gán theo MAC/IP cấu hình, theo bảng MAC của cổng từ MikroTik (`mac_sensor`), hoặc gán tay bằng nút 📶 (lưu trong trình duyệt).
- `tools/mikrotik_bridge_hosts.py`: lấy «MAC theo cổng» từ RouterOS API (chỉ đọc) cho cảm biến Home Assistant.
- Mọi chuỗi từ mạng (tên máy, ghi chú cổng) đều được thoát HTML.
