# Lịch sử thay đổi

## 0.8.2
- **Sửa: không có đường nối nào với hộp tự dựng từ `topo_sensor`.** Hàm vẽ đường đọc cấu hình gốc và danh sách máy từ thực thể theo dõi, nên không thấy hộp SW/ZTE tự dựng và máy lấy từ cây thiết bị. Nay dùng đúng nhóm mà bước dựng giao diện đã dùng.
- Đường nối là nét đứt rõ (dày hơn, đậm hơn), có chấm ở điểm xuất phát; lớp đường nằm trên các cột nên không còn bị hộp che mất đoạn đầu.
- Không vẽ đường đi ngược (đích bên trái nguồn), như đường «router → cổng» vốn nằm trong hộp router.

## 0.8.1
- `topo_sensor`: tốc độ nhận/gửi từng máy (`rx_bps`/`tx_bps` của cây, lấy từ Kid Control qua tích hợp) vào thông tin thiết bị trên card.

## 0.8.0
- **`topo_sensor`**: đọc cây thiết bị của tích hợp `mikrotik_snmp` (cổng, bộ phát ZTE, máy kèm cha). Card tự dựng hộp (switch theo cổng có máy, bộ phát nối vào cổng/switch cha) và đặt từng máy vào hộp của cha;
  máy WiFi kèm băng tần, tín hiệu, chế độ. Thiết bị mới tự vào đúng hộp. Hộp người dùng đã khai được giữ nguyên (không tạo trùng). Vẽ lại khi cảm biến đổi.

## 0.7.0
- **`port_speed_sensors`**: chỉ định cảm biến tốc độ nhận/gửi cho từng cổng (ví dụ lấy từ SNMP qua helper Derivative, cập nhật mỗi vài giây) thay cho cảm biến của tích hợp MikroTik (chu kỳ 30 giây). Không có số hoặc đơn vị lạ thì giữ giá trị cũ.

## 0.6.3
- README: hướng dẫn cài tích hợp MikroTik Extended và ZTE (`zte_tracker` bản E2633) ngay sau mục Cài đặt; yêu cầu phiên bản thống nhất; bỏ chỉ dẫn tới kho chưa công bố.

## 0.6.2
- **Tốc độ từng máy tự động** từ cảm biến RX/TX của chính tích hợp MikroTik (nối qua sổ thực thể của Home Assistant); bằng 0 thì ẩn.
- Card vẽ lại khi giá trị của thực thể trong `sources`/`fields` thay đổi.

## 0.6.1
- Bỏ chế độ WiFi (802.11n…) khỏi nhãn thiết bị; chỉ còn băng tần và tín hiệu.
- **Tốc độ từng máy** từ Kid Control của MikroTik: `tools/mikrotik_toc_do_may.py` + nguồn `sources` không gắn hộp. Gộp theo MAC giữa các nguồn, tốc độ 0 không ghi đè số thật.

## 0.6.0
- **Thông số của chính hộp nằm ngay tiêu đề hộp to**: MAC, IP, tốc độ của Proxmox hoặc router ZTE hiện ở tiêu đề hộp, không còn hộp/hàng riêng. Proxmox hiện tổng số LXC/VM bên trong.
- **ZTE WiFi đủ máy**: máy ZTE báo mà MikroTik không có vẫn vào hộp, nên số máy khớp số ZTE báo; hộp có nguồn riêng được chia chỗ hiển thị trước.
- **Bridge LAN**: tên và tốc độ là tiêu đề của hộp to, không còn khung hàng riêng.
- **Ẩn khi không có**: tốc độ rx/tx bằng 0 (thiết bị, cổng, WAN, VPN), VPN không bật hoặc peer không kết nối, chip tổng bằng 0 trên đầu card, và cả cột MikroTik khi không có dữ liệu MikroTik (chỉ dùng ZTE).
- **Cấu hình mẫu** trong `examples/`: chỉ MikroTik, chỉ ZTE, MikroTik + ZTE, đa dụng đầy đủ.

## 0.5.0
- **Cấu hình đa dụng**: thông số lấy từ trạng thái hoặc thuộc tính của bất kỳ thực thể nào.
  - `sources`: danh sách thiết bị từ thuộc tính (danh sách đối tượng có `map`, hoặc chuỗi tách bằng `separator` và `pattern` regex có nhóm tên).
  - `fields` (hộp) và `device_fields` (thiết bị): `entity`, `attribute`, `extract`, `unit`, `template`, `label`.
