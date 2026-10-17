# MikroTik Topo LAN Card

Card Lovelace cho Home Assistant vẽ **sơ đồ mạng LAN của router MikroTik**: Internet → MikroTik → cổng / bridge / VPN → thiết bị.
Đọc thẳng thực thể của tích hợp MikroTik trong Home Assistant — **không cần SNMP**, không cần pfSense, không cần plugin giao diện.

> Ý tưởng sơ đồ cây lấy cảm hứng từ [doanlong1412/snmp-topo-lan-card](https://github.com/doanlong1412/snmp-topo-lan-card) (MIT). Card này viết lại cho MikroTik, nguồn dữ liệu khác (tích hợp MikroTik thay cho SNMP Switch Manager).

## Yêu cầu
- Home Assistant 2024.6 trở lên.
- Tích hợp MikroTik tạo các thực thể kiểu `sensor.<tiền_tố>_port_<id>_rx|tx`, `binary_sensor.<tiền_tố>_port_<id>_connection`, `sensor.<tiền_tố>_core_cpu_load`, `device_tracker.*`
  (ví dụ tích hợp **Mikrotik Router** / **MikroTik Extended**; tiền tố mặc định `mikrotik_router`).

## Cài đặt
**HACS:** Custom repositories → URL repo này → loại *Dashboard* → cài → tải lại trình duyệt (`Ctrl+Shift+R`).
**Thủ công:** chép `mikrotik-topo-lan-card.js` vào `/config/www/community/mikrotik-topo-lan-card/`, rồi Settings → Dashboards → Resources:
`/local/community/mikrotik-topo-lan-card/mikrotik-topo-lan-card.js` loại *JavaScript module*.

## Cấu hình tối thiểu
```yaml
type: custom:mikrotik-topo-lan-card
```
Card tự nhận WAN (cổng PPPoE/L2TP…), cổng, bridge, đường hầm WireGuard và thiết bị. Tên cổng lấy từ ghi chú (`comment`) rồi tới tên RouterOS.

## Tuỳ chọn
| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `title` | «Mạng LAN MikroTik» | Tiêu đề |
| `prefix` | `mikrotik_router` | Tiền tố thực thể của tích hợp |
| `wan` | tự nhận | id cổng ra Internet nếu muốn chọn tay |
| `router_name`, `isp_name` | | Tên hiển thị cho nút router / ISP |
| `port_names` | | `{ether1: "Bộ phát WiFi"}` — đặt tên cổng |
| `hide_ports` | | Danh sách id cổng/đường hầm cần ẩn |
| `show_clients` | `true` | Hiện cột thiết bị |
| `client_limit` | `30` | Số thiết bị hiện ban đầu (có nút «Xem thêm») |
| `hide_offline_clients` | `false` | Ẩn thiết bị đang ngắt |
| `language` | `vi` | `vi` hoặc `en` |
| `access_points` | | Bộ phát WiFi, xem dưới |

## Nhà chỉ có MỘT bộ phát WiFi (ví dụ ZTE) — gán thiết bị cho nó
MikroTik chỉ thấy **một** thiết bị là bộ phát WiFi cắm vào một cổng; mọi máy dùng WiFi sau nó đều hiện là máy trên `BridgeLAN` như máy có dây
(tích hợp Home Assistant không ghi cổng vật lý của từng máy). Muốn thấy «máy nào đi qua ZTE», khai báo bộ phát và cách nhận máy của nó:

```yaml
type: custom:mikrotik-topo-lan-card
access_points:
  - name: ZTE WiFi
    port: ether2                 # cổng (id hoặc tên RouterOS) nơi cắm bộ phát — để vẽ đường nối
    entity: device_tracker.zte   # (tuỳ chọn) chính bộ phát, để hiện chấm trạng thái
    mac_sensor: sensor.mikrotik_bang_mac   # (khuyên dùng) tự gán theo bảng MAC của cổng, xem dưới
    # macs: ["AA:BB:CC:DD:EE:01"]  # hoặc khai tay
    # ips: ["192.168.88.50"]
```
Ba cách gán, ưu tiên từ trên xuống: (1) **gán tay** bằng nút 📶 cạnh mỗi thiết bị (lưu trong trình duyệt, bấm tiếp để đổi bộ phát / bỏ gán),
(2) `macs` / `ips` / `mac_sensor` trong cấu hình, (3) giao diện tên `wlan*`/`wifi*` (khi chính MikroTik phát WiFi) vào nhóm «WiFi (MikroTik)».
Dấu `◌` cạnh thiết bị = MAC «riêng tư» (địa chỉ ngẫu nhiên của điện thoại), thường là máy dùng WiFi — chỉ để gợi ý.

### Tự gán theo bảng MAC của cổng (không cần SNMP của bộ phát)
MikroTik học MAC của mọi máy sau cổng cắm bộ phát. `tools/mikrotik_bridge_hosts.py` đọc bảng đó (chỉ ĐỌC) và in `{"ether2": ["AA:…", …], …}`:

1. Tạo trên router một tài khoản riêng **chỉ quyền `read` + `api`**, giới hạn theo IP của Home Assistant.
2. Chép `tools/mikrotik_bridge_hosts.py` vào `/config/`, đặt mật khẩu trong `secrets.yaml`, rồi trong `configuration.yaml`:
```yaml
command_line:
  - sensor:
      name: MikroTik bảng MAC
      unique_id: mikrotik_bang_mac
      command: "MIKROTIK_PASSWORD='!secret mikrotik_docdulieu' python3 /config/mikrotik_bridge_hosts.py --host 192.168.88.1 --user docdulieu"
      scan_interval: 120
      value_template: "{{ value_json | length }}"
      json_attributes_path: "$"
      json_attributes: [ether2, ether3, ether4]   # các cổng bạn cần
```
(`secrets` không tự thay trong chuỗi lệnh: dùng `shell_command`/biến môi trường theo cách bạn quen, hoặc chép mật khẩu vào tệp chỉ root đọc được.) Thêm `--tls --port 8729 --insecure` nếu dùng API-SSL với chứng chỉ tự ký.
Tên thuộc tính trùng tên cổng trong `access_points[].port` (hoặc đặt `mac_attr`).

## Về SNMP
Card **không cần SNMP**. MikroTik có hỗ trợ SNMP, nhưng nhiều bộ phát WiFi do nhà mạng cấp (ví dụ ZTE E2633) **có thể không** cho người dùng bật SNMP; cách gán theo bảng MAC ở trên không phụ thuộc vào nó.
Nếu vẫn bật SNMP trên MikroTik: đổi tên cộng đồng `public` mặc định, giới hạn `addresses` theo IP của Home Assistant, ưu tiên SNMPv3 khi có thể.

> Ghi chú trung thực: phần `command_line` ở trên và card trong Home Assistant thật **chưa được thử trên nhiều hệ khác nhau**; test hiện có dùng dữ liệu mẫu và router giả.

## Phát triển
`npm test` chạy test JavaScript (Node ≥ 20, không cần cài gói) và test Python của công cụ. `tools/xem-thu.html` dựng thử card với dữ liệu mẫu đã ẩn danh (`python3 -m http.server`, mở `/tools/xem-thu.html`).

## Giấy phép
MIT.
