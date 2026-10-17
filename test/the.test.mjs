import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esc, toBps, fmtRate, fmtUptime, discover, phanNhom, macRiengTu, renderHtml, dungNut, lamSachNutNguoiDung, lamSachGan, noiCam, thietBiTuCamBien, thongTinWifi, autoCauHinh, toBytes, fmtBytes, detectPrefix, capNhatCauHinh, themMuc, xoaMuc, suaMuc } from '../mikrotik-topo-lan-card.js';

const mang = JSON.parse(readFileSync(new URL('./fixtures/states.json', import.meta.url), 'utf8'));
const states = Object.fromEntries(mang.map((s) => [s.entity_id, { state: s.state, attributes: s.attributes }]));

test('đơn vị: kB/s của HA → bit/giây; đơn vị lạ hoặc số hỏng → 0', () => {
  assert.equal(toBps(1, 'kB/s'), 8000);
  assert.equal(toBps(2, 'Mbit/s'), 2e6);
  assert.equal(toBps(5, 'furlong'), 0);
  assert.equal(toBps('abc', 'kB/s'), 0);
  assert.equal(toBps(-3, 'kB/s'), 0);
  assert.equal(fmtRate(14.88e6), '14.9 Mbps');
  assert.equal(fmtRate(0), '0');
});

test('uptime hiển thị ngày/giờ; chuỗi hỏng → rỗng', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  assert.equal(fmtUptime('2026-10-15T09:00:00Z', now), '2d 3h');
  assert.equal(fmtUptime('không-phải-ngày', now), '');
});

test('khám phá dữ liệu thật (đã ẩn danh): WAN, cổng, bridge, đường hầm, thiết bị, lõi', () => {
  const m = discover(states, {});
  assert.ok(m.wan, 'phải thấy cổng ra Internet');
  assert.equal(m.wan.id, 'pppoe_out1');
  // ether4 (entity) có tên RouterOS WAN-ETHER1 là cổng cáp ra ISP: không liệt kê như cổng nội bộ.
  assert.deepEqual(m.ports.map((p) => p.id).filter((i) => i.startsWith('ether')).sort(), ['ether1', 'ether2', 'ether3']);
  assert.ok(!m.ports.some((p) => /wan/i.test(p.name || '')), 'cổng WAN không nằm trong danh sách cổng nội bộ');
  assert.ok(m.bridges.some((b) => b.id === 'bridgelan'));
  // Chỉ hiện đường hầm và thiết bị đang kết nối: fixture có 2 peer kết nối (trên 3) và 25 máy home (trên 56).
  assert.equal(m.tunnels.length, 2);
  assert.equal(m.clients.length, 25);
  assert.equal(typeof m.core.cpu, 'number');
  const e1 = m.ports.find((p) => p.id === 'ether1');
  assert.ok(Math.abs(e1.rx - Number(states['sensor.mikrotik_router_port_ether1_rx'].state) * 8000) < 1, 'ether1 rx phải đổi từ kB/s');
});

test('tiền tố sai → không thấy cổng/WAN; thiết bị (theo attribution) vẫn có; hoàn toàn trống → hiện lời nhắc, không ném lỗi', () => {
  const m = discover(states, { prefix: 'khong_co' });
  assert.equal(m.wan, null); assert.equal(m.ports.length, 0); assert.equal(m.tunnels.length, 0);
  assert.equal(m.clients.length, 25, 'thiết bị đang kết nối nhận theo attribution MikroTik, không theo tiền tố');
  const trong = discover({}, {});
  assert.equal(trong.wan, null); assert.equal(trong.clients.length, 0);
  assert.match(renderHtml(trong, {}), /Không có dữ liệu/);
});

test('cấu hình: ẩn cổng, đặt tên cổng, chọn WAN tay', () => {
  const m = discover(states, { hide_ports: ['ether3'], port_names: { ether1: 'Công tắc lõi' }, wan: 'ether4' });
  assert.ok(!m.ports.some((p) => p.id === 'ether3'));
  assert.equal(m.ports.find((p) => p.id === 'ether1').label, 'Công tắc lõi');
  assert.equal(m.wan.id, 'ether4');
});

test('XSS: tên máy/ghi chú cổng từ mạng không bao giờ thành thẻ HTML', () => {
  const xau = '<img src=x onerror=alert(1)>"\'';
  const s = structuredClone(states);
  s['device_tracker.thiet_bi_01'].attributes.host_name = xau;
  s['sensor.mikrotik_router_port_ether1_rx'].attributes.comment = xau;
  const html = renderHtml(discover(s, { port_names: {} }), { title: xau, router_name: xau, isp_name: xau });
  assert.ok(!html.includes('<img'), 'không được còn thẻ img thô');
  assert.ok(!/onerror=alert\(1\)>/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, '')));
  assert.equal(esc(xau).includes('<'), false);
});