- **Thông số không có dữ liệu thì ẩn hẳn**, không chiếm chỗ trong card hay hộp; cấu hình sai (regex hỏng) chỉ làm trường đó ẩn.
- Bỏ ảnh hưởng của gán tay cũ đã lưu trong trình duyệt (dùng `device_sources`).
- Cấu hình chỉ có hộp (switch, bộ phát, host) vẫn hiển thị.
- Bố cục khổ điện thoại: xếp dọc, không tràn ngang.

## 0.4.4
- **Router ZTE tự nằm trong hộp ZTE WiFi**: IP lấy từ thuộc tính `host` của cảm biến chính, không còn hiện trong LAN.
- **TX/RX của thiết bị WiFi qua ZTE** hiện như cổng (↓ ↑ và thanh), tách khỏi băng tần, RSSI và chế độ.

## 0.4.3
- **Nguồn thiết bị trong cài đặt**: tab Thiết bị của trình sửa có ô chọn nguồn cho từng thiết bị, lưu vào `device_sources`. Bỏ ô chọn trên card.
- `device_sources` được ưu tiên hơn `default_source`.

## 0.4.2
- **Chọn nguồn cho từng thiết bị** bằng ô chọn trên dòng (thay nút 📶); lựa chọn lưu theo người dùng HA.
- **`default_source`**: thiết bị có dây chưa có nguồn vào switch/bộ phát khai sẵn.
- **`ips` trên bộ phát** (ví dụ ZTE): chính router ZTE nằm trong hộp của nó, không còn trong nhóm LAN.
- **Bridge LAN** là hộp lớn, tên bridge làm tiêu đề; **hộp host** hiện IP/MAC đã khai khi chưa khớp thiết bị.
- Khóa nút (host, LXC…) được lưu lại khi tải lại.

## 0.4.1
- **Sơ đồ theo cây**: mỗi thiết bị là một hộp nhỏ, nét đứt từ nguồn đã cài (switch, bộ phát WiFi, hộp host).
- **Hộp lồng nhiều tầng**: `hosts` lồng `children` tới nhiều tầng; máy có tiền tố MAC (`guest_mac_prefix`) tự thành hộp con (LXC/VM); `guest_source` chọn nguồn cho chúng.
- **Hộp MikroTik**: khối WAN (nhà mạng, cổng PPPoE) và khối Bridge LAN (các cổng ether, chọn cổng trong bridge).
- **Switch nối vào switch khác** (`switch: <tên>`), có chặn vòng lặp.
- **Đặt tên tự do**: `port_names` cho cổng và bridge, `device_names` (theo MAC) cho thiết bị.
- Bỏ hộp ISP riêng; bỏ các nhãn nổi; các ô thiết bị trong cùng cột đều bề rộng.

## 0.4.0
- **Khối VPN tách riêng**: giao diện WireGuard (`mik-hk`, `mik-sg`, `wg-home`) không còn là cổng. Peer `0.0.0.0/0` (surfshark) là đường ra Internet qua VPN, nét đứt; peer còn lại là truy cập từ xa.
- **Mục WireGuard**: tổng RX/TX theo đơn vị dễ đọc (GB/MB) và thời gian bắt tay gần nhất.
- **MikroTik Extended**: tự nhận tiền tố từ tên cổng `switch.<tiền_tố>_port_<id>_port`, không cần khai `prefix`; đọc cổng và PPPoE (`_ppp_`); cổng tên WAN không lẫn vào cổng nội bộ.
- **Dòng máy**: hiện MAC; chip WiFi hiện băng tần, RSSI, chế độ và tốc độ RX/TX của bộ phát ZTE.
- **Chip cổng**: máy có dây hiện cổng MikroTik nó đang nối (ví dụ `ether3`), bỏ qua `BridgeLAN`.
- **Bộ phát ZTE tự thêm** khi khai `zte_port` và có cảm biến `…_connected_devices`.
- **Trình sửa bằng giao diện** (Sửa thẻ): tab Cấu hình và tab Thiết bị (thêm, sửa, xoá switch và bộ phát).
- **Hướng dẫn** cài MikroTik Extended và tạo tài khoản API trong README.

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
