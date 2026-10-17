import test from 'node:test';
import assert from 'node:assert/strict';
import { autoCauHinh, discover, renderHtml, tinhDoiVe } from '../mikrotik-topo-lan-card.js';

const CAY = {
  nodes: [
    { id: 'router', kind: 'router', name: 'MikroTik', parent: null },
    { id: 'ether2', kind: 'port', name: 'ether2', parent: 'router' }
  ],
  clients: [
    { mac: 'AA:00:00:00:00:01', ip: '172.16.10.50', name: 'Cam', parent: 'ether2', wifi: false },
    { mac: 'AA:00:00:00:00:02', ip: '172.16.10.51', name: 'Tivi', parent: 'ether2', wifi: false }
  ]
};
const mu = { unit_of_measurement: 'Mbit/s' };
const states = {
  'sensor.mik_cay_thiet_bi': { state: '2', attributes: CAY },
  'sensor.mik_port_wan-ether1_rx': { state: '1.5', attributes: mu }, 'sensor.mik_port_wan-ether1_tx': { state: '0.5', attributes: mu },
  'sensor.mik_port_ether2_rx': { state: '1', attributes: mu }, 'sensor.mik_port_ether2_tx': { state: '1', attributes: mu }
};
const cfg = { prefix: 'mik', topo_sensor: 'sensor.mik_cay_thiet_bi' };
const html = () => { const c = autoCauHinh(states, cfg); return renderHtml(discover(states, c), c, { states }); };

test('đầu card gọn: không có chip tốc độ tổng, không ô tìm kiếm, không tiêu đề «Thiết bị (n)»', () => {
  const h = html();
  assert.ok(!/class="tim"/.test(h), 'đã bỏ ô tìm kiếm');
  assert.ok(!/<div class="chip"><b>[↓↑]/.test(h), 'đã bỏ chip tốc độ tổng (hộp MikroTik đã có tốc độ WAN)');
  assert.ok(!/tieu-nhom">Thiết bị \(/.test(h), 'đã bỏ dòng «Thiết bị (n)»');
});

test('số lượng thiết bị nằm cạnh chữ MikroTik trong hộp', () => {
  assert.match(html(), /<span>MikroTik<\/span> <span class="phu">\(2\)<\/span>/);
});

test('tinhDoiVe: nhịp vẽ tối thiểu 250 ms, mặc định 1 giây', () => {
  assert.equal(tinhDoiVe(5000, 0), 0);                 // chưa vẽ lần nào: vẽ ngay
  assert.equal(tinhDoiVe(5000, 4600), 600);            // mới vẽ 400 ms trước: chờ nốt 600 ms
  assert.equal(tinhDoiVe(5000, 3900), 0);              // đã quá 1 giây
  assert.equal(tinhDoiVe(5000, 4900, 50), 150);        // refresh_ms nhỏ hơn 250 bị nâng lên 250
  assert.equal(tinhDoiVe(5000, 4000, 3000), 2000);
});

test('card ghi phiên bản vào console khi nạp (để kiểm bản đang chạy)', async () => {
  const fs = await import('node:fs');
  const nguon = fs.readFileSync(new URL('../mikrotik-topo-lan-card.js', import.meta.url), 'utf8');
  assert.ok(/console\.info\(`%c MIKROTIK-TOPO-LAN-CARD %c v\$\{VERSION\}/.test(nguon));
});
