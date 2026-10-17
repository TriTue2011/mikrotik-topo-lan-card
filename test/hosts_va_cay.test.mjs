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

test('mỗi LXC và máy host chỉ hiện MỘT lần (không trùng giữa hộp Proxmox và nhóm theo cổng)', () => {
  const c = autoCauHinh(states, cfg({ hosts: [{ name: 'Proxmox', ip: '192.168.88.100', switch: 'SW2', guest_mac_prefix: 'bc:24:11' }] }));
  const ui = { states };
  const html = renderHtml(discover(states, c), c, ui);
  for (const ten of ['Proxmox', 'Adguard', 'lxc-chatgpt', 'TV box']) {
    assert.equal((html.match(new RegExp(ten, 'g')) || []).length, 1, `«${ten}» phải hiện đúng một lần`);
  }
  const sw2 = ui.nhomVe.nhom.find((g) => g.node && g.node.name === 'SW2');
  assert.deepEqual(sw2.clients.map((x) => x.name), ['TV box'], 'nhóm theo cổng chỉ còn máy thường');
  // Nút khách mang bản ĐẦY ĐỦ của thiết bị (có IP), không phải bản rỗng dựng từ MAC.
  const adguard = ui.nhomVe.nut.find((n) => n.guest && n.name === 'Adguard');
  assert.ok(adguard, 'có nút khách Adguard');
  const g = ui.nhomVe.nhom.find((x) => x.node === adguard);
  assert.equal(g.clients.length, 1);
  assert.equal(g.clients[0].ip, '192.168.88.10');
});

test('hộp host cùng kiểu hộp MikroTik: tên + số máy ở dòng đầu, thông tin máy host ở dòng phụ, LXC bên trong', async () => {
  const c = autoCauHinh(states, cfg({ hosts: [{ name: 'Proxmox', ip: '192.168.88.100', switch: 'SW2', guest_mac_prefix: 'bc:24:11' }] }));
  const html = renderHtml(discover(states, c), c, { states });
  const hop = html.slice(html.indexOf('nut-host'));
  assert.match(hop, /<div class="nt">[\s\S]*?<span class="ten-hop">Proxmox \(2\)<\/span>/, 'dòng đầu: tên và số LXC');
  assert.match(hop, /<div class="phu host-tt">[\s\S]*?192\.168\.88\.100/, 'IP của chính máy host nằm ở dòng phụ trong hộp');
  assert.ok(hop.indexOf('Adguard') > hop.indexOf('host-tt'), 'các LXC nằm sau thông tin host');
});

test('điện thoại: con thụt vào so với cha, kèm đường dẫn; con đứng sau cha trong thứ tự hiển thị', async () => {
  const { CSS } = await import('../mikrotik-topo-lan-card.js');
  const mq = CSS.slice(CSS.indexOf('@media (max-width:820px){.cay{grid-template-columns:minmax(0,1fr)}'));
  assert.match(mq, /\.tree-con\{[^}]*margin-left:12px[^}]*padding-left:10px[^}]*border-left:2px dashed/);
  const c = autoCauHinh(states, cfg());
  const html = renderHtml(discover(states, c), c, { states });
  // Mỗi khối con (tree-con) đứng NGAY SAU hộp cha của nó: vị trí đầu tiên của «SW1»/«SW2» đứng trước khối con kế tiếp.
  for (const cha of ['SW1', 'SW2']) {
    const viTriCha = html.indexOf(`>${cha} (`);
    assert.ok(viTriCha >= 0, `có hộp ${cha}`);
    assert.ok(html.indexOf('class="tree-con"', viTriCha) > viTriCha, `khối con của ${cha} đứng sau ${cha}`);
  }
});