test('MAC riêng tư (bit 0x02) là dấu hiệu máy dùng WiFi', () => {
  assert.equal(macRiengTu('da:a1:19:00:00:01'), true);
  assert.equal(macRiengTu('00:11:22:33:44:55'), false);
  assert.equal(macRiengTu(''), false);
});

const may = (ten, mac, ip, ifc = 'BridgeLAN') => ({ name: ten, mac, ip, interface: ifc, online: true, source: 'dhcp' });

test('gán thiết bị vào bộ phát WiFi (ZTE): theo MAC cấu hình, theo IP, gán tay thắng cấu hình, wlan của MikroTik', () => {
  const cs = [may('A', 'AA:AA:AA:AA:AA:01', '192.168.88.11'), may('B', 'AA:AA:AA:AA:AA:02', '192.168.88.12'),
    may('C', 'AA:AA:AA:AA:AA:03', '192.168.88.13'), may('D', 'AA:AA:AA:AA:AA:04', '192.168.88.14', 'wlan1'),
    may('E', 'AA:AA:AA:AA:AA:05', '192.168.88.15')];
  const cfg = { access_points: [{ name: 'ZTE WiFi', port: 'ether2', macs: ['aa-aa-aa-aa-aa-01'], ips: ['192.168.88.12'] }] };
  const kq = phanNhom(cs, cfg, { 'aa:aa:aa:aa:aa:03': 0 });
  const theoTen = Object.fromEntries(kq.nhom.map((g) => [g.name, g.clients.map((c) => c.name).sort()]));
  assert.deepEqual(theoTen['ZTE WiFi'], ['A', 'B', 'C']);
  assert.deepEqual(theoTen['WiFi (MikroTik)'], ['D']);
  assert.deepEqual(theoTen['LAN'], ['E']);
  // bỏ gán: máy C không nằm trong cấu hình nên về LAN
  const sau = phanNhom(cs, cfg, {});
  assert.ok(sau.nhom.find((g) => g.name === 'LAN').clients.some((c) => c.name === 'C'));
});

test('hiển thị: nhóm ZTE có tiêu đề + nút gán; giới hạn số thiết bị; tìm kiếm', () => {
  const cfg = { access_points: [{ name: 'ZTE WiFi', port: 'ether2', macs: [] }], client_limit: 5 };
  const ui = { aps: [{ i: 0, name: 'ZTE WiFi' }], gan: {}, states };
  const html = renderHtml(discover(states, cfg), cfg, ui);
  assert.match(html, /ZTE WiFi \(0\)/);
  assert.match(html, /data-act="gan"/);
  assert.match(html, /Xem thêm/);
  const hit = renderHtml(discover(states, cfg), cfg, { ...ui, search: 'Thiết bị 07' });
  assert.match(hit, /Thiết bị 07/); assert.ok(!/Thiết bị 08/.test(hit));
  const khong = renderHtml(discover(states, { ...cfg, show_clients: false }), { ...cfg, show_clients: false }, ui);
  assert.ok(!/cot-may/.test(khong));
});

test('MAC từ cảm biến bảng-theo-cổng: gán tự động vào ZTE, không cần SNMP của bộ phát', () => {
  const cs = [may('A', 'AA:AA:AA:AA:AA:01', '192.168.88.11'), may('B', 'BB:BB:BB:BB:BB:01', '192.168.88.12')];
  const cfg = { access_points: [{ name: 'ZTE WiFi', port: 'ether2', mac_sensor: 'sensor.ban_mac' }] };
  const st = { 'sensor.ban_mac': { state: '2', attributes: { ether2: ['aa:aa:aa:aa:aa:01'], ether3: ['bb:bb:bb:bb:bb:01'] } } };
  const kq = phanNhom(cs, cfg, {}, st);
  assert.deepEqual(kq.nhom.find((g) => g.name === 'ZTE WiFi').clients.map((c) => c.name), ['A']);
  assert.deepEqual(kq.nhom.find((g) => g.name === 'LAN').clients.map((c) => c.name), ['B']);
  // cảm biến thiếu/hỏng → không ném lỗi, không gán nhầm
  const hong = phanNhom(cs, cfg, {}, { 'sensor.ban_mac': { state: 'x', attributes: { ether2: 'khong-phai-danh-sach' } } });
  assert.equal(hong.nhom.find((g) => g.name === 'ZTE WiFi').clients.length, 0);
  assert.equal(phanNhom(cs, cfg, {}, {}).nhom.find((g) => g.name === 'ZTE WiFi').clients.length, 0);
});

