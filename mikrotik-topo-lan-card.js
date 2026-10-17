/*!
 * MikroTik Topo LAN Card — sơ đồ mạng LAN của router MikroTik trong Home Assistant.
 * Đọc thẳng thực thể của tích hợp MikroTik (Mikrotik Router / MikroTik Extended): KHÔNG cần SNMP.
 * Ý tưởng sơ đồ cây lấy cảm hứng từ doanlong1412/snmp-topo-lan-card (MIT); mã viết lại cho MikroTik.
 * Giấy phép: MIT.
 */

export const VERSION = '0.3.0';

// ───────────────────────── tiện ích thuần (kiểm thử được, không cần trình duyệt) ─────────────────────────

/** Thoát ký tự HTML. MỌI chuỗi từ mạng hoặc người dùng (tên máy, ghi chú cổng, tên nút) phải đi qua đây trước khi chèn vào HTML. */
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const DON_VI_BPS = {
  'bit/s': 1, 'bps': 1, 'kbit/s': 1e3, 'kbps': 1e3, 'mbit/s': 1e6, 'mbps': 1e6, 'gbit/s': 1e9, 'gbps': 1e9,
  'b/s': 8, 'kb/s': 8e3, 'mb/s': 8e6, 'gb/s': 8e9
};

/** Giá trị + đơn vị của HA → bit/giây. Đơn vị lạ hoặc số hỏng → 0 (không bịa). */
export function toBps(giaTri, donVi) {
  const n = Number(giaTri);
  if (!isFinite(n) || n < 0) return 0;
  const he = DON_VI_BPS[String(donVi || '').trim().toLowerCase()];
  return he ? n * he : 0;
}

const DON_VI_BYTE = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12 };

export function toBytes(giaTri, donVi) {
  const n = Number(giaTri);
  if (!isFinite(n) || n < 0) return 0;
  const he = DON_VI_BYTE[String(donVi || '').trim().toLowerCase()];
  return he ? n * he : 0;
}

export function fmtBytes(b) {
  if (!b || b < 1) return '0 B';
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB';
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
  if (b >= 1e3) return Math.round(b / 1e3) + ' kB';
  return Math.round(b) + ' B';
}

export function fmtRate(bps) {
  if (!bps || bps < 1) return '0';
  if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbps';
  if (bps >= 1e6) return (bps / 1e6).toFixed(bps >= 1e7 ? 1 : 2) + ' Mbps';
  if (bps >= 1e3) return Math.round(bps / 1e3) + ' kbps';
  return Math.round(bps) + ' bps';
}

export function fmtUptime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!isFinite(t)) return '';
  let giay = Math.max(0, Math.floor((now - t) / 1000));
  const ngay = Math.floor(giay / 86400); giay -= ngay * 86400;
  const gio = Math.floor(giay / 3600); giay -= gio * 3600;
  const phut = Math.floor(giay / 60);
  return ngay ? `${ngay}d ${gio}h` : gio ? `${gio}h ${phut}m` : `${phut}m`;
}

