import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { autoCauHinh, discover, renderHtml } from '../mikrotik-topo-lan-card.js';

const CAY = {
  nodes: [
    { id: 'router', kind: 'router', name: 'MikroTik', parent: null },
    { id: 'ether2', kind: 'port', name: 'ether2', parent: 'BridgeLAN' },
    { id: 'ether3', kind: 'port', name: 'ether3', parent: 'BridgeLAN' },
    { id: 'zte', kind: 'ap', name: 'ZTE:ZXHN E2633', parent: 'ether2', ip: '172.16.10.24' }
  ],
  clients: [
    { mac: 'AA:00:00:00:00:01', ip: '172.16.10.50', name: 'Cam', parent: 'ether2', wifi: false },
    { mac: 'AA:00:00:00:00:02', ip: '172.16.10.60', name: 'Adguard', parent: 'ether3', wifi: false },
    { mac: 'AA:00:00:00:00:11', ip: '172.16.10.31', name: 'Honor', parent: 'zte', wifi: true, band: '5G', rssi: -58, mode: '802.11ax' }
  ]
};
const states = {
  'sensor.mik_cay_thiet_bi': { state: '3', attributes: CAY },
  'sensor.mik_port_ether2_rx': { state: '1', attributes: { unit_of_measurement: 'Mbit/s' } },
  'sensor.mik_port_ether3_rx': { state: '1', attributes: { unit_of_measurement: 'Mbit/s' } }
};
// Tên SW chỉ đặt cho hộp bên phải (switches), hộp router giữ tên theo MikroTik.
const cfg = { prefix: 'mik', topo_sensor: 'sensor.mik_cay_thiet_bi', switches: [{ name: 'SW1', port: 'ether2' }, { name: 'SW2', port: 'ether3' }] };

test('nhóm dùng để vẽ đường nối chứa cả máy lấy từ cây thiết bị (không chỉ máy từ thực thể theo dõi)', () => {
  const cfgHl = autoCauHinh(states, cfg);
  const model = discover(states, cfgHl);
  const ui = { states };
  renderHtml(model, cfgHl, ui);
  assert.ok(ui.nhomVe, 'renderHtml phải ghi lại nhóm cho bước vẽ đường');
  const theoHop = Object.fromEntries(ui.nhomVe.nhom.filter((g) => g.node).map((g) => [g.node.name, g.clients.map((c) => c.name).sort()]));
  assert.deepEqual(theoHop.SW1, ['Cam']);
  assert.deepEqual(theoHop.SW2, ['Adguard']);
  assert.deepEqual(theoHop['ZTE:ZXHN E2633'], ['Honor']);
  const ap = ui.nhomVe.nut.find((n) => n.kind === 'ap');
  const sw1 = ui.nhomVe.nut.find((n) => n.name === 'SW1');
  assert.equal(ap.parent, sw1.key);                      // ZTE nối vào hộp SW1 (cổng ether2)
});

test('hàm vẽ đường dùng đúng nhóm của bước dựng giao diện, không tự ghép lại từ cấu hình gốc', () => {
  const nguon = fs.readFileSync(new URL('../mikrotik-topo-lan-card.js', import.meta.url), 'utf8');
  const ham = nguon.slice(nguon.indexOf('_veDuong() {'), nguon.indexOf('_veDuong() {') + 4000);
  assert.ok(ham.includes('this._ui.nhomVe'));
  assert.ok(!ham.includes('phanNhom('), '_veDuong không được tự gọi phanNhom với cấu hình khác');
  assert.ok(nguon.includes("'nd nd0'"), 'đường không có lưu lượng vẫn là nét đứt');
});
