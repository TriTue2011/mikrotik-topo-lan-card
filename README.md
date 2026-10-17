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

## Cấu hình nâng cao (đa dụng)

Card không gắn cứng với một nhãn hiệu: mọi thông số lấy từ **trạng thái** hoặc **thuộc tính** của thực thể bạn chỉ định. Thông số nào không khai báo, hoặc thực thể không có giá trị, thì **ẩn hẳn**, không chiếm chỗ trong card hay hộp.

**Hộp và nơi nối** — `switches`, `access_points`, `hosts` đều có `name`; nối vào cổng MikroTik bằng `port`, hoặc vào hộp khác bằng `switch: <tên>`. `hosts` lồng được nhiều tầng bằng `children`; `guest_mac_prefix` tự thêm hộp con cho máy có tiền tố MAC đó.

**Nguồn thiết bị tùy chỉnh** (`sources`) — lấy danh sách thiết bị từ thuộc tính của bất kỳ thực thể nào:

```yaml
sources:
  - node: ZTE WiFi                  # tên hộp mà các thiết bị này thuộc về
    entity: sensor.zte_router_connected_devices
    attribute: clients              # thuộc tính (bỏ trống thì lấy trạng thái)
    map: { mac: mac, name: name, ip: ip, rssi: rssi, band: band, mode: mode, rx: rx_rate, tx: tx_rate }   # tuỳ chọn
```

Thuộc tính là **chuỗi** thì tách bằng `separator` (mặc định xuống dòng hoặc `, `) rồi áp `pattern` (regex có nhóm tên `mac`, `ip`, `name`, `band`, `rssi`, `mode`, `rx`, `tx`):

```yaml
sources:
  - node: ZTE WiFi
    entity: sensor.zte_router_connected_devices
    attribute: devices              # "84:CC:A8:A4:4F:95(Tên-172.16.10.34), 8C:CE:..."
    pattern: '^(?<mac>[0-9A-Fa-f:]{17})\((?<name>.+)-(?<ip>[0-9.]+)\)$'
```

**Trường tùy chỉnh** (`fields`) — gắn vào hộp (`switches`, `access_points`, `hosts`) hoặc vào thiết bị (`device_fields`, khoá là MAC):

```yaml
hosts:
  - name: Proxmox
    ip: 172.16.10.100
    fields:
      - { label: CPU, entity: sensor.pve_cpu, unit: "%" }
      - { label: RAM, entity: sensor.pve_ram, attribute: used, template: "{value} GB" }
      - { label: Phiên bản, entity: sensor.pve_info, attribute: version, extract: "(\\d+\\.\\d+)" }   # lấy nhóm 1 của regex
```

Mỗi trường: `entity`, `attribute` (tuỳ chọn), `extract` (regex, lấy nhóm 1), `unit` hoặc `template` (`{value}`), `label`.

**Tên và nguồn thiết bị** — `port_names` (tên cổng, bridge), `device_names` (tên thiết bị theo MAC), `device_sources` (thiết bị → tên hộp; chọn trong Sửa thẻ → Thiết bị), `default_source` (nguồn cho thiết bị có dây chưa chọn).

## Cấu hình mẫu
Bốn tệp trong thư mục [`examples/`](examples/), chép vào YAML của card rồi đổi tên thực thể, IP cho khớp nhà bạn:

| Tệp | Dùng khi |
|---|---|
| `1-chi-mikrotik.yaml` | Chỉ có MikroTik |
| `2-chi-zte.yaml` | Chỉ có bộ phát ZTE (zte_tracker), không có MikroTik |
| `3-mikrotik-va-zte.yaml` | MikroTik + switch + ZTE |
| `4-da-dung-day-du.yaml` | Đầy đủ: switch, ZTE, Proxmox (LXC/VM), nguồn và trường tuỳ chỉnh, đặt tên thiết bị |

## Giấy phép
MIT.

## Cài đặt tự động với MikroTik Extended

Card tự nhận các thực thể của tích hợp **MikroTik Extended**, không cần khai tiền tố hay tên cổng. Chỉ cần thêm card:

```yaml
type: custom:mikrotik-topo-lan-card
```

**1. Cài tích hợp.** Trong HACS, tìm **MikroTik Extended** (có sẵn trong kho mặc định, không cần thêm repo). Khởi động lại Home Assistant.

**2. Thêm tích hợp.** Cài đặt → Thiết bị & dịch vụ → Thêm tích hợp → **MikroTik Extended**:
- Host: IP của router (mặc định `192.168.88.1`).
- Username và Password: tài khoản API bạn tạo ở bước 3.
- Port: `0` (tự chọn 8728, hoặc 8729 nếu dùng SSL).
- SSL Mode: `none` nếu chỉ dùng trong mạng nội bộ.

Trong tuỳ chọn của tích hợp, bật **Port switches** để card thấy các cổng.

**3. Tạo tài khoản API trên MikroTik.** Chạy trong Terminal (WinBox hoặc SSH):

```
/user group add name=ha-api policy=read,write,api,reboot,policy,test,sensitive
/user add name=homeassistant group=ha-api password="MAT_KHAU_DAI" address=IP_HA/32
```

- `MAT_KHAU_DAI`: tạo trên máy bạn, ví dụ `openssl rand -base64 24`. Đừng dán mật khẩu vào chat hay vào file công khai.
- `IP_HA/32`: IP của máy chạy Home Assistant, để chỉ máy đó đăng nhập được.
- `write` cần để tích hợp tự cấu hình switch và Kid Control; `reboot` cần cho nút khởi động lại. Thiếu quyền nào thì tính năng đó không dùng được, các cảm biến vẫn đọc được.

**4. Mở API chỉ cho Home Assistant.**

```
/ip service set api address=IP_HA/32 disabled=no
```

**Yêu cầu:** Home Assistant 2024.11 trở lên, RouterOS 7 trở lên.

**Card đọc được gì từ MikroTik Extended:**
- Cổng ethernet và PPPoE: trạng thái, tên RouterOS, loại. Cổng có tên chứa `WAN` (ví dụ `WAN-ETHER1`) được coi là cổng ra Internet và không hiện như cổng nội bộ.
- Đường hầm WireGuard: trạng thái, tổng RX/TX, thời gian bắt tay gần nhất. Giao diện WireGuard không hiện trong danh sách cổng.
- Thiết bị: các `device_tracker` có thuộc tính MAC, IP, interface.

**Bộ phát WiFi ZTE (tuỳ chọn):** nếu có cảm biến `…_connected_devices` của tích hợp ZTE (xem thư mục `zte-e2633-ha` hoặc fork `zte_tracker`), khai thêm cổng cắm ZTE:

```yaml
type: custom:mikrotik-topo-lan-card
zte_port: ether2   # tên cổng MikroTik nơi ZTE cắm, theo tên thực thể cổng
```

Không khai `zte_port` thì card không tự thêm bộ phát ZTE, vì không đoán được cổng.

**Lưu ý:** tên thực thể HA (ví dụ `ether2`) có thể khác tên RouterOS (ví dụ `ether3`). Card khớp cổng theo cả hai.