const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const on = (s) => !!s && String(s).toLowerCase() === 'on';
const slug = (s) => String(s || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');

/**
 * Khám phá thực thể MikroTik từ `states` (đối tượng {entity_id: {state, attributes}}).
 * Quy ước tên của tích hợp: sensor.<tiền_tố>_(port|bridge|ppp)_<id>_(rx|tx), binary_sensor.<tiền_tố>_…_connection,
 * sensor.<tiền_tố>_core_* và device_tracker.* có attribution «Mikrotik».
 */
/**
 * Tự nhận tiền tố từ tên thực thể cổng: switch.<tiền_tố>_port_<id>_port (MikroTik Extended).
 * Không thấy thì null; khi đó discover dùng tiền tố mặc định hoặc cfg.prefix.
 */
export function detectPrefix(states = {}) {
  for (const eid of Object.keys(states || {})) {
    const m = /^switch\.(.+?)_port_.+_port$/.exec(eid);
    if (m) return m[1];
  }
  return null;
}

export function discover(states, cfg = {}) {
  const tienTo = cfg.prefix || detectPrefix(states) || 'mikrotik_router';
  const P = reEsc(tienTo);
  const reLuuLuong = new RegExp(`^sensor\\.${P}_(port|bridge|ppp)_(.+)_(rx|tx)$`);
  const reWg = new RegExp(`^sensor\\.${P}_wireguard_(.+)_(rx|tx)$`);
  const reWgBatTay = new RegExp(`^sensor\\.${P}_wireguard_(.+)_last_handshake$`);
  const reKetNoi = new RegExp(`^binary_sensor\\.${P}_(port|bridge|ppp)_(.+)_connection$`);
  const reWgNoi = new RegExp(`^binary_sensor\\.${P}_wireguard_(.+)_connected$`);
  // MikroTik Extended: cổng và PPPoE là switch.<tiền_tố>_port_<id>_port và switch.<tiền_tố>_ppp_<id>_port.
  const reCongSwitch = new RegExp(`^switch\\.${P}_(port|ppp)_(.+)_port$`);
  const giaoDien = new Map();
  const duongHam = new Map();
  const lay = (loai, id) => {
    const k = `${loai}:${id}`;
    if (!giaoDien.has(k)) giaoDien.set(k, { key: k, id, kind: loai, name: id, comment: '', running: null, type: '', rx: 0, tx: 0 });
    return giaoDien.get(k);
  };
  const ham = (id) => {
    if (!duongHam.has(id)) duongHam.set(id, { id, name: id, connected: null, rx: 0, tx: 0, rxTong: 0, txTong: 0, batTay: null });
    return duongHam.get(id);
  };
  const may = [];
  for (const [eid, s] of Object.entries(states || {})) {
    if (!s) continue;
    const a = s.attributes || {};
    let m;
    if ((m = reLuuLuong.exec(eid))) {
      const gd = lay(m[1], m[2]);
      gd[m[3]] = toBps(s.state, a.unit_of_measurement);
      gd.name = a.name || gd.name; gd.comment = a.comment || gd.comment; gd.type = a.type || gd.type;
      if (typeof a.running === 'boolean') gd.running = a.running;
    } else if ((m = reCongSwitch.exec(eid))) {
      // Giao diện WireGuard (type wg) là đường hầm VPN: hiện ở mục VPN, không ở danh sách cổng.
      if (String(a.type || '').toLowerCase() !== 'wg') {
        const gd = lay(m[1], m[2]);
        gd.name = a.name || gd.name; gd.comment = a.comment || gd.comment; gd.type = a.type || gd.type;
        gd.running = typeof a.running === 'boolean' ? a.running : on(s.state);
      }
    } else if ((m = reKetNoi.exec(eid))) {
      lay(m[1], m[2]).running = on(s.state);
    } else if ((m = reWg.exec(eid))) {
      const h = ham(m[1]);
      const donVi = String(a.unit_of_measurement || '').trim();
      // HA báo lưu lượng WireGuard thường là tổng byte từ trước đến giờ (B), không phải tốc độ.
      if (/\/s$/i.test(donVi)) h[m[2]] = toBps(s.state, donVi);
      else h[m[2] + 'Tong'] = toBytes(s.state, donVi);
      h.name = (a.friendly_name || '').replace(/^.*WireGuard\s+/i, '').replace(/\s+(RX|TX)$/i, '') || h.name;
    } else if ((m = reWgBatTay.exec(eid))) {
      const giay = Number(s.state);
      ham(m[1]).batTay = isFinite(giay) && giay >= 0 ? giay : null;
    } else if ((m = reWgNoi.exec(eid))) {
      ham(m[1]).connected = on(s.state);
    } else if (eid.startsWith('device_tracker.') && /mikrotik/i.test(a.attribution || '')) {
      may.push({
        name: a.host_name || a.friendly_name || eid, ip: a.ip || '', mac: a.mac || '',
        interface: a.interface || '', online: s.state === 'home', source: a.source || ''
      });
    }
  }
  const loi = (hau) => (states || {})[`sensor.${tienTo}_core_${hau}`];
  const so = (s) => (s && isFinite(Number(s.state)) ? Number(s.state) : null);
  const capNhat = (states || {})[`update.${tienTo}_core_routeros_update`];
  const core = {
    cpu: so(loi('cpu_load')), ram: so(loi('memory_usage')), hdd: so(loi('hdd_usage')),
    uptime: loi('uptime') ? loi('uptime').state : '', wired: so(loi('wired_clients')), wireless: so(loi('wireless_clients')),
    version: capNhat && capNhat.attributes ? (capNhat.attributes.installed_version || '') : ''
  };
  const tatCa = [...giaoDien.values()];
  const wan = cfg.wan
    ? tatCa.find((g) => g.id === cfg.wan)
    : tatCa.find((g) => g.kind === 'ppp' && /pppoe|l2tp|pptp|sstp|ovpn/i.test(g.type || ''))
      || tatCa.find((g) => g.kind === 'port' && /wan/i.test(g.name || ''))
      || null;
  const an = new Set(cfg.hide_ports || []);
  const tenCong = cfg.port_names || {};
  const hienThi = (g) => ({ ...g, label: tenCong[g.id] || g.comment || g.name });
  // Cổng tên WAN thuộc đường ra Internet, không hiện như cổng nội bộ.
  const ports = tatCa.filter((g) => g.kind === 'port' && g !== wan && !an.has(g.id) && !/wan/i.test(g.name || '')).map(hienThi);
  const bridges = tatCa.filter((g) => g.kind === 'bridge' && !an.has(g.id)).map(hienThi);
  const pppKhac = tatCa.filter((g) => g.kind === 'ppp' && g !== wan && !an.has(g.id)).map(hienThi);
  return {
    core, wan: wan ? hienThi(wan) : null, ports, bridges, ppp: pppKhac,
    tunnels: [...duongHam.values()].filter((h) => !an.has(h.id)),
    clients: may.sort((x, y) => (y.online - x.online) || x.name.localeCompare(y.name))
  };
}

// ───────────────────────── nút trung gian (switch, bộ phát WiFi) và gán thiết bị ─────────────────────────

/** MAC «riêng tư» (bit 0x02 của byte đầu): điện thoại/máy bật địa chỉ ngẫu nhiên — dấu hiệu CẤU TRÚC (không phải danh sách tên) của máy dùng WiFi. */
/**
 * Tự vẽ bộ phát ZTE từ cảm biến số máy (thuộc tính clients) khi chưa khai bộ phát nào.
 * Cần khai `zte_port`: cổng MikroTik nơi ZTE cắm. Không khai thì không tự thêm (card không đoán cổng).
 */
export function autoCauHinh(states = {}, cfg = {}) {
  if (!cfg.zte_port || (cfg.access_points && cfg.access_points.length)) return cfg;
  const id = Object.keys(states || {}).find((e) => /^sensor\..+_connected_devices$/.test(e)
    && states[e] && states[e].attributes && Array.isArray(states[e].attributes.clients));
  if (!id) return cfg;
  return { ...cfg, access_points: [{ name: cfg.zte_name || 'ZTE WiFi', port: cfg.zte_port, clients_sensor: id }] };
}

export function macRiengTu(mac) {
  const m = /^([0-9a-f]{2})[:-]/i.exec(String(mac || ''));
  return !!m && (parseInt(m[1], 16) & 2) === 2;
}

const macChuan = (m) => String(m || '').toLowerCase().replace(/-/g, ':');

/** MAC của các máy sau một cổng, lấy từ thuộc tính của một cảm biến (xem tools/mikrotik_bridge_hosts.py): {cổng: [MAC…]}. Không có/hỏng → rỗng. */
export function macTuCamBien(sensorId, thuocTinh, states) {
  const cb = sensorId && states ? states[sensorId] : null;
  if (!cb || !cb.attributes || !thuocTinh) return [];
  const ds = cb.attributes[thuocTinh];
  return Array.isArray(ds) ? ds.filter((m) => typeof m === 'string') : [];
}

/**
 * Danh sách thiết bị WiFi do BỘ PHÁT tự báo, đặt ở thuộc tính `clients` của một cảm biến (xem tools/zte_e2633.py):
 * [{mac, band: '2.4G'|'5G', rssi, mode, name, ip}]. Phần tử sai khuôn bị bỏ; không có/hỏng → rỗng.
 */
export function thietBiTuCamBien(sensorId, states) {
  const cb = sensorId && states ? states[sensorId] : null;
  const ds = cb && cb.attributes ? cb.attributes.clients : null;
  if (!Array.isArray(ds)) return [];
  return ds.filter((c) => c && typeof c === 'object' && /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(String(c.mac || '')))
    .slice(0, 500)
    .map((c) => ({ mac: macChuan(c.mac), band: String(c.band || '').slice(0, 8), rssi: Number.isFinite(Number(c.rssi)) && c.rssi !== null ? Number(c.rssi) : null,
      mode: String(c.mode || '').slice(0, 16) }));
}

/** {mac: {band, rssi, mode}} của mọi bộ phát khai `clients_sensor` — để hiện băng tần và tín hiệu cạnh thiết bị. */
export function thongTinWifi(cfg = {}, states = {}) {
  const ra = {};
  for (const a of cfg.access_points || []) {
    if (!a || !a.clients_sensor) continue;
    for (const c of thietBiTuCamBien(a.clients_sensor, states)) ra[c.mac] = { band: c.band, rssi: c.rssi, mode: c.mode };
  }
  return ra;
}

export const KIND_SWITCH = 'switch';
export const KIND_AP = 'ap';

/**
 * Dựng danh sách NÚT TRUNG GIAN từ hai nguồn: cấu hình YAML (`switches`, `access_points`) và nút NGƯỜI DÙNG tự thêm trên card (`userNodes`).
 * Mỗi nút: {key, kind: 'switch'|'ap', name, port (cổng MikroTik nó cắm vào) | parent (khoá nút cha), macs (khai báo rõ), ips, entity, tuDong, nguon}.
 * Khoá: sw-<i>, ap-<i> (YAML) và u-<id> (người dùng).
 */
export function dungNut(cfg = {}, userNodes = []) {
  const nut = [];
  (cfg.switches || []).forEach((w, i) => {
    if (!w) return;
    nut.push({ key: `sw-${i}`, kind: KIND_SWITCH, name: w.name || `Switch ${i + 1}`, port: w.port || '', parent: '', macs: (w.macs || []).map(macChuan),
      ips: [], entity: w.entity || '', tuDong: false, nguon: 'cfg', macSensor: w.mac_sensor || '' });
  });
  (cfg.access_points || []).forEach((a, i) => {
    if (!a) return;
    const cha = a.switch ? (nut.find((n) => n.kind === KIND_SWITCH && n.name === a.switch) || {}).key || '' : '';
    nut.push({ key: `ap-${i}`, kind: KIND_AP, name: a.name || `WiFi ${i + 1}`, port: cha ? '' : (a.port || ''), parent: cha,
      macs: (a.macs || []).map(macChuan), ips: a.ips || [], entity: a.entity || '', tuDong: !!a.auto_private_mac, nguon: 'cfg', macSensor: a.mac_sensor || '',
      clientsSensor: a.clients_sensor || '' });
  });
  (userNodes || []).forEach((u) => {
    if (!u || typeof u.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(u.id)) return;
    const kind = u.kind === KIND_AP ? KIND_AP : KIND_SWITCH;
    const cha = typeof u.parent === 'string' ? u.parent : '';
    nut.push({ key: `u-${u.id}`, kind, name: String(u.name || '').slice(0, 60) || (kind === KIND_AP ? 'WiFi' : 'Switch'),
      port: cha.startsWith('port:') ? cha.slice(5) : '', parent: cha.startsWith('node:') ? cha.slice(5) : '',
      macs: [], ips: [], entity: '', tuDong: !!u.tuDong, nguon: 'user', macSensor: '' });
  });
  return nut;
}

/**
 * Chia thiết bị thành nhóm theo ĐƯỜNG ĐI. MikroTik chỉ thấy MAC theo CỔNG: nếu cổng đi qua thêm switch rồi mới tới bộ phát WiFi (ví dụ ZTE), bảng MAC của cổng gồm
 * CẢ máy có dây LẪN máy WiFi — không tự tách được. Vì vậy mỗi thiết bị được gán theo thứ tự ưu tiên:
 *   (1) gán TAY (`gan`: {mac: khoá_nút}); (2) nút khai báo rõ `macs`/`ips`; (3) GỢI Ý: nút bộ phát bật `tuDong` nhận máy MAC riêng tư nằm sau cổng của nó;
 *   (4) nút switch mà máy nằm sau cổng của nó (theo bảng MAC từ `cfg.mac_sensor`); (5) giao diện wlan hoặc wifi của MikroTik; (6) nhóm «LAN».
 * Nút con (cắm vào nút khác) không tự biết MAC phía sau: chỉ nhận máy gán rõ, gán tay, hoặc (bộ phát bật gợi ý) máy MAC riêng tư sau cổng của nút gốc.
 */
export function phanNhom(clients, cfg = {}, gan = {}, states = {}, userNodes = []) {
  const nut = dungNut(cfg, userNodes).map((n) => ({
    ...n, clients: [], online: n.entity && states[n.entity] ? states[n.entity].state === 'home' : null
  }));
  // Bộ phát tự báo danh sách máy WiFi của nó: đó là khai báo RÕ (chính xác hơn mọi suy đoán theo cổng).
  for (const n of nut) if (n.clientsSensor) n.macs = [...n.macs, ...thietBiTuCamBien(n.clientsSensor, states).map((c) => c.mac)];
  const theoKey = new Map(nut.map((n) => [n.key, n]));
  const macCong = (cong) => (cfg.mac_sensor ? macTuCamBien(cfg.mac_sensor, cong, states) : []).map(macChuan);
  for (const n of nut) {
    const tuNut = n.macSensor && n.port ? macTuCamBien(n.macSensor, n.port, states).map(macChuan) : [];
    n.sau = new Set(n.port ? [...macCong(n.port), ...tuNut] : []);
    // Bộ phát WiFi cắm THẲNG vào cổng và khai cảm biến riêng: mọi máy sau cổng đó là máy của bộ phát (không có switch xen giữa).
    if (n.kind === KIND_AP && n.macSensor && n.port) n.macs = [...n.macs, ...tuNut];
  }
  const goc = (n) => {
    let x = n; const thay = new Set();
    while (x && x.parent && !thay.has(x.key)) { thay.add(x.key); x = theoKey.get(x.parent); }
    return x || n;
  };
  const wifiMik = { key: 'mik-wifi', name: 'WiFi (MikroTik)', clients: [] };
  const coDay = { key: 'lan', name: 'LAN', clients: [] };
  for (const c of clients) {
    const mac = macChuan(c.mac);
    let dich = null;
    if (mac in gan) { const g = gan[mac]; dich = theoKey.get(typeof g === 'number' ? `ap-${g}` : g) || null; }
    if (!dich) dich = nut.find((n) => n.macs.includes(mac) || (c.ip && n.ips.includes(c.ip))) || null;
    if (!dich && macRiengTu(c.mac)) dich = nut.find((n) => n.kind === KIND_AP && n.tuDong && goc(n).sau.has(mac)) || null;
    if (!dich) dich = nut.find((n) => n.kind === KIND_SWITCH && n.sau.has(mac)) || null;
    if (dich) dich.clients.push(c);
    else if (/^(wlan|wifi|wl)/i.test(c.interface || '')) wifiMik.clients.push(c);
    else coDay.clients.push(c);
  }
  return {
    nut,
    nhom: [...nut.map((n) => ({ key: n.key, name: n.name, node: n, clients: n.clients })),
      ...(wifiMik.clients.length ? [wifiMik] : []), coDay]
  };
}

/** Danh sách nút người dùng AN TOÀN: bỏ phần tử sai khuôn (dữ liệu từ localStorage/HA user data có thể bị sửa hỏng). */
export function lamSachNutNguoiDung(v) {
  if (!Array.isArray(v)) return [];
  const thay = new Set();
  return v.filter((u) => u && typeof u === 'object' && typeof u.id === 'string' && /^[a-z0-9_-]{1,40}$/.test(u.id) && !thay.has(u.id) && thay.add(u.id))
    .slice(0, 40)
    .map((u) => ({
      id: u.id, name: String(u.name || '').slice(0, 60), kind: u.kind === KIND_AP ? KIND_AP : KIND_SWITCH,
      parent: typeof u.parent === 'string' ? u.parent.slice(0, 80) : '', tuDong: !!u.tuDong
    }));
}

/** Gán tay AN TOÀN: {mac: khoá_nút}. */
export function lamSachGan(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const ra = {};
  for (const [k, g] of Object.entries(v)) {
    if (!/^[0-9a-f:-]{11,17}$/i.test(k)) continue;
    if (typeof g === 'number' && g >= 0 && g < 100) ra[macChuan(k)] = g;
    else if (typeof g === 'string' && /^(sw|ap|u)-[a-z0-9_-]{1,40}$/.test(g)) ra[macChuan(k)] = g;
  }
  return ra;
}

// ───────────────────────── chữ hiển thị ─────────────────────────

const CHU = {
  vi: {
    title: 'Mạng LAN MikroTik', internet: 'Internet', router: 'MikroTik', ports: 'Cổng', tunnels: 'Đường hầm VPN', clients: 'Thiết bị',
    wgTitle: 'VPN WireGuard', batTay: 'bắt tay', truoc: 'trước', tong: 'tổng',
    search: 'Tìm tên, IP, MAC…', more: 'Xem thêm', none: 'Không có dữ liệu — kiểm tra tiền tố (prefix) và tích hợp MikroTik.',
    up: 'lên', down: 'xuống', online: 'đang kết nối', cpu: 'CPU', ram: 'RAM', uptime: 'Hoạt động', noClients: 'Chưa có thiết bị',
    connected: 'đã kết nối', disconnected: 'ngắt', assign: 'Gán vào', unassign: 'Bỏ gán', wifiHint: 'MAC riêng tư — thường là máy dùng WiFi',
    edit: 'Thêm switch / bộ phát WiFi', addTitle: 'Thêm nút vào sơ đồ', name: 'Tên', kind: 'Loại', kSwitch: 'Switch', kAp: 'Bộ phát WiFi',
    parent: 'Cắm vào', hint: 'Gợi ý: máy MAC riêng tư sau cổng này vào nhóm WiFi', add: 'Thêm', del: 'Xoá nút', close: 'Đóng',
    empty: 'Chưa có nút nào. Thêm switch hoặc bộ phát WiFi của bạn ở trên.'
  },
  en: {
    title: 'MikroTik LAN', internet: 'Internet', router: 'MikroTik', ports: 'Ports', tunnels: 'VPN tunnels', clients: 'Devices',
    wgTitle: 'VPN WireGuard', batTay: 'handshake', truoc: 'ago', tong: 'total',
    search: 'Search name, IP, MAC…', more: 'Show more', none: 'No data — check the prefix and the MikroTik integration.',
    up: 'up', down: 'down', online: 'online', cpu: 'CPU', ram: 'RAM', uptime: 'Uptime', noClients: 'No devices',
    connected: 'connected', disconnected: 'down', assign: 'Assign to', unassign: 'Unassign', wifiHint: 'Private MAC — usually a WiFi device',
    edit: 'Add switch / WiFi access point', addTitle: 'Add a node to the diagram', name: 'Name', kind: 'Type', kSwitch: 'Switch', kAp: 'WiFi access point',
    parent: 'Plugged into', hint: 'Hint: private-MAC devices behind this port join the WiFi group', add: 'Add', del: 'Remove node', close: 'Close',
    empty: 'No nodes yet. Add your switch or WiFi access point above.'
  }
};

// ───────────────────────── dựng HTML (thuần: nhận mô hình, trả chuỗi; mọi dữ liệu ngoài qua esc) ─────────────────────────

const chamTrangThai = (ok) => `<span class="cham ${ok === true ? 'ok' : ok === false ? 'loi' : 'chua'}"></span>`;
const thanh = (bps, toiDa = 1e8) => `<span class="thanh"><i style="width:${Math.min(100, Math.round((bps / toiDa) * 100))}%"></i></span>`;

function dongLuuLuong(rx, tx, t) {
  return `<span class="lu"><b title="${esc(t.down)}">↓</b>${esc(fmtRate(rx))} <b title="${esc(t.up)}">↑</b>${esc(fmtRate(tx))}</span>`;
}

/** Danh sách nơi có thể cắm một nút: cổng của MikroTik + các nút đã có. */
export function noiCam(model, nut) {
  return [
    ...[...model.bridges, ...model.ports, ...model.ppp].map((g) => ({ value: `port:${g.id}`, label: `${g.label} (${g.name})` })),
    ...nut.map((n) => ({ value: `node:${n.key}`, label: n.name }))
  ];
}

export function renderHtml(model, cfg = {}, ui = {}, now = Date.now()) {
  const t = CHU[cfg.language === 'en' ? 'en' : 'vi'];
  const tieuDe = cfg.title || t.title;
  const tenRouter = cfg.router_name || t.router;
  const { core, wan, ports, bridges, ppp, tunnels, clients } = model;
  const coDuLieu = !!(wan || ports.length || bridges.length || tunnels.length || clients.length || core.cpu != null);
  if (!coDuLieu) return `<ha-card><div class="vo">${esc(t.none)}</div></ha-card>`;

  const tong = wan ? { rx: wan.rx, tx: wan.tx } : ports.reduce((s, p) => ({ rx: s.rx + p.rx, tx: s.tx + p.tx }), { rx: 0, tx: 0 });
  const online = clients.filter((c) => c.online).length;
  const loc = String(ui.search || '').trim().toLowerCase();
  let ds = clients;
  if (cfg.hide_offline_clients) ds = ds.filter((c) => c.online);
  if (loc) ds = ds.filter((c) => `${c.name} ${c.ip} ${c.mac}`.toLowerCase().includes(loc));
  const gioiHan = Math.max(5, Number(ui.limit || cfg.client_limit || 30));
  const { nut, nhom } = phanNhom(ds, cfg, ui.gan || {}, ui.states || {}, ui.nodes || []);
  let conLai = cfg.show_clients === false ? 0 : gioiHan;
  const nhomHien = nhom.filter((g) => g.clients.length || g.node).map((g) => {
    const hien = g.clients.slice(0, Math.max(0, conLai)); conLai -= hien.length; return { ...g, hien };
  });
  const hienClients = nhomHien.flatMap((g) => g.hien);

  const hangCong = (g) => `
    <div class="hang" data-anchor="cong-${esc(g.key)}" data-ids="${esc([g.id, g.name].map((x) => String(x).toLowerCase().replace(/\s+/g, '_')).join(' '))}" data-luu="${esc(Math.round(g.rx + g.tx))}" title="${esc(g.name)} · ${esc(g.type)} · ${esc(g.comment)}">
      ${chamTrangThai(g.running)}<span class="ten">${esc(g.label)}</span>${dongLuuLuong(g.rx, g.tx, t)}${thanh(g.rx + g.tx)}
    </div>`;
  const hangWg = (h) => `
    <div class="hang ham ${h.connected ? '' : 'off'}" title="${esc(h.name)}">
      ${chamTrangThai(h.connected)}<span class="ten">${esc(h.name)}</span>${h.batTay != null ? `<span class="lu">${esc(t.batTay)} ${esc(Math.round(h.batTay))} s ${esc(t.truoc)}</span>` : ''}<span class="lu">↓ ${esc(fmtBytes(h.rxTong))} ↑ ${esc(fmtBytes(h.txTong))}</span>
    </div>`;
  const hangHam = (h) => `
    <div class="hang" data-anchor="ham-${esc(h.id)}" data-luu="${esc(Math.round(h.rx + h.tx))}">
      ${chamTrangThai(h.connected)}<span class="ten">${esc(h.name)}</span><span class="lu">${esc(h.connected ? t.connected : t.disconnected)}</span>${dongLuuLuong(h.rx, h.tx, t)}
    </div>`;
  const nutGan = (c) => {
    if (!nut.length) return '';
    const mac = macChuan(c.mac);
    const g = (ui.gan || {})[mac];
    const hien = g == null ? -1 : nut.findIndex((n) => n.key === (typeof g === 'number' ? `ap-${g}` : g));
    const dich = hien + 1 < nut.length ? nut[hien + 1] : null;
    const nhan = dich ? `${t.assign} ${dich.name}` : t.unassign;
    return `<button class="gan" data-act="gan" data-mac="${esc(mac)}" title="${esc(nhan)}" aria-label="${esc(nhan)}">📶</button>`;
  };
  const wifi = thongTinWifi(cfg, ui.states || {});
  const chipWifi = (c) => {
    const w = wifi[macChuan(c.mac)];
    if (!w) return '';
    const nhan = [w.band, w.rssi != null ? `${w.rssi} dBm` : ''].filter(Boolean).join(' · ');
    return nhan ? `<span class="goi" title="${esc(w.mode)}">${esc(nhan)}</span>` : '';
  };
  const hangMay = (c) => `
    <div class="hang may ${c.online ? '' : 'off'}" title="${esc(c.mac)} · ${esc(c.interface)} · ${esc(c.source)}">
      ${chamTrangThai(c.online)}<span class="ten">${esc(c.name)}</span>${chipWifi(c)}${macRiengTu(c.mac) ? `<span class="goi" title="${esc(t.wifiHint)}">◌</span>` : ''}<span class="lu">${esc(c.ip)}</span>${nutGan(c)}
    </div>`;
  const tieuDeNhom = (g) => {
    const n = g.node;
    const neo = n ? `data-anchor="n-${esc(n.key)}" data-luu="0"` : '';
    const bieuTuong = n ? (n.kind === KIND_AP ? '📶 ' : '⇄ ') : '';
    const xoa = n && n.nguon === 'user' && ui.edit ? `<button class="xoa" data-act="xoa-nut" data-key="${esc(n.key)}" title="${esc(t.del)}" aria-label="${esc(t.del)}">×</button>` : '';
    return `<div class="tieu-nhom nhom-may" ${neo}>${n && n.kind === KIND_AP ? chamTrangThai(n.online) : ''}${bieuTuong}${esc(g.name)} (${esc(g.clients.length)})${xoa}</div>`;
  };
  const nutXemThem = ds.length > hienClients.length && cfg.show_clients !== false
    ? `<button class="them" data-act="more">${esc(t.more)} (${esc(ds.length - hienClients.length)})</button>` : '';

  const f = ui.form || {};
  const opts = noiCam(model, nut).map((o) => `<option value="${esc(o.value)}" ${f.parent === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  const bang = ui.edit ? `
    <div class="sua" role="group" aria-label="${esc(t.addTitle)}">
      <div class="tieu-nhom">${esc(t.addTitle)}</div>
      <label>${esc(t.name)}<input class="o-ten" type="text" maxlength="60" value="${esc(f.name || '')}"></label>
      <label>${esc(t.kind)}<select class="o-loai"><option value="switch" ${f.kind !== 'ap' ? 'selected' : ''}>${esc(t.kSwitch)}</option><option value="ap" ${f.kind === 'ap' ? 'selected' : ''}>${esc(t.kAp)}</option></select></label>
      <label>${esc(t.parent)}<select class="o-cha">${opts}</select></label>
      <label class="ngang"><input class="o-tudong" type="checkbox" ${f.tuDong ? 'checked' : ''}><span>${esc(t.hint)}</span></label>
      <div class="hang-nut"><button class="them" data-act="them-nut">${esc(t.add)}</button><button class="them phu-nut" data-act="dong-sua">${esc(t.close)}</button></div>
      ${(ui.nodes || []).length ? '' : `<div class="phu">${esc(t.empty)}</div>`}
    </div>` : '';

  return `<ha-card>
    <div class="dau"><div class="td">${esc(tieuDe)}</div>
      <div class="chip"><b>↓</b>${esc(fmtRate(tong.rx))}</div><div class="chip"><b>↑</b>${esc(fmtRate(tong.tx))}</div>
      <div class="chip">${esc(online)}/${esc(clients.length)} ${esc(t.online)}</div>
      ${cfg.show_clients === false ? '' : `<button class="chip nut-sua" data-act="sua" aria-pressed="${ui.edit ? 'true' : 'false'}" title="${esc(t.edit)}" aria-label="${esc(t.edit)}">✎</button>`}</div>
    ${bang}
    <div class="cay">
      <svg class="duong" aria-hidden="true"></svg>
      <div class="cot cot-isp">
        <div class="nut-node" data-anchor="isp" data-luu="${esc(wan ? Math.round(wan.rx + wan.tx) : 0)}">
          <div class="nt">${wan ? chamTrangThai(wan.running) : ''}<span>${esc(cfg.isp_name || (wan && wan.comment) || t.internet)}</span></div>
          ${wan ? dongLuuLuong(wan.rx, wan.tx, t) : ''}
        </div>
      </div>
      <div class="cot cot-router">
        <div class="nut-node chinh" data-anchor="router">
          <div class="nt"><span>${esc(tenRouter)}</span></div>
          <div class="phu">${core.cpu != null ? `${esc(t.cpu)} ${esc(core.cpu)}%` : ''} ${core.ram != null ? `· ${esc(t.ram)} ${esc(core.ram)}%` : ''}</div>
          <div class="phu">${core.uptime ? `${esc(t.uptime)} ${esc(fmtUptime(core.uptime, now))}` : ''} ${core.version ? `· RouterOS ${esc(core.version)}` : ''}</div>
        </div>
      </div>
      <div class="cot cot-cong">
        <div class="tieu-nhom">${esc(t.ports)}</div>
        ${[...bridges, ...ports, ...ppp].map((g) => hangCong(g)).join('')}
        ${tunnels.length ? `<div class="tieu-nhom">${esc(t.wgTitle)}</div>${tunnels.map(hangWg).join('')}` : ''}
      </div>
      ${cfg.show_clients === false ? '' : `<div class="cot cot-may">
        <div class="tieu-nhom">${esc(t.clients)} (${esc(ds.length)})</div>
        <input class="tim" type="search" placeholder="${esc(t.search)}" value="${esc(ui.search || '')}" aria-label="${esc(t.search)}">
        ${nhomHien.length ? nhomHien.map((g) => `${tieuDeNhom(g)}${g.hien.map(hangMay).join('')}`).join('') : `<div class="phu">${esc(t.noClients)}</div>`}
        ${nutXemThem}
      </div>`}
    </div>
  </ha-card>`;
}

export const CSS = `
:host{display:block}
ha-card{padding:12px 14px;overflow:hidden;color:var(--primary-text-color)}
.vo{padding:16px;color:var(--secondary-text-color)}
.dau{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px}
.td{font-weight:600;font-size:16px;margin-right:auto}
.chip{padding:3px 10px;border-radius:999px;border:1px solid var(--divider-color,#ddd);font-size:12px;background:var(--secondary-background-color,transparent);color:inherit;font-family:inherit}
.nut-sua{cursor:pointer}
.nut-sua[aria-pressed="true"]{background:var(--primary-color);color:#fff;border-color:var(--primary-color)}
.chip b,.lu b{color:var(--primary-color);margin-right:3px}
.cay{position:relative;display:grid;grid-template-columns:minmax(120px,0.9fr) minmax(150px,1fr) minmax(220px,1.6fr) minmax(220px,1.6fr);gap:28px;align-items:start}
.duong{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:visible}
.duong path{fill:none;stroke:var(--primary-color,#03a9f4);stroke-linecap:round;opacity:.55}
.duong path.chay{stroke-dasharray:6 8;animation:chay linear infinite}
@keyframes chay{to{stroke-dashoffset:-28}}
.cot{position:relative;z-index:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.nut-node{padding:10px 12px;border-radius:12px;border:1px solid var(--divider-color,#ddd);background:var(--card-background-color,#fff)}
.nut-node.chinh{border-color:var(--primary-color,#03a9f4)}
.nt{display:flex;align-items:center;gap:6px;font-weight:600}
.phu{font-size:12px;color:var(--secondary-text-color)}
.tieu-nhom{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--secondary-text-color);margin-top:2px}
.hang{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;border:1px solid var(--divider-color,#eee);background:var(--card-background-color,#fff);font-size:13px;min-width:0}
.hang.may{border-color:transparent;background:var(--secondary-background-color,#f6f6f6)}
.hang.off{opacity:.5}
.nhom-may{display:flex;align-items:center;gap:6px;margin-top:6px;color:var(--primary-text-color)}
.goi{flex:0 0 auto;font-size:12px;color:var(--secondary-text-color)}
.gan,.xoa{flex:0 0 auto;border:0;background:none;cursor:pointer;font-size:13px;opacity:.55;padding:0 2px;color:inherit}
.xoa{margin-left:auto;font-size:16px}
.gan:hover,.xoa:hover{opacity:1}
.ten{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lu{flex:0 0 auto;font-size:12px;color:var(--secondary-text-color);white-space:nowrap}
.thanh{flex:0 0 38px;height:4px;border-radius:2px;background:var(--divider-color,#e5e5e5);overflow:hidden}
.thanh i{display:block;height:100%;background:var(--primary-color,#03a9f4)}
.cham{flex:0 0 8px;width:8px;height:8px;border-radius:50%;background:#9e9e9e}
.cham.ok{background:var(--success-color,#43a047)}
.cham.loi{background:var(--error-color,#e53935)}
.tim,.sua input[type=text],.sua select{width:100%;box-sizing:border-box;padding:6px 10px;border-radius:8px;border:1px solid var(--divider-color,#ddd);background:var(--card-background-color,#fff);color:inherit;font:inherit;font-size:13px}
.them{align-self:flex-start;padding:5px 12px;border-radius:8px;border:1px solid var(--divider-color,#ddd);background:none;color:var(--primary-color);cursor:pointer;font:inherit;font-size:12px}
.phu-nut{color:var(--secondary-text-color)}
.sua{display:flex;flex-direction:column;gap:8px;padding:10px 12px;margin-bottom:12px;border:1px dashed var(--divider-color,#ccc);border-radius:12px;max-width:520px}
.sua label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--secondary-text-color)}
.sua label.ngang{flex-direction:row;align-items:center;gap:8px}
.hang-nut{display:flex;gap:8px}
@media (max-width:820px){.cay{grid-template-columns:1fr;gap:12px}.duong{display:none}}
@media (prefers-reduced-motion:reduce){.duong path.chay{animation:none}}
`;

// ───────────────────────── phần tử tuỳ chỉnh (chỉ chạy trong trình duyệt) ─────────────────────────

const KHOA_USER_DATA = 'mikrotik-topo-lan-card';

if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') {
  class MikrotikTopoLanCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._cfg = {};
      this._ui = { search: '', limit: 0, gan: {}, nodes: [], states: {}, edit: false, form: { name: '', kind: 'switch', parent: '', tuDong: false } };
      this._chuKy = ''; this._hass = null; this._daNapUserData = false;
    }

    setConfig(cfg) {
      if (cfg && cfg.port_names != null && (typeof cfg.port_names !== 'object' || Array.isArray(cfg.port_names))) throw new Error('port_names phải là đối tượng {id: tên}');
      if (cfg && cfg.hide_ports != null && !Array.isArray(cfg.hide_ports)) throw new Error('hide_ports phải là danh sách');
      if (cfg && cfg.access_points != null && !Array.isArray(cfg.access_points)) throw new Error('access_points phải là danh sách');
      if (cfg && cfg.switches != null && !Array.isArray(cfg.switches)) throw new Error('switches phải là danh sách');
      this._cfg = { ...(cfg || {}) };
      this._khoaLuu = `${KHOA_USER_DATA}:${this._cfg.prefix || 'mikrotik_router'}`;
      try {
        const luu = JSON.parse(localStorage.getItem(this._khoaLuu) || '{}') || {};
        this._ui.nodes = lamSachNutNguoiDung(luu.nodes); this._ui.gan = lamSachGan(luu.gan);
      } catch (e) { this._ui.nodes = []; this._ui.gan = {}; }
      this._chuKy = '';
      this._ve(true);
    }

    set hass(h) {
      this._hass = h;
      if (!this._daNapUserData && h && typeof h.callWS === 'function') this._napUserData();
      this._ve();
    }

    getCardSize() { return 8; }

    static getStubConfig() { return { type: 'custom:mikrotik-topo-lan-card', prefix: 'mikrotik_router' }; }

    /** Đồng bộ theo người dùng HA (giữa các thiết bị): lỗi thì giữ bản trong trình duyệt. */
    async _napUserData() {
      this._daNapUserData = true;
      try {
        const r = await this._hass.callWS({ type: 'frontend/get_user_data', key: this._khoaLuu });
        const v = r && r.value;
        if (v && typeof v === 'object') {
          this._ui.nodes = lamSachNutNguoiDung(v.nodes); this._ui.gan = lamSachGan(v.gan);
          try { localStorage.setItem(this._khoaLuu, JSON.stringify({ nodes: this._ui.nodes, gan: this._ui.gan })); } catch (e) { /* bỏ qua */ }
          this._ve(true);
        }
      } catch (e) { /* không có user data: dùng localStorage */ }
    }

    _luu() {
      const goi = { nodes: this._ui.nodes, gan: this._ui.gan };
      try { localStorage.setItem(this._khoaLuu, JSON.stringify(goi)); } catch (e) { /* bỏ qua */ }
      if (this._hass && typeof this._hass.callWS === 'function') {
        this._hass.callWS({ type: 'frontend/set_user_data', key: this._khoaLuu, value: goi }).catch(() => { /* chỉ ghi được trên trình duyệt này */ });
      }
    }

    _docForm() {
      const q = (s) => this.shadowRoot.querySelector(s);
      if (!q('.sua')) return;
      this._ui.form = { name: q('.o-ten').value, kind: q('.o-loai').value, parent: q('.o-cha').value, tuDong: q('.o-tudong').checked };
    }

    _ve(ep = false) {
      if (!this._hass) return;
      const cfgHl = autoCauHinh(this._hass.states, this._cfg);
      const model = discover(this._hass.states, cfgHl);
      this._ui.states = this._hass.states;
      const chuKy = JSON.stringify([model, this._ui.search, this._ui.limit, this._cfg.language, this._ui.gan, this._ui.nodes, this._ui.edit,
        (this._cfg.access_points || []).map((a) => (a && a.entity && this._hass.states[a.entity] ? this._hass.states[a.entity].state : '')),
        [this._cfg, ...(this._cfg.switches || []), ...(this._cfg.access_points || [])]
          .map((x) => (x && x.mac_sensor && this._hass.states[x.mac_sensor] ? JSON.stringify(this._hass.states[x.mac_sensor].attributes) : '')),
        (this._cfg.access_points || []).map((x) => (x && x.clients_sensor && this._hass.states[x.clients_sensor] ? JSON.stringify(this._hass.states[x.clients_sensor].attributes) : ''))]);
      if (!ep && chuKy === this._chuKy) return;
      this._chuKy = chuKy;
      const dangTim = this.shadowRoot.activeElement && this.shadowRoot.activeElement.classList.contains('tim');
      const vt = dangTim ? this.shadowRoot.activeElement.selectionStart : 0;
      this._docForm();
      this.shadowRoot.innerHTML = `<style>${CSS}</style>${renderHtml(model, cfgHl, this._ui)}`;
      this._gan();
      const o = this.shadowRoot.querySelector('.tim');
      if (o && dangTim) { o.focus(); try { o.setSelectionRange(vt, vt); } catch (e) { /* bỏ qua */ } }
      requestAnimationFrame(() => this._veDuong());
    }

    _gan() {
      const r = this.shadowRoot;
      const tim = r.querySelector('.tim');
      if (tim) tim.addEventListener('input', () => { this._ui.search = tim.value; this._ui.limit = 0; this._ve(true); });
      const them = r.querySelector('[data-act="more"]');
      if (them) them.addEventListener('click', () => { this._ui.limit = (this._ui.limit || this._cfg.client_limit || 30) + 30; this._ve(true); });
      const sua = r.querySelector('[data-act="sua"]');
      if (sua) sua.addEventListener('click', () => { this._docForm(); this._ui.edit = !this._ui.edit; this._ve(true); });
      const dong = r.querySelector('[data-act="dong-sua"]');
      if (dong) dong.addEventListener('click', () => { this._ui.edit = false; this._ve(true); });
      const addBtn = r.querySelector('[data-act="them-nut"]');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          this._docForm();
          const f = this._ui.form;
          const ten = String(f.name || '').trim().slice(0, 60);
          if (!ten || this._ui.nodes.length >= 40) return;
          const goc = (slug(ten) || 'nut').slice(0, 30);
          const co = new Set(this._ui.nodes.map((u) => u.id));
          let moi = goc; let dem = 1;
          while (co.has(moi)) moi = `${goc}-${++dem}`;
          this._ui.nodes = [...this._ui.nodes, { id: moi, name: ten, kind: f.kind === 'ap' ? 'ap' : 'switch', parent: f.parent || '', tuDong: !!f.tuDong }];
          this._ui.form = { name: '', kind: f.kind, parent: f.parent, tuDong: !!f.tuDong };
          this._luu(); this._ve(true);
        });
      }
      r.querySelectorAll('[data-act="xoa-nut"]').forEach((b) => b.addEventListener('click', () => {
        const key = b.dataset.key; const id = String(key).replace(/^u-/, '');
        // nút cha bị xoá → nút con mất cha (không treo); gán tay vào nút đã xoá bị bỏ
        this._ui.nodes = this._ui.nodes.filter((u) => u.id !== id).map((u) => (u.parent === `node:${key}` ? { ...u, parent: '' } : u));
        for (const [mac, g] of Object.entries(this._ui.gan)) if (g === key) delete this._ui.gan[mac];
        this._luu(); this._ve(true);
      }));
      r.querySelectorAll('[data-act="gan"]').forEach((nut) => nut.addEventListener('click', () => {
        const mac = nut.dataset.mac;
        const { nut: ds } = phanNhom([], this._cfg, {}, this._hass.states, this._ui.nodes);
        const g = this._ui.gan[mac];
        const hien = g == null ? -1 : ds.findIndex((n) => n.key === (typeof g === 'number' ? `ap-${g}` : g));
        if (hien + 1 >= ds.length) delete this._ui.gan[mac]; else this._ui.gan[mac] = ds[hien + 1].key;
        this._luu(); this._ve(true);
      }));
    }

    _veDuong() {
      const cay = this.shadowRoot.querySelector('.cay');
      const svg = this.shadowRoot.querySelector('.duong');
      if (!cay || !svg || getComputedStyle(svg).display === 'none') return;
      const goc = cay.getBoundingClientRect();
      const diem = (el, canh) => {
        const r = el.getBoundingClientRect();
        return { x: (canh === 'phai' ? r.right : r.left) - goc.left, y: r.top + r.height / 2 - goc.top };
      };
      const tim = (a) => cay.querySelector(`[data-anchor="${a}"]`);
      const timCong = (ten) => {
        const k = String(ten || '').toLowerCase().replace(/\s+/g, '_').replace(/["\\]/g, '');
        return k ? cay.querySelector(`[data-ids~="${k}"]`) : null;
      };
      const duong = [];
      const noi = (tu, den) => {
        if (!tu || !den) return;
        const p = diem(tu, 'phai'); const q = diem(den, 'trai');
        const luu = Number(den.dataset.luu || tu.dataset.luu || 0);
        const rong = luu > 0 ? Math.min(4, 1.2 + Math.log10(luu + 1) / 2.2) : 1;
        const giay = luu > 0 ? Math.max(0.5, 4 - Math.log10(luu + 1) * 0.5) : 0;
        const mx = (p.x + q.x) / 2;
        duong.push(`<path d="M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}" stroke-width="${rong.toFixed(2)}" class="${giay ? 'chay' : ''}" style="${giay ? `animation-duration:${giay.toFixed(2)}s` : ''}"/>`);
      };
      noi(tim('isp'), tim('router'));
      const { nut } = phanNhom([], this._cfg, {}, this._hass ? this._hass.states : {}, this._ui.nodes);
      for (const n of nut) noi(n.parent ? tim(`n-${n.parent}`) : (n.port ? timCong(n.port) : null), tim(`n-${n.key}`));
      cay.querySelectorAll('[data-anchor^="cong-"], [data-anchor^="ham-"]').forEach((el) => noi(tim('router'), el));
      svg.innerHTML = duong.join('');
    }

    connectedCallback() {
      this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this._veDuong()) : null;
      if (this._ro) this._ro.observe(this);
    }

    disconnectedCallback() { if (this._ro) this._ro.disconnect(); }
  }

  if (!customElements.get('mikrotik-topo-lan-card')) customElements.define('mikrotik-topo-lan-card', MikrotikTopoLanCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'mikrotik-topo-lan-card', name: 'MikroTik Topo LAN Card',
    description: 'Sơ đồ mạng LAN của router MikroTik (đọc tích hợp MikroTik, không cần SNMP)', preview: false
  });
}
