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

## Tự thêm switch và bộ phát WiFi (không cần sửa YAML)
MikroTik chỉ thấy MAC theo **cổng**: nếu cổng đi qua thêm một (hoặc hai) switch rồi mới tới bộ phát WiFi (ví dụ ZTE), mọi máy phía sau đều hiện là máy trên `BridgeLAN`.
Vì vậy sơ đồ cho **người dùng tự dựng đường đi** ngay trên card:

1. Bấm nút **✎** ở đầu card → mục «Thêm nút vào sơ đồ».
2. Đặt **tên**, chọn **loại** (Switch hoặc Bộ phát WiFi) và **cắm vào** đâu: một cổng của MikroTik, hoặc một nút đã thêm (ví dụ ZTE cắm vào «Switch phòng khách»).
3. (Bộ phát WiFi) tick «Gợi ý: máy MAC riêng tư…» nếu muốn card tự đưa điện thoại (MAC ngẫu nhiên) sau cổng đó vào nhóm WiFi.
4. Cạnh mỗi thiết bị có nút **📶**: bấm để gán thiết bị vào nút kế tiếp (switch → bộ phát → bỏ gán).

Nút và phần gán được lưu **theo người dùng Home Assistant** (đồng bộ giữa thiết bị; có `localStorage` dự phòng) — không cần chép tay giữa máy tính và điện thoại.
Cho phép tối đa 40 nút. Dữ liệu lưu bị sửa hỏng sẽ được làm sạch khi đọc.

Muốn khai sẵn bằng YAML (tuỳ chọn, cùng ý nghĩa):
```yaml
type: custom:mikrotik-topo-lan-card
mac_sensor: sensor.mikrotik_bang_mac      # bảng MAC theo cổng (xem dưới) — để tự biết máy nào nằm sau cổng nào
switches:
  - { name: Switch phòng khách, port: ether2 }
  - { name: Switch phòng ngủ,   port: ether3 }
access_points:
  - name: ZTE WiFi
    switch: Switch phòng khách     # ZTE cắm vào switch này (hoặc dùng `port:` nếu cắm thẳng vào router)
    entity: device_tracker.zte     # (tuỳ chọn) chấm trạng thái
    auto_private_mac: true         # (tuỳ chọn) gợi ý máy MAC riêng tư vào nhóm WiFi
    # macs: ["AA:BB:CC:DD:EE:01"]  # hoặc khai rõ máy của bộ phát; ips: [...]
```
Thứ tự ưu tiên khi quyết định một thiết bị thuộc nút nào: gán tay → khai báo rõ (`macs`/`ips`) → gợi ý MAC riêng tư → switch mà máy nằm sau cổng của nó → giao diện `wlan`/`wifi` của MikroTik → nhóm «LAN».
Dấu `◌` cạnh thiết bị = MAC «riêng tư» (địa chỉ ngẫu nhiên của điện thoại), chỉ là gợi ý.

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
Thuộc tính của cảm biến đặt theo **tên cổng** (`ether2`…) khớp với cổng bạn cho nút cắm vào.

## Bộ phát WiFi tự báo danh sách máy (ZTE E2633)
Bộ phát biết rõ máy nào đang dùng WiFi, băng tần nào (2.4G/5G) và tín hiệu bao nhiêu dBm — chính xác hơn mọi suy đoán theo cổng.
Nếu bạn có một cảm biến Home Assistant mang thuộc tính `clients` (danh sách `{mac, band, rssi, mode}`), khai vào bộ phát:
```yaml
access_points:
  - name: ZTE WiFi
    port: ether2
    clients_sensor: sensor.zte_wifi          # thuộc tính `clients`
```
Các máy trong danh sách đó tự vào nhóm «ZTE WiFi» và hiện kèm `5G · -65 dBm`. Dữ liệu sai khuôn bị bỏ, không bịa.
`tools/zte_e2633.py` đọc đúng khuôn trả về của trang quản trị ZTE E2633 (`GetALLClients`, `GetALLAP`) — **chỉ phân tích tệp JSON bạn tự lưu**, không đăng nhập hay gọi mạng:
```bash
python3 tools/zte_e2633.py clients.json ap.json
```

## Về SNMP
Card **không cần SNMP**. MikroTik có hỗ trợ SNMP, nhưng nhiều bộ phát WiFi do nhà mạng cấp (ví dụ ZTE E2633) **có thể không** cho người dùng bật SNMP; cách gán theo bảng MAC ở trên không phụ thuộc vào nó.
Nếu vẫn bật SNMP trên MikroTik: đổi tên cộng đồng `public` mặc định, giới hạn `addresses` theo IP của Home Assistant, ưu tiên SNMPv3 khi có thể.

> Ghi chú trung thực: phần `command_line` ở trên và card trong Home Assistant thật **chưa được thử trên nhiều hệ khác nhau**; test hiện có dùng dữ liệu mẫu và router giả.

## Phát triển
`npm test` chạy test JavaScript (Node ≥ 20, không cần cài gói) và test Python của công cụ. `tools/xem-thu.html` dựng thử card với dữ liệu mẫu đã ẩn danh (`python3 -m http.server`, mở `/tools/xem-thu.html`).

## Giấy phép
MIT.