test('cổng của bộ phát khớp theo id HOẶC tên RouterOS (id theo tên mặc định, tên thật có thể đã đổi)', () => {
  const m = discover(states, {});
  const html = renderHtml(m, {}, {});
  assert.match(html, /data-ids="ether1 ether2"/, 'id ether1 mang tên RouterOS ether2 phải khớp cả hai');
});

test('switch trung gian: máy sau cổng vào nhóm switch, ZTE nhận máy được khai báo hoặc MAC riêng tư (gợi ý), không gom hết vào ZTE', () => {
  const cs = [may('Máy có dây', '00:aa:aa:aa:aa:01', '192.168.88.11'), may('Điện thoại', 'da:aa:aa:aa:aa:02', '192.168.88.12'),
    may('Loa WiFi', '00:aa:aa:aa:aa:03', '192.168.88.13'), may('Khác cổng', '00:bb:bb:bb:bb:01', '192.168.88.14')];
  const st = { 'sensor.ban_mac': { state: '3', attributes: { ether2: ['00:aa:aa:aa:aa:01', 'da:aa:aa:aa:aa:02', '00:aa:aa:aa:aa:03'] } } };
  const cfg = {
    mac_sensor: 'sensor.ban_mac',
    switches: [{ name: 'Switch phòng khách', port: 'ether2' }],
    access_points: [{ name: 'ZTE WiFi', switch: 'Switch phòng khách', auto_private_mac: true, macs: ['00:aa:aa:aa:aa:03'] }]
  };
  const kq = phanNhom(cs, cfg, {}, st);
  const nhom = Object.fromEntries(kq.nhom.map((g) => [g.name, g.clients.map((c) => c.name).sort()]));
  assert.deepEqual(nhom['ZTE WiFi'], ['Loa WiFi', 'Điện thoại'], 'khai báo + MAC riêng tư');
  assert.deepEqual(nhom['Switch phòng khách'], ['Máy có dây'], 'máy có dây sau switch KHÔNG bị gom vào ZTE');
  assert.deepEqual(nhom['LAN'], ['Khác cổng']);
  // tắt gợi ý: điện thoại ở lại nhóm switch; gán tay vẫn thắng
  const tat = phanNhom(cs, { ...cfg, access_points: [{ ...cfg.access_points[0], auto_private_mac: false }] }, {}, st);
  assert.ok(tat.nhom.find((g) => g.name === 'Switch phòng khách').clients.some((c) => c.name === 'Điện thoại'));
  const tay = phanNhom(cs, { ...cfg, access_points: [{ ...cfg.access_points[0], auto_private_mac: false }] }, { 'da:aa:aa:aa:aa:02': 0 }, st);
  assert.ok(tay.nhom.find((g) => g.name === 'ZTE WiFi').clients.some((c) => c.name === 'Điện thoại'));
});

test('NGƯỜI DÙNG tự thêm hai switch trên card; bộ phát cắm vào switch thứ hai; máy gán tay theo khoá nút', () => {
  const cs = [may('Có dây A', '00:aa:aa:aa:aa:01', '192.168.88.11'), may('Có dây B', '00:bb:bb:bb:bb:01', '192.168.88.12'),
    may('Điện thoại', 'da:cc:cc:cc:cc:01', '192.168.88.13')];
  const st = { 'sensor.ban_mac': { state: '3', attributes: { ether2: ['00:aa:aa:aa:aa:01', 'da:cc:cc:cc:cc:01'], ether3: ['00:bb:bb:bb:bb:01'] } } };
  const cfg = { mac_sensor: 'sensor.ban_mac' };
  const nodes = [
    { id: 'sw-phong-khach', name: 'Switch phòng khách', kind: 'switch', parent: 'port:ether2' },
    { id: 'sw-phong-ngu', name: 'Switch phòng ngủ', kind: 'switch', parent: 'port:ether3' },
    { id: 'zte', name: 'ZTE WiFi', kind: 'ap', parent: 'node:u-sw-phong-khach', tuDong: true }
  ];
  const kq = phanNhom(cs, cfg, {}, st, nodes);
  const theo = Object.fromEntries(kq.nhom.map((g) => [g.name, g.clients.map((c) => c.name).sort()]));
  assert.deepEqual(theo['Switch phòng khách'], ['Có dây A']);
  assert.deepEqual(theo['Switch phòng ngủ'], ['Có dây B']);
  assert.deepEqual(theo['ZTE WiFi'], ['Điện thoại'], 'MAC riêng tư sau cổng gốc của ZTE → nhóm WiFi');
  // gán tay theo khoá nút: máy có dây A thực ra nằm ở ZTE
  const tay = phanNhom(cs, cfg, { '00:aa:aa:aa:aa:01': 'u-zte' }, st, nodes);
  assert.ok(tay.nhom.find((g) => g.name === 'ZTE WiFi').clients.some((c) => c.name === 'Có dây A'));
  // nơi có thể cắm: cổng MikroTik + nút đã có
  const m = discover(states, {});
  const nc = noiCam(m, kq.nut).map((o) => o.value);
  assert.ok(nc.includes('port:ether1') && nc.includes('node:u-zte'));
});

