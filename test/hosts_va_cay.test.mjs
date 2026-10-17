import test from 'node:test';
import assert from 'node:assert/strict';
import { autoCauHinh, discover, renderHtml } from '../mikrotik-topo-lan-card.js';

// Hộp Proxmox (khai bằng `hosts`) vẫn dựng được khi dùng topo_sensor: các LXC/VM có tiền tố MAC `guest_mac_prefix` nằm TRONG hộp.
const CAY = {
  nodes: [
    { id: 'router', kind: 'router', name: 'MikroTik', parent: null },
    { id: 'ether2', kind: 'port', name: 'ether2', parent: 'router' },
    { id: 'ether3', kind: 'port', name: 'ether3', parent: 'router' }
  ],
  clients: [
    { mac: 'AA:00:00:00:00:01', ip: '192.168.88.50', name: 'Cam', parent: 'ether2', wifi: false },
    { mac: 'AA:00:00:00:00:77', ip: '192.168.88.100', name: 'pve', parent: 'ether3', wifi: false },
    { mac: 'BC:24:11:69:C8:47', ip: '192.168.88.10', name: 'Adguard', parent: 'ether3', wifi: false },
    { mac: 'BC:24:11:59:36:C2', ip: '192.168.88.38', name: 'lxc-chatgpt', parent: 'ether3', wifi: false },
    { mac: 'AA:00:00:00:00:09', ip: '192.168.88.28', name: 'TV box', parent: 'ether3', wifi: false }
  ]
};
const states = { 'sensor.mik_cay_thiet_bi': { state: '5', attributes: CAY } };
const cfg = (them = {}) => ({ prefix: 'mik', topo_sensor: 'sensor.mik_cay_thiet_bi', switches: [{ name: 'SW1', port: 'ether2' }, { name: 'SW2', port: 'ether3' }], ...them });
const ve = (c) => { const h = autoCauHinh(states, c); const ui = { states }; renderHtml(discover(states, h), h, ui); return ui.nhomVe; };

test('không khai hosts thì không có hộp Proxmox (đây là lý do hộp «mất» khi dùng cấu hình tối thiểu)', () => {
  const { nut } = ve(cfg());
  assert.ok(!nut.some((n) => n.name === 'Proxmox'));
});

test('khai hosts + guest_mac_prefix cùng topo_sensor: hộp Proxmox quay lại, LXC nằm trong hộp', () => {
  const { nut, nhom } = ve(cfg({ hosts: [{ name: 'Proxmox', ip: '192.168.88.100', switch: 'SW2', guest_mac_prefix: 'bc:24:11' }] }));
  const hop = nut.find((n) => n.name === 'Proxmox');
  assert.ok(hop && hop.box, 'có hộp Proxmox');
  const khach = nut.filter((n) => n.guest && n.host === hop.key).map((n) => n.name).sort();
  assert.deepEqual(khach, ['Adguard', 'lxc-chatgpt']);
  const sw2 = nhom.find((g) => g.node && g.node.name === 'SW2');
  assert.ok(sw2.clients.some((c) => c.name === 'TV box'), 'máy thường vẫn ở SW2');
});
