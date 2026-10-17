import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esc, toBps, fmtRate, fmtUptime, discover, phanNhom, macRiengTu, renderHtml } from '../mikrotik-topo-lan-card.js';

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
  assert.deepEqual(m.ports.map((p) => p.id).filter((i) => i.startsWith('ether')).sort(), ['ether1', 'ether2', 'ether3', 'ether4']);
  assert.ok(m.bridges.some((b) => b.id === 'bridgelan'));
  assert.ok(m.tunnels.length >= 3);
  assert.equal(m.clients.length, 56);
  assert.equal(typeof m.core.cpu, 'number');
  const e1 = m.ports.find((p) => p.id === 'ether1');
  assert.ok(Math.abs(e1.rx - Number(states['sensor.mikrotik_router_port_ether1_rx'].state) * 8000) < 1, 'ether1 rx phải đổi từ kB/s');
});

test('tiền tố sai → không thấy cổng/WAN; thiết bị (theo attribution) vẫn có; hoàn toàn trống → hiện lời nhắc, không ném lỗi', () => {
  const m = discover(states, { prefix: 'khong_co' });
  assert.equal(m.wan, null); assert.equal(m.ports.length, 0); assert.equal(m.tunnels.length, 0);
  assert.equal(m.clients.length, 56, 'thiết bị nhận theo attribution MikroTik, không theo tiền tố');
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