test('dữ liệu người dùng bị sửa hỏng (localStorage/user data) được làm sạch, không phá card', () => {
  const xau = [null, 5, 'x', { id: '<img onerror=1>', name: 'a' }, { id: 'ok', name: '<b>x</b>'.repeat(30), kind: 'lạ', parent: 5 },
    { id: 'ok', name: 'trùng' }, ...Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, name: 'n' }))];
  const sach = lamSachNutNguoiDung(xau);
  assert.ok(sach.length <= 40);
  assert.ok(sach.every((u) => /^[a-z0-9_-]{1,40}$/.test(u.id) && u.name.length <= 60 && ['switch', 'ap'].includes(u.kind) && typeof u.parent === 'string'));
  assert.equal(sach.filter((u) => u.id === 'ok').length, 1, 'id trùng chỉ giữ một');
  assert.deepEqual(lamSachNutNguoiDung('không-phải-mảng'), []);
  const gan = lamSachGan({ 'AA:BB:CC:DD:EE:01': 'u-zte', 'khong-phai-mac': 'u-zte', 'aa:bb:cc:dd:ee:02': '<script>', 'aa:bb:cc:dd:ee:03': 2, 'aa:bb:cc:dd:ee:04': 9999 });
  assert.deepEqual(gan, { 'aa:bb:cc:dd:ee:01': 'u-zte', 'aa:bb:cc:dd:ee:03': 2 });
  assert.deepEqual(lamSachGan([1, 2]), {});
  // render với dữ liệu hỏng đã làm sạch và tên nút chứa HTML: không thành thẻ
  const nodes = lamSachNutNguoiDung([{ id: 'a', name: '<img src=x onerror=alert(1)>', kind: 'switch', parent: 'port:ether2' }]);
  const html = renderHtml(discover(states, {}), {}, { nodes, edit: true, states, gan: {} });
  assert.ok(!html.includes('<img'), 'tên nút do người dùng nhập không được thành HTML');
  assert.match(html, /data-act="them-nut"/, 'ở chế độ sửa có biểu mẫu thêm nút');
  assert.match(html, /data-act="xoa-nut"/, 'nút do người dùng thêm có nút xoá');
});

