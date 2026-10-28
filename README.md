# MikroTik Topo LAN Card

[![Mở kho này trong HACS của bạn.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TriTue2011&repository=mikrotik-topo-lan-card&category=plugin)

Card Lovelace cho Home Assistant vẽ **sơ đồ mạng LAN của router MikroTik**: Internet → MikroTik → bridge/cổng → switch, bộ phát WiFi (ZTE…) → từng thiết bị,
kèm tốc độ thời gian thực, nối bằng **nét đứt**. Không cần plugin giao diện nào khác.

> Ý tưởng sơ đồ cây lấy cảm hứng từ [doanlong1412/snmp-topo-lan-card](https://github.com/doanlong1412/snmp-topo-lan-card) (MIT). Card này viết lại cho MikroTik và nguồn dữ liệu khác.

**Cách dùng khuyến nghị:** card + tích hợp [`mikrotik_snmp`](https://github.com/TriTue2011/mikrotik_snmp) (MikroTik qua SNMPv3 chỉ đọc + ZTE E2633). Thiết bị mới vào mạng **tự xuất hiện và tự nối** vào sơ đồ, không phải khai từng máy.

## Mục lục
[Yêu cầu](#yêu-cầu) · [Cài đặt](#cài-đặt) · [Cập nhật và kiểm phiên bản](#cập-nhật-và-kiểm-phiên-bản) · [Bắt đầu nhanh](#bắt-đầu-nhanh-khuyến-nghị) ·
[Đọc sơ đồ](#đọc-sơ-đồ) · [Hiệu năng](#hiệu-năng-trên-thiết-bị-yếu) · [Khắc phục sự cố](#khắc-phục-sự-cố) · [Tuỳ chọn](#tuỳ-chọn) · [Cách cũ](#cách-cũ-tích-hợp-mikrotik-extended-không-khuyến-nghị)

## Yêu cầu
- Home Assistant **2024.11** trở lên, trình duyệt hiện đại (Chrome, Edge, Firefox, Safari mới) hoặc app Home Assistant.
- Một nguồn dữ liệu: tích hợp `mikrotik_snmp` (khuyến nghị), hoặc tích hợp MikroTik khác tạo thực thể kiểu `sensor.<tiền_tố>_port_<id>_rx|tx` (xem [Cách cũ](#cách-cũ-tích-hợp-mikrotik-extended-không-khuyến-nghị)).

## Cài đặt
**Qua HACS (khuyến nghị):**
1. HACS → ⋮ → **Kho tuỳ chỉnh** → dán `https://github.com/TriTue2011/mikrotik-topo-lan-card`, loại **Dashboard** (Giao diện) → Thêm.
2. Tìm «MikroTik Topo LAN Card» → **Tải xuống** → tải lại trình duyệt (`Ctrl+Shift+R`).
3. HACS tự thêm tài nguyên. Kiểm: Cài đặt → Bảng điều khiển → ⋮ → **Tài nguyên** phải có `/hacsfiles/mikrotik-topo-lan-card/mikrotik-topo-lan-card.js` loại *JavaScript module*.

**Thủ công:** chép `mikrotik-topo-lan-card.js` (lấy ở trang *Releases*) vào `/config/www/community/mikrotik-topo-lan-card/`, rồi thêm tài nguyên
`/local/community/mikrotik-topo-lan-card/mikrotik-topo-lan-card.js` loại *JavaScript module*.

## Cập nhật và kiểm phiên bản
Sau khi HACS cập nhật card, **trình duyệt và app Home Assistant hay giữ bản cũ trong bộ nhớ đệm**: giao diện vẫn là bản cũ dù đã «cập nhật». Làm đủ các bước:
1. HACS → card → **Tải lại/Cập nhật** tới phiên bản mới nhất.
2. Máy tính: `Ctrl+Shift+R`. Nếu vẫn cũ: `F12` → tab *Network* → tick *Disable cache* → tải lại.
3. App Home Assistant (điện thoại, máy tính bảng): Cài đặt app → *Khắc phục sự cố* → **Đặt lại bộ nhớ đệm giao diện** (Reset frontend cache), rồi mở lại app.
4. **Kiểm phiên bản đang chạy** (từ 0.8.4): mở console (`F12` → *Console*) và tìm dòng `MIKROTIK-TOPO-LAN-CARD v0.8.x`. Không thấy dòng này nghĩa là card chưa nạp, hoặc đang chạy bản cũ hơn 0.8.4.

## Bắt đầu nhanh (khuyến nghị)
**1. Cài tích hợp `mikrotik_snmp`** theo [README của nó](https://github.com/TriTue2011/mikrotik_snmp): chuẩn bị SNMPv3 chỉ đọc trên MikroTik, thêm tích hợp (nhớ **Tiền tố**, mặc định `mikrotik_router`), tuỳ chọn thêm ZTE và API chỉ đọc.

**2. Thêm card.** Trang tổng quan → ⋮ → Chỉnh sửa → **Thêm thẻ** → *Thủ công*, dán:
```yaml
type: custom:mikrotik-topo-lan-card
prefix: mikrotik_router                               # trùng Tiền tố của tích hợp
topo_sensor: sensor.mikrotik_router_cay_thiet_bi      # card tự dựng hộp và nối thiết bị
```
Kiểm trước: Công cụ phát triển → Trạng thái → gõ `cay_thiet_bi`: phải có `sensor.<tiền_tố>_cay_thiet_bi` với thuộc tính `nodes` và `clients`. Không có thì card trống: sai tiền tố, hoặc tích hợp chưa chạy.

**3. Đặt tên hộp theo ý anh (tuỳ chọn).** Dùng `switches` (tên hộp bên phải, theo cổng); hộp MikroTik bên trái vẫn giữ tên cổng gốc `ether2`, `ether3`…:
```yaml
type: custom:mikrotik-topo-lan-card
prefix: mikrotik_router
topo_sensor: sensor.mikrotik_router_cay_thiet_bi
switches:
  - { name: SW1, port: ether2 }      # đổi ether2, ether3 thành cổng thật của anh
  - { name: SW2, port: ether3 }
```
`port_names` (ví dụ `{ ether2: SW1 }`) đổi **cả nhãn cổng trong hộp MikroTik**; nếu muốn giữ tên cổng gốc thì dùng `switches` như trên.
Hộp anh đã khai (`switches`, `access_points`) được giữ nguyên, card chỉ **thêm hộp còn thiếu**, không tạo trùng.

**Đã có cấu hình cũ? Đừng thay bằng cấu hình tối thiểu.** Chỉ **thêm** dòng `topo_sensor` vào cấu hình đang dùng; các khối anh đã khai (ví dụ `hosts` cho Proxmox/LXC, `access_points`, `device_names`, `device_sources`) vẫn chạy cùng `topo_sensor`. Thay hẳn bằng cấu hình tối thiểu sẽ làm **mất các hộp tự khai** như Proxmox:
```yaml
type: custom:mikrotik-topo-lan-card
prefix: mikrotik_router
topo_sensor: sensor.mikrotik_router_cay_thiet_bi
switches:
  - { name: SW1, port: ether2 }
  - { name: SW2, port: ether3 }
hosts:                               # hộp Proxmox: máy có MAC bắt đầu bằng guest_mac_prefix (LXC/VM) nằm trong hộp
  - { name: Proxmox, ip: 192.168.88.100, switch: SW2, guest_mac_prefix: "bc:24:11" }
```

## Đọc sơ đồ
- **Cột trái, hộp MikroTik**: tên router kèm **số thiết bị** `(n)`, CPU/RAM, thời gian chạy; hộp *Internet* (cổng WAN, tốc độ ↓↑); hộp *bridge* chứa các cổng với tốc độ, chấm xanh = đang nối, đỏ = ngắt.
- **Cột phải**: hộp theo cổng (switch) hoặc bộ phát WiFi, và từng thiết bị bên trong: tên, băng tần, tín hiệu (dBm), tốc độ ↓↑, MAC, IP. Chấm `◌` cạnh thiết bị = MAC «riêng tư» (địa chỉ ngẫu nhiên của điện thoại).
- **Nét đứt có chấm ở nguồn**: đi ra từ **đúng hàng cổng** (ví dụ `ether2`) trong hộp MikroTik tới hộp của nó, từ hộp tới bộ phát WiFi, rồi tới **từng thiết bị**. Nhờ đó nhìn là biết máy nào cắm cổng nào, qua ZTE hay không.
- Nét đứt **chạy** khi cổng có lưu lượng; tắt ở máy yếu (xem [Hiệu năng](#hiệu-năng-trên-thiết-bị-yếu)).
- Màn hình **hẹp** (dưới 820 px, điện thoại dọc): card chuyển một cột và **không vẽ đường nối**; xoay ngang hoặc dùng cửa sổ rộng hơn để thấy nét đứt.
- Nút **✎** ở đầu card: thêm/xoá switch, bộ phát tay, gán thiết bị (xem mục «Tự thêm switch và bộ phát WiFi»).
- Muốn tìm một thiết bị trong danh sách dài: dùng nút **Xem thêm** (card hiện `client_limit` thiết bị đầu, mặc định 30).

## Hiệu năng trên thiết bị yếu
Home Assistant gán dữ liệu cho card mỗi khi **bất kỳ thực thể nào** đổi (nhà có hàng nghìn thực thể thì liên tục). Card đã được làm nhẹ (từ 0.8.3):
- Vẽ lại **tối đa một lần mỗi `refresh_ms`** (mặc định 1000 ms, thấp nhất 250); **không vẽ khi card ngoài màn hình** hoặc tab đang ẩn, hiện lại thì vẽ ngay.
- CSS nạp một lần; mỗi hộp chỉ đo một lần khi vẽ đường nối.
- Hoạt ảnh nét đứt tự tắt trên máy ≤ 2 nhân hoặc ≤ 2 GB RAM.
- Đo trong Chrome với 3000 thực thể, 200 lần cập nhật không liên quan: CPU của card giảm từ khoảng 890 ms xuống gần 0.

Vẫn giật? Thử theo thứ tự:
```yaml
refresh_ms: 3000          # vẽ lại tối đa 3 giây một lần
animate_lines: false      # tắt hoạt ảnh nét đứt
client_limit: 15          # hiện ít thiết bị hơn
hide_offline_clients: true
```
Trang có nhiều card tuỳ chỉnh khác (mỗi card nạp thêm mã) cũng làm chậm: card này chỉ giảm được phần của nó.

## Khắc phục sự cố
| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Card trống hoặc «Không có dữ liệu» | Sai `prefix`, hoặc `topo_sensor` không tồn tại | Công cụ phát triển → Trạng thái, gõ `cay_thiet_bi`; sửa `prefix`/`topo_sensor` cho khớp |
| Vẫn thấy giao diện cũ sau khi cập nhật | Bộ nhớ đệm trình duyệt/app | Mục [Cập nhật và kiểm phiên bản](#cập-nhật-và-kiểm-phiên-bản); xem dòng version trong console |
| Không có nét đứt | Màn hình dưới 820 px; hoặc đang chạy bản cũ hơn 0.8.2 | Cửa sổ rộng hơn; kiểm phiên bản |
| Một hộp tên «SW2» đỏ, không có tốc độ | Tên `switches`/`port_names` trỏ vào cổng không nối gì | Đổi `port` sang cổng thật (xem tên cổng trong hộp MikroTik) |
| Máy WiFi không nằm trong hộp ZTE | ZTE chưa đăng nhập được trong `mikrotik_snmp` | Xem `sensor.<tiền_tố>_zte_trang_thai` và README của `mikrotik_snmp` |
| Tên hộp trong MikroTik bị đổi theo `port_names` | `port_names` đổi cả nhãn cổng | Dùng `switches` để chỉ đặt tên hộp bên phải |
| Card làm đơ trình duyệt | Máy yếu, hoặc nhiều card nặng | Mục [Hiệu năng](#hiệu-năng-trên-thiết-bị-yếu) |
| Lỗi `port_names phải là đối tượng` khi lưu | YAML sai | `port_names: { ether2: SW1 }` (đối tượng, không phải danh sách) |

## Cách cũ: tích hợp MikroTik Extended (không khuyến nghị)
> **Cảnh báo bảo mật.** Hướng dẫn dưới đây tạo tài khoản API có quyền **ghi và khởi động lại router** (`write`, `reboot`, `policy`, `sensitive`). Ai lấy được mật khẩu trong cấu hình Home Assistant điều khiển được router.
> Nếu chưa phải dùng, hãy dùng `mikrotik_snmp` (chỉ đọc) ở mục «Bắt đầu nhanh». Giữ lại mục này cho ai đã có sẵn tích hợp MikroTik Extended.

### Cài tích hợp MikroTik Extended

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

**Lưu ý:** tên thực thể HA (ví dụ `ether2`) có thể khác tên RouterOS (ví dụ `ether3`). Card khớp cổng theo cả hai.

### Cài tích hợp ZTE riêng (cách cũ, cho bộ phát ZTE E2633)
Cần nếu muốn card hiện máy nào vào WiFi ZTE, băng tần và tín hiệu. Dùng bản fork có hỗ trợ E2633:

1. HACS → Custom repositories → `https://github.com/TriTue2011/zte_tracker` → loại *Integration* → cài → khởi động lại Home Assistant (cần Home Assistant 2025.1 trở lên).
2. Cài đặt → Thiết bị & dịch vụ → Thêm tích hợp → **ZTE router tracker**: nhập IP bộ phát, tên đăng nhập, mật khẩu quản trị và chọn model **E2633**.
3. Tích hợp tạo cảm biến `sensor.zte_router_<ip>` và `sensor.zte_router_<ip>_connected_devices` (thuộc tính `clients`: `mac`, `ip`, `name`, `band`, `rssi`, `mode`, `rx_rate`, `tx_rate`). IP viết dấu gạch dưới, ví dụ `192.168.1.1` → `sensor.zte_router_192_168_1_1_connected_devices`.
4. Khai vào card (xem `examples/2-chi-zte.yaml` hoặc `examples/3-mikrotik-va-zte.yaml`):
```yaml
access_points:
  - name: ZTE WiFi
    ips: [192.168.1.1]          # IP bộ phát: thông số của chính nó nằm ở tiêu đề hộp
    clients_sensor: sensor.zte_router_192_168_1_1_connected_devices
```
Chưa thử các bước 1–2 trên Home Assistant thật của người khác; tích hợp chỉ đọc, sai mật khẩu thì tạm ngừng 30 phút để không khoá tài khoản.

## Cấu hình tối thiểu (cách cũ, tích hợp MikroTik Extended)
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
| `port_names` | | `{ether1: "Bộ phát WiFi"}` — đặt tên cổng; đổi **cả nhãn trong hộp MikroTik**. Muốn chỉ đặt tên hộp bên phải thì dùng `switches` |
| `switches` | | `[{ name: SW1, port: ether2 }]` — đặt tên hộp theo cổng, hộp MikroTik giữ tên gốc |
| `port_speed_sensors` | | `{ether2: {rx: sensor.sw1_nhan_mbit, tx: sensor.sw1_gui_mbit}}` — lấy tốc độ cổng từ cảm biến khác (ví dụ SNMP + Derivative, cập nhật vài giây) thay cho cảm biến của tích hợp MikroTik. Khoá là id hoặc tên cổng (`ether2`, `bridgelan`). Cảm biến chưa có số hoặc đơn vị không phải tốc độ (`Mbit/s`, `kB/s`…) thì card giữ giá trị cũ |
| `topo_sensor` | | Cảm biến `…_cay_thiet_bi` của `mikrotik_snmp`: card tự dựng hộp và nối thiết bị (xem mục «Tự nối thiết bị vào sơ đồ») |
| `hide_ports` | | Danh sách id cổng/đường hầm cần ẩn |
| `show_clients` | `true` | Hiện cột thiết bị |
| `client_limit` | `30` | Số thiết bị hiện ban đầu (có nút «Xem thêm») |
| `refresh_ms` | `1000` | Vẽ lại tối đa một lần mỗi chừng này mili giây (nhỏ nhất 250). Home Assistant báo `hass` mỗi khi BẤT KỲ thực thể nào đổi; tăng số này trên thiết bị yếu |
| `animate_lines` | `true` | `false` tắt hoạt ảnh nét đứt chạy theo lưu lượng. Tự tắt trên máy ≤ 2 nhân hoặc ≤ 2 GB |
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

## Tự nối thiết bị vào sơ đồ từ cây thiết bị (`topo_sensor`, từ 0.8.0)
Với tích hợp [`mikrotik_snmp`](https://github.com/TriTue2011/mikrotik_snmp) (MikroTik qua SNMP + ZTE E2633), chỉ cần một dòng:
```yaml
type: custom:mikrotik-topo-lan-card
prefix: mikrotik_router
topo_sensor: sensor.mikrotik_router_cay_thiet_bi
switches:                          # (tuỳ chọn) đặt tên hộp bên phải theo cổng; hộp router vẫn giữ tên cổng theo MikroTik
  - { name: SW1, port: ether2 }
  - { name: SW2, port: ether3 }
```
`port_names` đổi cả nhãn cổng trong hộp router; muốn giữ nguyên tên cổng theo MikroTik mà chỉ đặt tên hộp bên phải thì dùng `switches` như trên (đổi `ether2`, `ether3` thành cổng thật của anh). Mọi đường nối là **nét đứt**, có chấm ở nguồn: từ đúng hàng cổng (ví dụ `ether2`) trong hộp router tới hộp của nó, từ hộp tới bộ phát ZTE, rồi tới từng máy. Màn hình hẹp (dưới 820 px) chuyển một cột và không vẽ đường nối.
Card đọc thuộc tính `nodes` và `clients` của cảm biến đó rồi **tự dựng hộp** (mỗi cổng có máy thành một switch, mỗi bộ phát ZTE thành một bộ phát nối vào cổng/switch nó cắm) và
**đặt từng máy vào hộp của cha nó**; máy WiFi nằm trong hộp ZTE kèm băng tần, tín hiệu, chế độ. **Thiết bị mới trong mạng tự có mặt và tự nối vào đúng hộp**, không cần `device_sources`
hay `sources`. Hộp bạn đã khai tay (`switches`, `access_points`) được giữ nguyên: card chỉ thêm hộp còn thiếu, không tạo trùng (trùng cổng với switch có `port`, trùng tên hoặc IP với bộ phát).
Máy mà tích hợp chưa biết nằm sau cổng nào (cha là router) thì không bị ép vào hộp nào.

## Tốc độ vào/ra từng thiết bị
**Tự động**: mỗi máy trong tích hợp MikroTik là một thiết bị của Home Assistant có hai cảm biến **RX** và **TX** (đơn vị kB/s…). Card nối chúng với tracker của máy qua sổ thực thể của Home Assistant (hoặc theo tên: `device_tracker.cam_phong_khach` ↔ `sensor.cam_phong_khach_rx_mikrotik`, `sensor.cam_phong_khach_tx_mikrotik`) và hiện ↓ ↑ cạnh máy; bằng 0 thì ẩn. Không cần khai gì. Nếu máy không có hai cảm biến đó, bật theo tuỳ chọn theo dõi lưu lượng máy của tích hợp (tên tuỳ chọn tuỳ phiên bản tích hợp, **chưa đối chiếu**).

**Nguồn khác** (không có cảm biến trên): ZTE E2633 không báo tốc độ từng máy, nhưng RouterOS có Kid Control đo theo MAC; `tools/mikrotik_toc_do_may.py` đọc nó (chỉ ĐỌC, cùng cách với `mikrotik_bridge_hosts.py`):

1. Trên router bật Kid Control một lần: `/ip kid-control add name=ca-nha mon=0s-1d tue=0s-1d wed=0s-1d thu=0s-1d fri=0s-1d sat=0s-1d sun=0s-1d`.
2. Chép `tools/mikrotik_toc_do_may.py` **và** `tools/mikrotik_bridge_hosts.py` vào `/config/`, rồi tạo cảm biến như mục bảng MAC ở trên:
```yaml
command_line:
  - sensor:
      name: MikroTik tốc độ máy
      unique_id: mikrotik_toc_do_may
      command: "python3 /config/mikrotik_toc_do_may.py --host 192.168.88.1 --user docdulieu"   # MIKROTIK_PASSWORD đặt như mục trên
      scan_interval: 30
      value_template: "{{ value_json.clients | length }}"
      json_attributes_path: "$"
      json_attributes: [clients]
```
3. Khai làm nguồn không gắn hộp (chỉ bổ sung tốc độ cho thiết bị theo MAC; tốc độ 0 không ghi đè số thật của nguồn khác):
```yaml
sources:
  - entity: sensor.mikrotik_toc_do_may
    attribute: clients
```
Máy nào đo được > 0 thì hiện ↓ ↑ cạnh máy đó; bằng 0 thì ẩn. **Chưa thử trên router thật**: test dùng router giả; tên trường `rate-down`/`rate-up` của Kid Control lấy từ tài liệu RouterOS, chưa đối chiếu với đầu ra thật.

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
Bản thân card **không đọc SNMP**, chỉ đọc thực thể của Home Assistant (tích hợp `mikrotik_snmp` là bên dùng SNMP). MikroTik có hỗ trợ SNMP, nhưng nhiều bộ phát WiFi do nhà mạng cấp (ví dụ ZTE E2633) **có thể không** cho người dùng bật SNMP; cách gán theo bảng MAC ở trên không phụ thuộc vào nó.
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
    attribute: devices              # "84:CC:A8:A4:4F:95(Tên-192.168.88.34), 8C:CE:..."
    pattern: '^(?<mac>[0-9A-Fa-f:]{17})\((?<name>.+)-(?<ip>[0-9.]+)\)$'
```

**Trường tùy chỉnh** (`fields`) — gắn vào hộp (`switches`, `access_points`, `hosts`) hoặc vào thiết bị (`device_fields`, khoá là MAC):

```yaml
hosts:
  - name: Proxmox
    ip: 192.168.88.100
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
