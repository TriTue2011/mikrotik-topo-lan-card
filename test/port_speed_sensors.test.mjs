import test from 'node:test';
import assert from 'node:assert/strict';
import { discover } from '../mikrotik-topo-lan-card.js';

const base = {
  'switch.mikrotik_router_port_ether2_port': { state: 'on', attributes: { name: 'ether2', running: true } },
  'sensor.mikrotik_router_port_ether2_rx': { state: '10', attributes: { unit_of_measurement: 'kB/s' } },
  'sensor.mikrotik_router_port_ether2_tx': { state: '20', attributes: { unit_of_measurement: 'kB/s' } },
  'switch.mikrotik_router_bridge_bridgelan_port': { state: 'on', attributes: { name: 'BridgeLAN', running: true } },
};
const cfg = (extra) => ({ prefix: 'mikrotik_router', port_speed_sensors: { ether2: { rx: 'sensor.sw1_rx', tx: 'sensor.sw1_tx' } }, ...extra });
const cong = (m, id) => m.ports.find((p) => p.id === id);

test('cảm biến chỉ định ghi đè tốc độ cổng (Mbit/s → bit/s)', () => {
  const st = { ...base, 'sensor.sw1_rx': { state: '5.5', attributes: { unit_of_measurement: 'Mbit/s' } }, 'sensor.sw1_tx': { state: '1', attributes: { unit_of_measurement: 'Mbit/s' } } };
  const e2 = cong(discover(st, cfg()), 'ether2');
  assert.equal(e2.rx, 5.5e6);
  assert.equal(e2.tx, 1e6);
});

test('cảm biến unavailable hoặc chưa có số thì giữ giá trị của tích hợp MikroTik', () => {
  const st = { ...base, 'sensor.sw1_rx': { state: 'unavailable', attributes: { unit_of_measurement: 'Mbit/s' } }, 'sensor.sw1_tx': { state: 'unknown', attributes: {} } };
  const e2 = cong(discover(st, cfg()), 'ether2');
  assert.equal(e2.rx, 10 * 8e3);
  assert.equal(e2.tx, 20 * 8e3);
});

test('đơn vị lạ không bị bịa thành 0: giữ giá trị cũ', () => {
  const st = { ...base, 'sensor.sw1_rx': { state: '5', attributes: { unit_of_measurement: 'bit' } }, 'sensor.sw1_tx': { state: '5', attributes: { unit_of_measurement: '' } } };
  const e2 = cong(discover(st, cfg()), 'ether2');
  assert.equal(e2.rx, 10 * 8e3);
  assert.equal(e2.tx, 20 * 8e3);
});

test('số 0 hợp lệ vẫn ghi đè (cổng rảnh)', () => {
  const st = { ...base, 'sensor.sw1_rx': { state: '0', attributes: { unit_of_measurement: 'Mbit/s' } }, 'sensor.sw1_tx': { state: '0', attributes: { unit_of_measurement: 'Mbit/s' } } };
  const e2 = cong(discover(st, cfg()), 'ether2');
  assert.equal(e2.rx, 0);
  assert.equal(e2.tx, 0);
});

test('khoá cổng không phân biệt hoa thường và cổng không có thì bỏ qua', () => {
  const st = { ...base, 'sensor.x': { state: '3', attributes: { unit_of_measurement: 'Mbit/s' } } };
  const m = discover(st, { prefix: 'mikrotik_router', port_speed_sensors: { ETHER2: { rx: 'sensor.x' }, khongco: { rx: 'sensor.x' } } });
  assert.equal(cong(m, 'ether2').rx, 3e6);
});