test('bộ phát tự báo danh sách máy WiFi (clients_sensor): vào nhóm bộ phát kèm băng tần và tín hiệu; dữ liệu hỏng không phá', () => {
  const cs = [may('Điện thoại', '02:00:00:00:00:08', '192.168.88.48'), may('Máy khác', '02:00:00:00:00:77', '192.168.88.77')];
  const st = { 'sensor.zte_clients': { state: '2', attributes: { clients: [
    { mac: '02:00:00:00:00:08', band: '5G', rssi: -65, mode: '802.11ac' },
    { mac: 'khong-phai-mac', band: '2.4G', rssi: -40 }, null, 5, { mac: '02:00:00:00:00:09', band: '2.4G', rssi: 'abc' }] } } };
  const cfg = { access_points: [{ name: 'ZTE WiFi', port: 'ether2', clients_sensor: 'sensor.zte_clients' }] };
  const kq = phanNhom(cs, cfg, {}, st);
  const theo = Object.fromEntries(kq.nhom.map((g) => [g.name, g.clients.map((c) => c.name)]));
  assert.deepEqual(theo['ZTE WiFi'], ['Điện thoại']);
  assert.deepEqual(theo['LAN'], ['Máy khác']);
  assert.equal(thietBiTuCamBien('sensor.zte_clients', st).length, 2, 'phần tử sai khuôn bị bỏ');
  assert.equal(thietBiTuCamBien('sensor.zte_clients', st)[1].rssi, null, 'tín hiệu hỏng → null, không bịa');
  assert.deepEqual(thongTinWifi(cfg, st)['02:00:00:00:00:08'], { band: '5G', rssi: -65, mode: '802.11ac', rxRate: null, txRate: null });
  const html = renderHtml(discover(states, {}), cfg, { states: { ...states, ...st }, gan: {}, nodes: [] });
  assert.match(html, /ZTE WiFi \(/);
  const html2 = renderHtml({ ...discover(states, {}), clients: cs }, cfg, { states: st, gan: {}, nodes: [] });
  assert.match(html2, /5G · -65 dBm/, 'hiện băng tần và tín hiệu cạnh máy');
  for (const xau of [undefined, {}, { 'sensor.zte_clients': { attributes: { clients: 'x' } } }]) assert.deepEqual(thietBiTuCamBien('sensor.zte_clients', xau), []);
});

test('MikroTik Extended: cổng là switch…_port_<id>_port, PPPoE là switch…_ppp_<id>_port; cổng WAN không lẫn vào cổng nội bộ', () => {
  const st = {
    'switch.mikrotik_router_port_ether3_port': { state: 'off', attributes: { name: 'ether4', default_name: 'ether3', type: 'ether', running: false, comment: '' } },
    'switch.mikrotik_router_port_ether4_port': { state: 'on', attributes: { name: 'WAN-ETHER1', default_name: 'ether4', type: 'ether', running: true, comment: '' } },
    'switch.mikrotik_router_ppp_pppoe_out1_port': { state: 'on', attributes: { name: 'pppoe-out1', type: 'pppoe-out', running: true, comment: 'FPT PPPoE' } },
  };
  const m = discover(st, {});
  assert.equal(m.wan.name, 'pppoe-out1');
  assert.equal(m.wan.running, true);
  assert.deepEqual(m.ports.map((p) => p.id), ['ether3']);
  assert.equal(m.ports[0].running, false);
});

test('tự vẽ bộ phát ZTE: có cảm biến clients và khai zte_port thì thêm bộ phát; không khai hoặc đã khai tay thì không tự thêm', () => {
  const cam = 'sensor.zte_router_172_16_10_24_connected_devices';
  const st = { [cam]: { state: '1', attributes: { clients: [{ mac: '02:00:00:00:00:08', band: '5G', rssi: -65, mode: '802.11ac' }] } } };
  const cs = [may('Điện thoại', '02:00:00:00:00:08', '192.168.88.48')];
  const c1 = autoCauHinh(st, { zte_port: 'ether2' });
  assert.deepEqual(c1.access_points, [{ name: 'ZTE WiFi', port: 'ether2', clients_sensor: cam }]);
  const kq = phanNhom(cs, c1, {}, st);
  assert.equal(kq.nhom.find((g) => g.name === 'ZTE WiFi').clients.length, 1);
  assert.equal(autoCauHinh(st, {}).access_points, undefined, 'không khai zte_port thì không đoán');
  assert.equal(autoCauHinh(st, { zte_port: 'ether2', access_points: [{ name: 'Tay', port: 'ether2' }] }).access_points[0].name, 'Tay');
});

test('WireGuard: tổng byte (B) và handshake không bị coi là tốc độ; hiển thị ở mục riêng «VPN WireGuard»', () => {
  const st = {
    'sensor.mikrotik_router_wireguard_phone_rx': { state: '1047148576', attributes: { unit_of_measurement: 'B', friendly_name: 'Mikrotik router WireGuard Phone RX' } },
    'sensor.mikrotik_router_wireguard_phone_tx': { state: '177821448', attributes: { unit_of_measurement: 'B', friendly_name: 'Mikrotik router WireGuard Phone TX' } },
    'sensor.mikrotik_router_wireguard_phone_last_handshake': { state: '116', attributes: { unit_of_measurement: 's', friendly_name: 'Phone Last Handshake' } },
    'binary_sensor.mikrotik_router_wireguard_phone_connected': { state: 'on', attributes: { friendly_name: 'Phone Connected' } },
  };
  const m = discover(st, {});
  const ph = m.tunnels.find((h) => h.id === 'phone');
  assert.equal(ph.rxTong, 1047148576);
  assert.equal(ph.txTong, 177821448);
  assert.equal(ph.rx, 0, 'tổng byte không được coi là tốc độ');
  assert.equal(ph.batTay, 116);
  assert.equal(ph.connected, true);
  assert.equal(fmtBytes(ph.rxTong), '1.05 GB');
  assert.equal(fmtBytes(toBytes('512', 'kB')), '512 kB');
  const html = renderHtml(m, {}, { states: st, gan: {}, nodes: [] });
  assert.match(html, /VPN WireGuard/);
  assert.match(html, /bắt tay 116 s trước/);
  assert.match(html, /↓ 1\.05 GB ↑ 177\.8 MB/);
});

test('giao diện WireGuard (type wg, ví dụ mik-hk) không lẫn vào danh sách cổng nội bộ', () => {
  const st = {
    'switch.mikrotik_router_port_mik_hk_port': { state: 'on', attributes: { name: 'mik-hk', type: 'wg', running: true, comment: '' } },
    'switch.mikrotik_router_port_ether3_port': { state: 'off', attributes: { name: 'ether4', type: 'ether', running: false, comment: '' } },
  };
  const m = discover(st, {});
  assert.deepEqual(m.ports.map((p) => p.id), ['ether3']);
});

test('tự nhận tiền tố (không cần khai prefix): theo tên cổng switch của MikroTik Extended, kể cả tiền tố khác mặc định', () => {
  const st = {
    'switch.mikrotik_extended_port_ether3_port': { state: 'on', attributes: { name: 'ether3', type: 'ether', running: true, comment: '' } },
    'switch.mikrotik_extended_ppp_pppoe_out1_port': { state: 'on', attributes: { name: 'pppoe-out1', type: 'pppoe-out', running: true, comment: 'ISP' } },
  };
  assert.equal(detectPrefix(st), 'mikrotik_extended');
  const m = discover(st, {});
  assert.equal(m.wan.name, 'pppoe-out1');
  assert.deepEqual(m.ports.map((p) => p.id), ['ether3']);
  assert.equal(detectPrefix({}), null);
});

test('dòng máy hiện cổng MikroTik nó đang nối (ether3…), không hiện BridgeLAN', () => {
  const st = { 'device_tracker.may_a': { state: 'home', attributes: { attribution: 'Data provided by Mikrotik', mac: '02:00:00:00:00:21', ip: '192.168.3.21', host_name: 'May A', interface: 'ether3', source: 'arp' } },
    'device_tracker.may_b': { state: 'home', attributes: { attribution: 'Data provided by Mikrotik', mac: '02:00:00:00:00:22', ip: '192.168.3.22', host_name: 'May B', interface: 'BridgeLAN', source: 'dhcp' } } };
  const html = renderHtml(discover(st, {}), {}, { states: st, gan: {}, nodes: [] });
  assert.match(html, /title="MikroTik">ether3</);
  assert.doesNotMatch(html, /title="MikroTik">BridgeLAN</);
});

test('dòng máy WiFi hiện MAC, băng tần, RSSI, chế độ và tốc độ RX/TX từ bộ phát ZTE', () => {
  const cam = 'sensor.zte_router_172_16_10_24_connected_devices';
  const st = { [cam]: { state: '1', attributes: { clients: [{ mac: '02:00:00:00:00:31', band: '5G', rssi: -61, mode: '802.11ax', rx_rate: 1200000, tx_rate: 800000 }] } },
    'device_tracker.may_zte': { state: 'home', attributes: { attribution: 'Data provided by Mikrotik', mac: '02:00:00:00:00:31', ip: '172.16.10.31', host_name: 'May ZTE', interface: 'BridgeLAN', source: 'dhcp' } } };
  const cfg = { access_points: [{ name: 'ZTE WiFi', port: 'ether2', clients_sensor: cam }] };
  const m = discover(st, cfg);
  m.clients = [{ mac: '02:00:00:00:00:31', ip: '172.16.10.31', name: 'May ZTE', interface: 'BridgeLAN', source: 'dhcp', online: true }];
  const html = renderHtml(m, cfg, { states: st, gan: {}, nodes: [] });
  assert.match(html, /02:00:00:00:00:31/);
  assert.match(html, /5G · -61 dBm · 802\.11ax · ↓ 1\.20 Mbps ↑ 800 kbps/);
});

test('VPN: giao diện WireGuard không phải cổng; peer gắn vào đúng giao diện; ra Internet (0.0.0.0/0) tách với truy cập từ xa', () => {
  const st = {
    'switch.mikrotik_router_port_mik_hk_port': { state: 'on', attributes: { name: 'mik-hk', type: 'wg', running: true, comment: '' } },
    'switch.mikrotik_router_port_wg_home_port': { state: 'on', attributes: { name: 'wg-home', type: 'wg', running: true, comment: 'WireGuard Home' } },
    'switch.mikrotik_router_port_ether3_port': { state: 'off', attributes: { name: 'ether4', type: 'ether', running: false, comment: '' } },
    'sensor.mikrotik_router_port_mik_hk_rx': { state: '111', attributes: { unit_of_measurement: 'kB/s', type: 'wg', name: 'mik-hk' } },
    'sensor.mikrotik_router_wireguard_surfshark_hk_rx': { state: '3083948872', attributes: { unit_of_measurement: 'B', interface: 'mik-hk', allowed_address: '0.0.0.0/0', friendly_name: 'Mikrotik router WireGuard surfshark HK RX' } },
    'binary_sensor.mikrotik_router_wireguard_surfshark_hk_connected': { state: 'on', attributes: { interface: 'mik-hk', allowed_address: '0.0.0.0/0', friendly_name: 'surfshark HK Connected' } },
    'sensor.mikrotik_router_wireguard_phone_rx': { state: '1047148576', attributes: { unit_of_measurement: 'B', interface: 'wg-home', allowed_address: '192.16.0.2/32', friendly_name: 'Mikrotik router WireGuard Phone RX' } },
    'binary_sensor.mikrotik_router_wireguard_phone_connected': { state: 'on', attributes: { interface: 'wg-home', allowed_address: '192.16.0.2/32', friendly_name: 'Phone Connected' } },
  };
  const m = discover(st, {});
  assert.deepEqual(m.ports.map((p) => p.id), ['ether3'], 'giao diện WireGuard không vào danh sách cổng');
  assert.deepEqual(m.vpn.ifaces.map((g) => g.id).sort(), ['mik_hk', 'wg_home']);
  const html = renderHtml(m, {}, { states: st, gan: {}, nodes: [] });
  assert.match(html, /vpn-khoi ra/);
  assert.match(html, /vpn-khoi vao/);
  assert.match(html, /đi ra Internet/);
  assert.match(html, /truy cập từ xa/);
  const raKhoi = html.slice(html.indexOf('vpn-khoi ra'), html.indexOf('vpn-khoi vao'));
  assert.match(raKhoi, /surfshark HK/, 'surfshark nằm trong khối đi ra Internet');
});

test('trình sửa: đặt/xoá khoá, thêm/sửa/xoá mục switch và bộ phát; không sửa đối tượng gốc, rỗng thì bỏ khoá', () => {
  const goc = { title: 'A' };
  assert.deepEqual(capNhatCauHinh(goc, 'zte_port', 'ether2'), { title: 'A', zte_port: 'ether2' });
  assert.deepEqual(capNhatCauHinh({ title: 'A', zte_port: 'ether2' }, 'zte_port', ''), { title: 'A' });
  assert.deepEqual(goc, { title: 'A' }, 'đối tượng gốc không đổi');
  let c = themMuc({}, 'switches', { name: 'Switch 1', port: 'ether3' });
  c = themMuc(c, 'switches', { name: 'Switch 2', port: '' });
  assert.equal(c.switches.length, 2);
  c = suaMuc(c, 'switches', 1, 'port', 'ether4');
  assert.equal(c.switches[1].port, 'ether4');
  c = suaMuc(c, 'switches', 1, 'port', '');
  assert.equal('port' in c.switches[1], false, 'trường rỗng bị bỏ');
  c = xoaMuc(c, 'switches', 0);
  assert.equal(c.switches.length, 1);
  c = xoaMuc(c, 'switches', 0);
  assert.equal('switches' in c, false, 'danh sách rỗng thì bỏ khoá');
  assert.equal(suaMuc({}, 'access_points', 3, 'name', 'x').access_points, undefined, 'sửa mục không tồn tại không làm hỏng');
});

test('chỉ hiện thiết bị đang kết nối: máy ngắt và VPN peer ngắt không xuất hiện trên card', () => {
  const st = {
    'device_tracker.may_on': { state: 'home', attributes: { attribution: 'Data provided by Mikrotik', mac: '02:00:00:00:00:41', ip: '192.168.3.41', host_name: 'May on', interface: 'ether2', source: 'arp' } },
    'device_tracker.may_off': { state: 'not_home', attributes: { attribution: 'Data provided by Mikrotik', mac: '02:00:00:00:00:42', ip: '192.168.3.42', host_name: 'May off', interface: 'ether2', source: 'arp' } },
    'binary_sensor.mikrotik_router_wireguard_laptop_connected': { state: 'off', attributes: { interface: 'wg-home', allowed_address: '192.16.0.3/32', friendly_name: 'laptop Connected' } },
    'binary_sensor.mikrotik_router_wireguard_phone_connected': { state: 'on', attributes: { interface: 'wg-home', allowed_address: '192.16.0.2/32', friendly_name: 'Phone Connected' } },
  };
  const m = discover(st, {});
  assert.deepEqual(m.clients.map((c) => c.name), ['May on']);
  assert.deepEqual(m.tunnels.map((h) => h.id), ['phone']);
  const html = renderHtml(m, {}, { states: st, gan: {}, nodes: [] });
  assert.doesNotMatch(html, /May off/);
  assert.doesNotMatch(html, /laptop/);
});

test('cổng có data-name là tên RouterOS (ether2 của thực thể ether1), để cấu hình theo tên RouterOS không lẫn với thực thể khác', () => {
  const st = {
    'switch.mikrotik_router_port_ether1_port': { state: 'on', attributes: { name: 'ether2', type: 'ether', running: true, comment: '' } },
    'switch.mikrotik_router_port_ether2_port': { state: 'on', attributes: { name: 'ether3', type: 'ether', running: true, comment: '' } },
  };
  const html = renderHtml(discover(st, {}), {}, { states: st, gan: {}, nodes: [] });
  assert.match(html, /data-name="ether2"/);
  assert.match(html, /data-name="ether3"/);
});



test('hộp MikroTik: khối WAN và khối Bridge LAN xếp chồng; trong Bridge LAN có từng cổng ether; WAN không nằm trong bridge mặc định', () => {
  const st = {
    'switch.mikrotik_router_ppp_pppoe_out1_port': { state: 'on', attributes: { name: 'pppoe-out1', type: 'pppoe-out', running: true, comment: 'FPT PPPoE', actual_mtu: 1492, link_downs: 0 } },
    'sensor.mikrotik_router_ppp_pppoe_out1_ip_address': { state: '1.52.139.243', attributes: {} },
    'switch.mikrotik_router_port_ether1_port': { state: 'on', attributes: { name: 'ether2', type: 'ether', running: true, status: 'link-ok', actual_mtu: 1500, link_downs: 0 } },
    'switch.mikrotik_router_port_ether2_port': { state: 'on', attributes: { name: 'ether3', type: 'ether', running: true, status: 'link-ok', actual_mtu: 1500, link_downs: 0 } },
    'switch.mikrotik_router_port_ether4_port': { state: 'on', attributes: { name: 'WAN-ETHER1', type: 'ether', running: true, status: 'link-ok', actual_mtu: 1500, link_downs: 0 } },
  };
  const m = discover(st, {});
  const html = renderHtml(m, {}, { states: st, gan: {}, nodes: [] });
  assert.match(html, /wan-hop/);
  assert.match(html, /wan-hop/);
  assert.match(html, /BRIDGE LAN/);
  assert.match(html, /data-port="ether2"[^>]*checked/);
  assert.match(html, /data-port="ether3"[^>]*checked/);
  assert.doesNotMatch(html, /data-port="WAN-ETHER1"[^>]*checked/, 'WAN không nằm trong bridge mặc định');
  assert.doesNotMatch(html, /rtab/, 'không còn tab lồng');
  const boChon = renderHtml(m, {}, { bridge: ['ether2'], states: st, gan: {}, nodes: [] });
  assert.match(boChon, /data-port="ether2"[^>]*checked/);
  assert.doesNotMatch(boChon, /data-port="ether3"[^>]*checked/);
});

test('switch nối vào switch khác (khai switch: <tên>); khai vòng thì bỏ qua, không treo', () => {
  const nut = dungNut({ switches: [{ name: 'SW1', port: 'ether2' }, { name: 'SW1b', switch: 'SW1' }] }, []);
  const sw1b = nut.find((n) => n.name === 'SW1b');
  assert.equal(sw1b.parent, 'sw-0', 'SW1b nối dưới SW1');
  assert.equal(sw1b.port, '');
  const vong = dungNut({ switches: [{ name: 'A', switch: 'B' }, { name: 'B', switch: 'A' }] }, []);
  const a = vong.find((n) => n.name === 'A'); const b = vong.find((n) => n.name === 'B');
  assert.ok(!(a.parent === b.key && b.parent === a.key), 'không tạo vòng A↔B');
});

test('Proxmox: một nguồn duy nhất; máy có MAC BC:24:11 thành hộp con của Proxmox; host gán theo IP', () => {
  const may = [
    { mac: 'bc:24:11:69:c8:47', name: 'Adguard home', ip: '172.16.10.10', online: true },
    { mac: 'bc:24:11:aa:bb:cc', name: 'Frigate', ip: '172.16.10.11', online: true },
    { mac: '02:00:00:00:00:99', name: 'May la', ip: '172.16.10.99', online: true },
  ];
  const nut = dungNut({ switches: [{ name: 'SW1', port: 'ether2' }], proxmox: { name: 'Proxmox', ip: '172.16.10.5', switch: 'SW1' } }, [], may);
  const pm = nut.find((n) => n.key === 'pm');
  assert.equal(pm.parent, 'sw-0', 'Proxmox nối dưới SW1');
  const guests = nut.filter((n) => n.guest);
  assert.deepEqual(guests.map((g) => g.parent), ['pm', 'pm'], 'LXC/VM là con của Proxmox');
  assert.ok(!guests.some((g) => g.macs.includes('02:00:00:00:00:99')), 'máy không BC:24:11 không thành LXC/VM');
  const { nut: ds } = phanNhom(may, { switches: [{ name: 'SW1', port: 'ether2' }], proxmox: { name: 'Proxmox', ip: '172.16.10.5', switch: 'SW1' } }, {}, {}, []);
  assert.ok(ds.find((n) => n.key === 'pm'));
});
