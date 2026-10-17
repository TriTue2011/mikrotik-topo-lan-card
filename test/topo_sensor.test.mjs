import test from 'node:test';
import assert from 'node:assert/strict';
import { layCay, autoCauHinh, layNguon, thietBiNguonThieu } from '../mikrotik-topo-lan-card.js';

const CAY = {
  nodes: [
    { id: 'router', kind: 'router', name: 'MikroTik', parent: null },
    { id: 'ether2', kind: 'port', name: 'ether2', parent: 'router' },
    { id: 'ether4', kind: 'port', name: 'ether4', parent: 'router' },
    { id: 'lo2', kind: 'port', name: 'khong-co-may', parent: 'router' },
    { id: 'zte', kind: 'ap', name: 'ZTE:ZXHN E2633', parent: 'ether4', ip: '172.16.10.24' }
  ],
  clients: [
    { mac: 'AA:00:00:00:00:01', ip: '172.16.10.50', name: 'Máy in', parent: 'ether2', wifi: false },
    { mac: 'AA:00:00:00:00:03', ip: '172.16.10.60', name: '', parent: 'ether4', wifi: false },
    { mac: 'AA:00:00:00:00:11', ip: '172.16.10.31', name: 'Honor', parent: 'zte', wifi: true, band: '5G', rssi: -58, mode: '802.11ax' },
    { mac: 'AA:00:00:00:00:12', ip: '172.16.10.32', name: 'Galaxy', parent: 'zte', wifi: true, band: '2.4G', rssi: -70, mode: '802.11n' },
    { mac: 'AA:00:00:00:00:77', ip: '172.16.10.77', name: 'Lạ', parent: 'router', wifi: false }
  ]
};
const states = { 'sensor.mik_cay_thiet_bi': { state: '5', attributes: CAY } };
const cfg0 = { topo_sensor: 'sensor.mik_cay_thiet_bi', port_names: { ether4: 'SW2' } };

test('layCay đọc nodes/clients; thiếu cảm biến hoặc thuộc tính hỏng thì null', () => {
  assert.equal(layCay(cfg0, states).nodes.length, 5);
  assert.equal(layCay({}, states), null);
  assert.equal(layCay(cfg0, {}), null);
  assert.equal(layCay(cfg0, { 'sensor.mik_cay_thiet_bi': { attributes: { nodes: 'x' } } }), null);
});

test('autoCauHinh tự dựng switch cho cổng có máy và bộ phát nối vào cổng/switch cha', () => {
  const c = autoCauHinh(states, cfg0);
  const sw = Object.fromEntries(c.switches.map((w) => [w.port, w.name]));
  assert.equal(sw.ether2, 'ether2');
  assert.equal(sw.ether4, 'SW2');                       // tên lấy từ port_names
  assert.equal(sw.lo2, undefined);                      // cổng không có máy không thành hộp
  const zte = c.access_points.find((a) => a.name === 'ZTE:ZXHN E2633');
  assert.equal(zte.switch, 'SW2');                      // ZTE cắm vào cổng ether4 → hộp SW2
  assert.deepEqual(zte.ips, ['172.16.10.24']);
});

test('hộp người dùng đã khai được giữ nguyên, không tạo trùng', () => {
  const c = autoCauHinh(states, { ...cfg0, switches: [{ name: 'Switch phòng khách', port: 'ether2' }], access_points: [{ name: 'ZTE WiFi', ips: ['172.16.10.24'], switch: 'Switch phòng khách' }] });
  assert.equal(c.switches.filter((w) => w.port === 'ether2').length, 1);
  assert.equal(c.switches.find((w) => w.port === 'ether2').name, 'Switch phòng khách');
  assert.equal(c.access_points.length, 1);              // trùng IP với nút ZTE → không thêm bộ phát thứ hai
});

test('layNguon đặt từng máy vào hộp của cha nó, kèm thông tin WiFi cho con của ZTE', () => {
  const c = autoCauHinh(states, cfg0);
  const g = Object.fromEntries(layNguon(c, states).filter((x) => x.node).map((x) => [x.node, x.devices]));
  assert.deepEqual(g.ether2.map((d) => d.mac), ['aa:00:00:00:00:01']);
  assert.deepEqual(g.SW2.map((d) => d.mac), ['aa:00:00:00:00:03']);
  const wifi = g['ZTE:ZXHN E2633'];
  assert.equal(wifi.length, 2);
  const honor = wifi.find((d) => d.name === 'Honor');
  assert.equal(honor.band, '5G');
  assert.equal(honor.rssi, -58);
  assert.equal(honor.mode, '802.11ax');
  assert.ok(!Object.values(g).flat().some((d) => d.mac === 'aa:00:00:00:00:77'));   // cha là router: không ép vào hộp nào
});

test('tốc độ từng máy (rx_bps/tx_bps bit/giây) từ cây vào thông tin thiết bị', () => {
  const cay = { nodes: CAY.nodes, clients: [{ mac: 'AA:00:00:00:00:01', ip: '172.16.10.50', name: 'Máy in', parent: 'ether2', rx_bps: 5500000, tx_bps: 250000 }] };
  const st = { 'sensor.mik_cay_thiet_bi': { state: '1', attributes: cay } };
  const d = layNguon(autoCauHinh(st, cfg0), st).find((g) => g.node === 'ether2').devices[0];
  assert.equal(d.rxRate, 5500000);
  assert.equal(d.txRate, 250000);
});

test('máy chưa có số đo (rx_bps null) thì không bịa tốc độ', () => {
  const d = layNguon(autoCauHinh(states, cfg0), states).find((g) => g.node === 'ether2').devices[0];
  assert.ok(d.rxRate == null || d.rxRate === 0 || Number.isNaN(d.rxRate) === false);
  assert.ok(!(d.rxRate > 0));
});

test('máy mới trong cây tự có mặt trong hộp (thietBiNguonThieu), không cần device_tracker hay khai tay', () => {
  const c = autoCauHinh(states, cfg0);
  const them = thietBiNguonThieu(c, states, []);
  const macs = them.map((d) => d.mac).sort();
  assert.deepEqual(macs, ['aa:00:00:00:00:01', 'aa:00:00:00:00:03', 'aa:00:00:00:00:11', 'aa:00:00:00:00:12']);
  const moi = { 'sensor.mik_cay_thiet_bi': { state: '6', attributes: { ...CAY, clients: [...CAY.clients, { mac: 'AA:00:00:00:00:55', ip: '172.16.10.55', name: 'Mới', parent: 'ether2' }] } } };
  const them2 = thietBiNguonThieu(autoCauHinh(moi, cfg0), moi, []);
  assert.ok(them2.some((d) => d.mac === 'aa:00:00:00:00:55'));
});

test('không đặt topo_sensor thì cấu hình và nguồn không đổi', () => {
  const cfg = { switches: [{ name: 'SW1', port: 'ether2' }] };
  assert.deepEqual(autoCauHinh(states, cfg), cfg);
  assert.deepEqual(layNguon(cfg, states), []);
});
