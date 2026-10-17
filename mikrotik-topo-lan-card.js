/*!
 * MikroTik Topo LAN Card — sơ đồ mạng LAN của router MikroTik trong Home Assistant.
 * Đọc thẳng thực thể của tích hợp MikroTik (Mikrotik Router / MikroTik Extended): KHÔNG cần SNMP.
 * Ý tưởng sơ đồ cây lấy cảm hứng từ doanlong1412/snmp-topo-lan-card (MIT); mã viết lại cho MikroTik.
 * Giấy phép: MIT.
 */

export const VERSION = '0.8.4';

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
  const reTong = new RegExp(`^sensor\\.${P}_(port|bridge|ppp)_(.+)_(rx|tx)_total$`);
  const reIpCong = new RegExp(`^sensor\\.${P}_(port|bridge|ppp)_(.+)_ip_address$`);
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
    if (!giaoDien.has(k)) giaoDien.set(k, { key: k, id, kind: loai, name: id, comment: '', running: null, type: '', rx: 0, tx: 0,
      rxTong: 0, txTong: 0, ip: '', status: '', mtu: null, linkDowns: null, lastUp: '' });
    return giaoDien.get(k);
  };
  const ham = (id) => {
    if (!duongHam.has(id)) duongHam.set(id, { id, name: id, connected: null, rx: 0, tx: 0, rxTong: 0, txTong: 0, batTay: null, iface: '', allowed: '' });
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
      // Giao diện WireGuard (type wg) vẫn được ghi nhận; danh sách cổng tự loại chúng ra, mục VPN dùng chúng.
      const gd = lay(m[1], m[2]);
      gd.name = a.name || gd.name; gd.comment = a.comment || gd.comment; gd.type = a.type || gd.type;
      gd.running = typeof a.running === 'boolean' ? a.running : on(s.state);
      gd.status = a.status || gd.status; gd.mtu = a.actual_mtu != null ? a.actual_mtu : gd.mtu;
      gd.linkDowns = a.link_downs != null ? a.link_downs : gd.linkDowns; gd.lastUp = a.last_link_up_time || gd.lastUp;
    } else if ((m = reTong.exec(eid))) {
      const gd = lay(m[1], m[2]);
      gd[m[3] + 'Tong'] = toBytes(s.state, a.unit_of_measurement);
    } else if ((m = reIpCong.exec(eid))) {
      lay(m[1], m[2]).ip = String(s.state || '');
    } else if ((m = reKetNoi.exec(eid))) {
      lay(m[1], m[2]).running = on(s.state);
    } else if ((m = reWg.exec(eid))) {
      const h = ham(m[1]);
      const donVi = String(a.unit_of_measurement || '').trim();
      // HA báo lưu lượng WireGuard thường là tổng byte từ trước đến giờ (B), không phải tốc độ.
      if (/\/s$/i.test(donVi)) h[m[2]] = toBps(s.state, donVi);
      else h[m[2] + 'Tong'] = toBytes(s.state, donVi);
      h.name = (a.friendly_name || '').replace(/^.*WireGuard\s+/i, '').replace(/\s+(RX|TX)$/i, '') || h.name;
      h.iface = h.iface || a.interface || ''; h.allowed = h.allowed || a.allowed_address || '';
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
  // Cảm biến tốc độ do người dùng chỉ định theo cổng (ví dụ SNMP + Derivative, cập nhật nhanh hơn tích hợp MikroTik):
  // ghi đè rx/tx của cổng đó. Cảm biến chưa có số (unknown/unavailable) hoặc đơn vị không phải tốc độ thì GIỮ giá trị cũ.
  for (const [cong, cs] of Object.entries(cfg.port_speed_sensors || {})) {
    const khoaCong = String(cong).toLowerCase();
    const gd = [...giaoDien.values()].find((g) => String(g.id).toLowerCase() === khoaCong || String(g.name || '').toLowerCase() === khoaCong);
    if (!gd || !cs || typeof cs !== 'object') continue;
    for (const huong of ['rx', 'tx']) {
      const e = cs[huong] ? (states || {})[cs[huong]] : null;
      if (!e || e.state === '' || e.state == null || !isFinite(Number(e.state))) continue;
      const donVi = String((e.attributes || {}).unit_of_measurement || '').trim().toLowerCase();
      if (!DON_VI_BPS[donVi]) continue;
      gd[huong] = toBps(e.state, donVi);
    }
  }
  const loi = (hau) => (states || {})[`sensor.${tienTo}_core_${hau}`];
  const so = (s) => (s && isFinite(Number(s.state)) ? Number(s.state) : null);
  const capNhat = (states || {})[`update.${tienTo}_core_routeros_update`];
  const core = {
    cpu: so(loi('cpu_load')), ram: so(loi('memory_usage')), hdd: so(loi('hdd_usage')),
    uptime: loi('uptime') ? loi('uptime').state : '', wired: so(loi('wired_clients')), wireless: so(loi('wireless_clients')),
    version: capNhat && capNhat.attributes ? (capNhat.attributes.installed_version || '') : '',
    latest: capNhat && capNhat.attributes ? (capNhat.attributes.latest_version || '') : ''
  };
  const tatCa = [...giaoDien.values()];
  const wan = cfg.wan
    ? tatCa.find((g) => g.id === cfg.wan)
    : tatCa.find((g) => g.kind === 'ppp' && /pppoe|l2tp|pptp|sstp|ovpn/i.test(g.type || ''))
      || tatCa.find((g) => g.kind === 'port' && /wan/i.test(g.name || ''))
      || null;
  const an = new Set(cfg.hide_ports || []);
  const tenCong = cfg.port_names || {};
  // Tên hiển thị: người dùng đặt trong port_names; không có thì dùng tên trong MikroTik (không dùng chú thích).
  const hienThi = (g) => ({ ...g, label: tenCong[g.id] || g.name });
  // Cổng tên WAN thuộc đường ra Internet, không hiện như cổng nội bộ.
  const laWg = (g) => String(g.type || '').toLowerCase() === 'wg';
  const ports = tatCa.filter((g) => g.kind === 'port' && g !== wan && !laWg(g) && !an.has(g.id) && !/wan/i.test(g.name || '')).map(hienThi);
  const vpnIfaces = tatCa.filter((g) => g.kind === 'port' && laWg(g) && !an.has(g.id)).map(hienThi);
  const bridges = tatCa.filter((g) => g.kind === 'bridge' && !an.has(g.id)).map(hienThi);
  const pppKhac = tatCa.filter((g) => g.kind === 'ppp' && g !== wan && !an.has(g.id)).map(hienThi);
  return {
    core, wan: wan ? hienThi(wan) : null, ports, bridges, ppp: pppKhac,
    // Chỉ hiện đường hầm và thiết bị đang kết nối; peer báo ngắt (connected === false) thì không hiện.
    wanCong: tatCa.find((g) => g.kind === 'port' && /wan/i.test(g.name || '')) || null,
    tunnels: [...duongHam.values()].filter((h) => !an.has(h.id) && h.connected !== false),
    vpn: { ifaces: vpnIfaces, peers: [...duongHam.values()].filter((h) => !an.has(h.id) && h.connected !== false) },
    // Chỉ thiết bị báo đang kết nối (device_tracker = home); thiết bị ngắt không hiện trên card.
    clients: may.filter((c) => c.online).sort((x, y) => x.name.localeCompare(y.name))
  };
}

// ───────────────────────── nút trung gian (switch, bộ phát WiFi) và gán thiết bị ─────────────────────────

/** MAC «riêng tư» (bit 0x02 của byte đầu): điện thoại/máy bật địa chỉ ngẫu nhiên — dấu hiệu CẤU TRÚC (không phải danh sách tên) của máy dùng WiFi. */
/**
 * Tự vẽ bộ phát ZTE từ cảm biến số máy (thuộc tính clients) khi chưa khai bộ phát nào.
 * Cần khai `zte_port`: cổng MikroTik nơi ZTE cắm. Không khai thì không tự thêm (card không đoán cổng).
 */
/** Đặt một khoá cấu hình; giá trị rỗng thì xoá khoá (YAML khỏi đầy dòng thừa). Không sửa đối tượng gốc. */
export function capNhatCauHinh(config, khoa, gia) {
  const ra = { ...(config || {}) };
  if (gia === '' || gia === null || gia === undefined) delete ra[khoa];
  else ra[khoa] = gia;
  return ra;
}

/** Thêm một mục vào danh sách (switches / access_points). */
export function themMuc(config, khoa, muc) {
  const ds = Array.isArray((config || {})[khoa]) ? config[khoa] : [];
  return { ...(config || {}), [khoa]: [...ds, muc] };
}

/** Xoá mục thứ i của danh sách; danh sách rỗng thì bỏ khoá. */
export function xoaMuc(config, khoa, i) {
  const ds = Array.isArray((config || {})[khoa]) ? config[khoa].filter((_, j) => j !== i) : [];
  const ra = { ...(config || {}) };
  if (ds.length) ra[khoa] = ds; else delete ra[khoa];
  return ra;
}

/** Sửa một trường của mục thứ i; trường rỗng thì bỏ trường đó khỏi mục. */
export function suaMuc(config, khoa, i, truong, gia) {
  const ds = Array.isArray((config || {})[khoa]) ? config[khoa].map((m) => ({ ...m })) : [];
  if (!ds[i]) return { ...(config || {}) };
  if (gia === '' || gia === null || gia === undefined) delete ds[i][truong];
  else ds[i][truong] = gia;
  return { ...(config || {}), [khoa]: ds };
}

/**
 * Cây thiết bị của tích hợp `mikrotik_snmp` (cảm biến `cfg.topo_sensor`): {nodes, clients}. nodes: router/cổng/ZTE kèm `parent`;
 * clients: mỗi máy có `parent` (id nút cha). Không có cảm biến hoặc thuộc tính hỏng → null.
 */
export function layCay(cfg = {}, states = {}) {
  const cb = cfg && cfg.topo_sensor ? (states || {})[cfg.topo_sensor] : null;
  const a = cb && cb.attributes ? cb.attributes : null;
  if (!a || !Array.isArray(a.nodes) || !Array.isArray(a.clients)) return null;
  return {
    nodes: a.nodes.filter((n) => n && typeof n === 'object' && n.id),
    clients: a.clients.filter((c) => c && typeof c === 'object' && /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(String(c.mac || ''))).slice(0, 500)
  };
}

/** Tên hộp trên card cho một nút của cây: tên do người dùng đặt trong `port_names`, không có thì tên của nút. */
const tenHopCay = (cfg, n) => String(((cfg.port_names || {})[n.id]) || n.name || n.id).slice(0, 60);

/**
 * Với `topo_sensor`: TỰ dựng hộp từ cây — mỗi cổng có máy (hoặc có bộ phát cắm vào) thành một switch, mỗi nút `ap` thành một bộ phát nối vào cổng/switch cha.
 * Hộp người dùng đã khai (switch có cùng `port`, bộ phát cùng tên hoặc cùng IP) được GIỮ NGUYÊN, không tạo trùng.
 */
function themHopTuCay(cfg, cay) {
  const switches = [...(cfg.switches || [])];
  const aps = [...(cfg.access_points || [])];
  const coCon = new Set(cay.clients.map((c) => c.parent));
  for (const n of cay.nodes) if (n.kind === 'ap' && n.parent) coCon.add(n.parent);
  const an = new Set(cfg.hide_ports || []);
  for (const n of cay.nodes) {
    if (n.kind === 'router' || n.kind === 'ap' || !coCon.has(n.id) || an.has(n.id)) continue;
    if (!switches.some((w) => w && w.port === n.id)) switches.push({ name: tenHopCay(cfg, n), port: n.id });
  }
  for (const n of cay.nodes) {
    if (n.kind !== 'ap') continue;
    if (aps.some((a) => a && (a.name === n.name || (n.ip && (a.ips || []).includes(n.ip))))) continue;
    const sw = switches.find((w) => w && w.port === n.parent);
    aps.push({ name: n.name || 'ZTE WiFi', ...(sw ? { switch: sw.name } : (n.parent && n.parent !== 'router' ? { port: n.parent } : {})), ips: n.ip ? [n.ip] : [] });
  }
  return { ...cfg, switches, access_points: aps };
}

export function autoCauHinh(states = {}, cfg = {}) {
  const cay = layCay(cfg, states);
  if (cay) cfg = themHopTuCay(cfg, cay);
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

/** Số mili giây phải chờ nữa mới được vẽ lại (0 = vẽ ngay). `khoang` mặc định 1000 ms, không nhỏ hơn 250 ms. */
/** Máy yếu (≤ 2 nhân hoặc ≤ 2 GB): không chạy hoạt ảnh nét đứt, vì SVG phải vẽ lại mỗi khung hình. */
const mayYeu = () => typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2);

export function tinhDoiVe(bayGio, lanCuoi, khoang) {
  const k = Math.max(250, Number(khoang) || 1000);
  return Math.max(0, k - (bayGio - (Number(lanCuoi) || 0)));
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
      mode: String(c.mode || '').slice(0, 16),
      rxRate: Number.isFinite(Number(c.rx_rate)) ? Number(c.rx_rate) : null, txRate: Number.isFinite(Number(c.tx_rate)) ? Number(c.tx_rate) : null }));
}

const SO_HOP_LE = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

/** Một thiết bị từ nguồn bất kỳ → khuôn chuẩn {mac, ip, name, band, rssi, mode, rxRate, txRate}; thiếu MAC hợp lệ thì bỏ. */
function chuanHoaThietBi(o) {
  if (!o || typeof o !== 'object') return null;
  const mac = macChuan(o.mac);
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) return null;
  return {
    mac, ip: o.ip ? String(o.ip).slice(0, 45) : '', name: o.name ? String(o.name).slice(0, 64) : '',
    band: o.band ? String(o.band).slice(0, 8) : '', rssi: SO_HOP_LE(o.rssi), mode: o.mode ? String(o.mode).slice(0, 16) : '',
    rxRate: SO_HOP_LE(o.rx), txRate: SO_HOP_LE(o.tx)
  };
}

const KHOA_THIET_BI = ['mac', 'ip', 'name', 'band', 'rssi', 'mode', 'rx', 'tx'];
const KHOA_MAC_DINH = { rx: 'rx_rate', tx: 'tx_rate' };

/**
 * Danh sách thiết bị lấy từ trạng thái hoặc thuộc tính của một thực thể:
 *  - thuộc tính là danh sách đối tượng: `map` ánh xạ trường chuẩn → khoá trong đối tượng (mặc định cùng tên; rx→rx_rate, tx→tx_rate);
 *  - là chuỗi: tách bằng `separator` (mặc định xuống dòng hoặc «, ») rồi áp `pattern` (regex có nhóm tên: mac, ip, name, band, rssi, mode, rx, tx).
 * Cấu hình sai (regex hỏng, thực thể không có) → rỗng, không ném lỗi.
 */
export function phanTichNguon(src, states = {}) {
  if (!src || typeof src !== 'object' || !src.entity) return [];
  const st = (states || {})[src.entity];
  if (!st) return [];
  const raw = src.attribute ? (st.attributes || {})[src.attribute] : st.state;
  const map = src.map && typeof src.map === 'object' ? src.map : {};
  const lay = (it, khoa) => it[map[khoa] || KHOA_MAC_DINH[khoa] || khoa];
  let muc = [];
  if (Array.isArray(raw) || (raw && typeof raw === 'object')) {
    const ds = Array.isArray(raw) ? raw : Object.values(raw);
    muc = ds.filter((x) => x && typeof x === 'object').map((it) => Object.fromEntries(KHOA_THIET_BI.map((k) => [k, lay(it, k)])));
  } else if (typeof raw === 'string' && src.pattern && raw.length <= 20000) {
    let re;
    try { re = new RegExp(String(src.pattern)); } catch (e) { return []; }
    const phanCach = src.separator != null ? String(src.separator) : null;
    const phan = phanCach != null ? raw.split(phanCach) : raw.split(/\n|, /);
    muc = phan.map((x) => { const m = re.exec(x.trim()); return m && m.groups ? m.groups : null; }).filter(Boolean);
  }
  return muc.map(chuanHoaThietBi).filter(Boolean).slice(0, 500);
}

/**
 * Mọi nguồn thiết bị: các `sources` khai tay, cộng với `access_points[].clients_sensor` (thuộc tính `clients`, nguồn ZTE).
 * Mỗi nguồn có `node` (tên hộp mà các thiết bị đó thuộc về).
 */
export function layNguon(cfg = {}, states = {}) {
  const ra = [];
  for (const a of cfg.access_points || []) if (a && a.clients_sensor) ra.push({ node: a.name || '', entity: a.clients_sensor, attribute: 'clients' });
  for (const sc of cfg.sources || []) if (sc && typeof sc === 'object') ra.push(sc);
  const ket = ra.map((sc) => ({ node: String(sc.node || ''), devices: phanTichNguon(sc, states) }));
  // Cây thiết bị (topo_sensor): mỗi máy thuộc hộp của cha nó. Hộp = bộ phát cùng tên/IP với nút `ap`, hoặc switch đặt trên đúng cổng đó.
  const cay = layCay(cfg, states);
  if (cay) {
    const hopCua = (id) => {
      const n = cay.nodes.find((x) => x.id === id);
      if (!n || n.kind === 'router') return '';
      if (n.kind === 'ap') {
        const a = (cfg.access_points || []).find((x) => x && (x.name === n.name || (n.ip && (x.ips || []).includes(n.ip))));
        return a ? String(a.name || n.name) : '';
      }
      const w = (cfg.switches || []).find((x) => x && x.port === id);
      return w ? String(w.name || id) : '';
    };
    const theoHop = new Map();
    for (const c of cay.clients) {
      const hop = hopCua(c.parent);
      if (!hop) continue;
      if (!theoHop.has(hop)) theoHop.set(hop, []);
      theoHop.get(hop).push(c);
    }
    for (const [hop, ds] of theoHop) {
      ket.push({ node: hop, devices: ds.map((c) => chuanHoaThietBi({ mac: c.mac, ip: c.ip, name: c.name, band: c.band, rssi: c.rssi, mode: c.mode, rx: c.rx_bps, tx: c.tx_bps })).filter(Boolean) });
    }
  }
  return ket;
}

/**
 * Tốc độ từng thiết bị do chính tích hợp MikroTik đo: mỗi máy là một «thiết bị» của Home Assistant có tracker và hai cảm biến
 * RX, TX (đơn vị tốc độ như kB/s). Nối bằng `entities` (sổ thực thể của hass: entity_id → device_id), không dò theo tên máy.
 * Chỉ nhận cảm biến có đơn vị tốc độ (tổng byte bị bỏ). Trả {mac: {rxRate, txRate}} (bit/giây); thiếu sổ thực thể thì rỗng.
 */
export function tocDoTuThietBi(states = {}, entities = {}) {
  const theoThietBi = new Map();
  for (const [eid, e] of Object.entries(entities || {})) {
    if (!e || !e.device_id || !eid.startsWith('sensor.')) continue;
    const st = (states || {})[eid];
    const a = st ? st.attributes || {} : null;
    if (!a || !DON_VI_BPS[String(a.unit_of_measurement || '').trim().toLowerCase()]) continue;
    const m = /(?:^|[\s_.])(rx|tx)(?:[\s_)(]|$)/i.exec(String(a.friendly_name || eid));
    if (!m) continue;
    const kv = theoThietBi.get(e.device_id) || {};
    kv[m[1].toLowerCase()] = toBps(st.state, a.unit_of_measurement);
    theoThietBi.set(e.device_id, kv);
  }
  // Dự phòng khi hass chưa có sổ thực thể: cảm biến đặt theo tên tracker, dạng sensor.<tên>_rx_<hậu tố> và sensor.<tên>_tx_<hậu tố>
  // (ví dụ device_tracker.cam_phong_khach ↔ sensor.cam_phong_khach_rx_mikrotik). Chỉ nhận đơn vị tốc độ.
  const theoTen = new Map();
  for (const [eid, st] of Object.entries(states || {})) {
    const m = /^sensor\.(.+?)_(rx|tx)(?:_[a-z0-9]+)?$/.exec(eid);
    const a = st && st.attributes;
    if (!m || !a || !DON_VI_BPS[String(a.unit_of_measurement || '').trim().toLowerCase()]) continue;
    const kv = theoTen.get(m[1]) || {};
    kv[m[2]] = toBps(st.state, a.unit_of_measurement);
    theoTen.set(m[1], kv);
  }
  const ra = {};
  for (const [eid, st] of Object.entries(states || {})) {
    if (!eid.startsWith('device_tracker.')) continue;
    const mac = macChuan((st.attributes || {}).mac);
    const e = (entities || {})[eid];
    const kv = (e && e.device_id && theoThietBi.get(e.device_id)) || theoTen.get(eid.slice('device_tracker.'.length));
    if (mac && kv) ra[mac] = { rxRate: kv.rx ?? null, txRate: kv.tx ?? null };
  }
  return ra;
}

/** {mac: {band, rssi, mode, rxRate, txRate}} của mọi nguồn — để hiện băng tần, tín hiệu, tốc độ cạnh thiết bị. */
export function thongTinWifi(cfg = {}, states = {}, entities = {}) {
  const ra = {};
  for (const [mac, v] of Object.entries(tocDoTuThietBi(states, entities))) ra[mac] = { band: '', rssi: null, mode: '', rxRate: v.rxRate, txRate: v.txRate };
  for (const g of layNguon(cfg, states)) {
    // Gộp theo MAC giữa các nguồn: trường nào nguồn sau có giá trị thật thì ghi đè; tốc độ 0 không xoá tốc độ thật của nguồn khác
    // (ví dụ ZTE báo 0, Kid Control của MikroTik báo số đo được).
    for (const c of g.devices) {
      const cu = ra[c.mac] || {};
      const lay = (moi, khoa) => (moi != null && moi !== '' ? moi : cu[khoa] ?? moi);
      const toc = (moi, khoa) => (moi > 0 ? moi : (cu[khoa] > 0 ? cu[khoa] : lay(moi, khoa)));
      ra[c.mac] = { band: lay(c.band, 'band'), rssi: lay(c.rssi, 'rssi'), mode: lay(c.mode, 'mode'), rxRate: toc(c.rxRate, 'rxRate'), txRate: toc(c.txRate, 'txRate') };
    }
  }
  return ra;
}

/**
 * Thiết bị mà nguồn có `node` báo nhưng MikroTik không có trong danh sách (đã ngắt trên MikroTik, hoặc chưa có tracker):
 * thêm vào đúng hộp của nguồn, để số máy của hộp khớp số nguồn báo. Thông số lấy ngay từ nguồn (tên, IP, MAC).
 */
export function thietBiNguonThieu(cfg = {}, states = {}, clients = []) {
  const co = new Set((clients || []).map((c) => macChuan(c.mac)));
  const ra = [];
  for (const g of layNguon(cfg, states)) {
    if (!g.node) continue;
    for (const d of g.devices) {
      if (co.has(d.mac)) continue;
      co.add(d.mac);
      ra.push({ mac: d.mac, ip: d.ip, name: d.name || d.ip || d.mac, online: true, interface: '', source: '', tuNguon: true });
    }
  }
  return ra;
}

/**
 * Giá trị một trường tùy chỉnh {entity, attribute?, extract?, unit?, template?}: lấy trạng thái hoặc thuộc tính,
 * trích bằng regex `extract` (nhóm 1 nếu có), rồi thêm đơn vị hoặc áp `template` ({value}).
 * Không có thực thể/giá trị (unknown, unavailable, rỗng) → null: trường đó ẩn, không chiếm chỗ.
 */
export function giaTriTruong(f, states = {}) {
  if (!f || typeof f !== 'object' || !f.entity) return null;
  const st = (states || {})[f.entity];
  if (!st) return null;
  const raw = f.attribute ? (st.attributes || {})[f.attribute] : st.state;
  if (raw == null || raw === '' || raw === 'unknown' || raw === 'unavailable') return null;
  let v = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  if (f.extract) {
    let re;
    try { re = new RegExp(String(f.extract)); } catch (e) { return null; }
    const m = re.exec(v);
    if (!m) return null;
    v = m[1] != null ? m[1] : m[0];
  }
  if (f.template) v = String(f.template).replace('{value}', v);
  else if (f.unit) v = `${v} ${f.unit}`;
  return v.slice(0, 80);
}

export const KIND_SWITCH = 'switch';
export const KIND_AP = 'ap';

/**
 * Dựng danh sách NÚT TRUNG GIAN từ hai nguồn: cấu hình YAML (`switches`, `access_points`) và nút NGƯỜI DÙNG tự thêm trên card (`userNodes`).
 * Mỗi nút: {key, kind: 'switch'|'ap', name, port (cổng MikroTik nó cắm vào) | parent (khoá nút cha), macs (khai báo rõ), ips, entity, tuDong, nguon}.
 * Khoá: sw-<i>, ap-<i> (YAML) và u-<id> (người dùng).
 */
export function dungNut(cfg = {}, userNodes = [], clients = []) {
  const nut = [];
  (cfg.switches || []).forEach((w, i) => {
    if (!w) return;
    nut.push({ key: `sw-${i}`, kind: KIND_SWITCH, name: w.name || `Switch ${i + 1}`, port: w.port || '', parent: '', macs: (w.macs || []).map(macChuan),
      ips: [], entity: w.entity || '', tuDong: false, nguon: 'cfg', macSensor: w.mac_sensor || '', fields: Array.isArray(w.fields) ? w.fields : [] });
  });
  // Switch nối vào một switch khác: khai `switch: <tên switch cha>`. Không cho tạo vòng (A→B→A).
  (cfg.switches || []).forEach((w, i) => {
    if (!w || !w.switch) return;
    const me = nut.find((n) => n.key === `sw-${i}`);
    const cha = nut.find((n) => n.kind === KIND_SWITCH && n.name === w.switch && n.key !== `sw-${i}`);
    if (!me || !cha) return;
    let x = cha; let vong = false;
    while (x) { if (x.key === me.key) { vong = true; break; } x = x.parent ? nut.find((n) => n.key === x.parent) : null; }
    if (!vong) { me.parent = cha.key; me.port = ''; }
  });
  (cfg.access_points || []).forEach((a, i) => {
    if (!a) return;
    const cha = a.switch ? (nut.find((n) => n.kind === KIND_SWITCH && n.name === a.switch) || {}).key || '' : '';
    nut.push({ key: `ap-${i}`, kind: KIND_AP, name: a.name || `WiFi ${i + 1}`, port: cha ? '' : (a.port || ''), parent: cha,
      macs: (a.macs || []).map(macChuan), ips: a.ips || [], entity: a.entity || '', tuDong: !!a.auto_private_mac, nguon: 'cfg', macSensor: a.mac_sensor || '',
      clientsSensor: a.clients_sensor || '', fields: Array.isArray(a.fields) ? a.fields : [] });
  });
  // Hộp chứa nhiều IP, lồng nhiều tầng. Mỗi hộp: name, ip/mac (gán thiết bị), switch|port (nối vào đâu),
  // children (hộp con khai tay, lồng tiếp được), guest_mac_prefix (máy có tiền tố MAC này tự thành hộp con của hộp).
  const daNhan = new Set();
  const themHop = (h, cha, khoa) => {
    if (!h || typeof h !== 'object') return;
    const hostMac = h.mac ? macChuan(h.mac) : '';
    if (hostMac) daNhan.add(hostMac);
    const con = Array.isArray(h.children) ? h.children : [];
    const tien = h.guest_mac_prefix ? macChuan(h.guest_mac_prefix).replace(/:?$/, ':') : '';
    const box = !!(tien || con.length);
    nut.push({ key: khoa, kind: KIND_SWITCH, name: String(h.name || 'Hộp').slice(0, 60),
      port: cha ? '' : (h.port || ''), parent: cha,
      macs: hostMac ? [hostMac] : [], ips: h.ip ? [String(h.ip)] : [], entity: '', tuDong: false, nguon: 'cfg', macSensor: '', box, fields: Array.isArray(h.fields) ? h.fields : [] });
    con.forEach((c, j) => themHop(c, khoa, `${khoa}.${j}`));
    if (!tien) return;
    for (const c of clients || []) {
      const mac = macChuan(c && c.mac);
      if (!mac.startsWith(tien) || daNhan.has(mac)) continue;
      daNhan.add(mac);
      // Nguồn của LXC/VM: guest_source (tên switch/bộ phát) nếu khai; không thì switch mà host đang nối vào.
      const nguon = h.guest_source ? ((nut.find((n) => n.name === h.guest_source) || {}).key || khoa) : (cha || khoa);
      nut.push({ key: `${khoa}-${mac.replace(/:/g, '')}`, kind: KIND_SWITCH, name: String(c.name || c.ip || mac).slice(0, 60),
        port: '', parent: nguon, macs: [mac], ips: [], entity: '', tuDong: false, nguon: 'cfg', macSensor: '', guest: true, host: khoa });
    }
  };
  (cfg.hosts || []).forEach((h, i) => {
    if (!h || typeof h !== 'object') return;
    const cha = h.switch ? (nut.find((n) => n.kind === KIND_SWITCH && n.name === h.switch) || {}).key || '' : '';
    themHop(h, cha, `host-${i}`);
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
  const nut = dungNut(cfg, userNodes, clients).map((n) => ({
    ...n, clients: [], online: n.entity && states[n.entity] ? states[n.entity].state === 'home' : null
  }));
  // Bộ phát tự báo danh sách máy WiFi của nó: đó là khai báo RÕ (chính xác hơn mọi suy đoán theo cổng).
  // Thiết bị do nguồn khai là khai báo RÕ (chính xác hơn suy đoán theo cổng): vào đúng hộp có tên trùng `node` của nguồn.
  const cacNguon = layNguon(cfg, states);
  for (const n of nut) {
    const ds = cacNguon.filter((g) => g.node && g.node === n.name).flatMap((g) => g.devices.map((d) => d.mac));
    if (ds.length) n.macs = [...n.macs, ...ds];
  }
  // Chính router của bộ phát (ví dụ ZTE 172.16.10.24) là thiết bị của nó, không phải máy LAN: lấy IP từ cảm biến chính
  // sensor.<tên>_connected_devices → sensor.<tên> (thuộc tính host).
  for (const n of nut) {
    if (!n.clientsSensor) continue;
    const goc = states[n.clientsSensor.replace(/_connected_devices$/, '')];
    const host = goc && goc.attributes && goc.attributes.host;
    if (host && !n.ips.includes(String(host))) n.ips = [...n.ips, String(host)];
  }
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
  const nguonCfg = {};
  for (const [k, v] of Object.entries(cfg.device_sources || {})) if (typeof v === 'string') nguonCfg[macChuan(k)] = v;
  for (const c of clients) {
    const mac = macChuan(c.mac);
    let dich = null;
    if (nguonCfg[mac]) dich = nut.find((n) => !n.guest && n.name === nguonCfg[mac]) || null;
    if (!dich && mac in gan) { const g = gan[mac]; dich = theoKey.get(typeof g === 'number' ? `ap-${g}` : g) || null; }
    if (!dich) dich = nut.find((n) => n.macs.includes(mac) || (c.ip && n.ips.includes(c.ip))) || null;
    if (!dich && macRiengTu(c.mac)) dich = nut.find((n) => n.kind === KIND_AP && n.tuDong && goc(n).sau.has(mac)) || null;
    if (!dich) dich = nut.find((n) => n.kind === KIND_SWITCH && n.sau.has(mac)) || null;
    // Thiết bị chưa có nguồn (không phải WiFi trên MikroTik): vào nguồn mặc định khai trong default_source (tên switch/bộ phát).
    if (!dich && cfg.default_source && !/^(wlan|wifi|wl)/i.test(c.interface || '')) dich = nut.find((n) => !n.guest && n.name === cfg.default_source) || null;
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

/** Danh sách cổng trong bridge: chỉ giữ tên cổng hợp lệ (ether2, sfp1…); không phải danh sách thì null (dùng mặc định). */
export function lamSachCong(v) {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x) => typeof x === 'string' && /^[a-z0-9_-]{1,20}$/i.test(x)))];
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
    else if (typeof g === 'string' && /^[a-z0-9_.-]{1,80}$/i.test(g)) ra[macChuan(k)] = g;
  }
  return ra;
}

// ───────────────────────── chữ hiển thị ─────────────────────────

const CHU = {
  vi: {
    title: 'Mạng LAN MikroTik', internet: 'Internet', router: 'MikroTik', ports: 'Cổng', tunnels: 'Đường hầm VPN', clients: 'Thiết bị',
    wgTitle: 'VPN WireGuard', batTay: 'bắt tay', truoc: 'trước', tong: 'tổng', vpnRa: 'đi ra Internet', vpnVao: 'truy cập từ xa',
    tabSoDo: 'Sơ đồ', tabRouter: 'MikroTik', sectRouter: 'Router', sectWan: 'WAN', sectBridge: 'Bridge LAN', sectPorts: 'Cổng',
    sectVpn: 'VPN WireGuard', loai: 'loại', ngat: 'ngắt', lenCuoi: 'lên lần cuối', updateNew: 'có bản mới', wired: 'Máy có dây', wireless: 'Máy WiFi', noWan: 'Chưa có WAN',
    subTong: 'Tổng quan', subWan: 'WAN', subBridge: 'Bridge LAN', dangChay: 'đang chạy', ngung: 'ngưng', isp: 'Nhà mạng', cong: 'Cổng', ipAddr: 'Địa chỉ IP',
    mtuLbl: 'MTU', lastUpLbl: 'Lên lần cuối', nowRate: 'Tốc độ hiện tại', totalTx: 'Tổng đã truyền', linkDowns: 'Lần rớt link', bridgeNote: 'Các cổng trong bridge cùng một mạng LAN: thiết bị cắm vào các cổng này giao tiếp được với nhau, trừ khi có VLAN hoặc bộ lọc chặn.', chonCong: 'Cổng trong bridge', chuaCo: 'Chưa có dữ liệu', kieu: 'Kiểu', chiTietCong: 'Chi tiết',
    more: 'Xem thêm', none: 'Không có dữ liệu — kiểm tra tiền tố (prefix) và tích hợp MikroTik.',
    up: 'lên', down: 'xuống', online: 'đang kết nối', cpu: 'CPU', ram: 'RAM', uptime: 'Hoạt động', noClients: 'Chưa có thiết bị',
    connected: 'đã kết nối', disconnected: 'ngắt', assign: 'Gán vào', unassign: 'Bỏ gán', wifiHint: 'MAC riêng tư — thường là máy dùng WiFi',
    edit: 'Thêm switch / bộ phát WiFi', addTitle: 'Thêm nút vào sơ đồ', name: 'Tên', kind: 'Loại', kSwitch: 'Switch', kAp: 'Bộ phát WiFi',
    parent: 'Cắm vào', hint: 'Gợi ý: máy MAC riêng tư sau cổng này vào nhóm WiFi', add: 'Thêm', del: 'Xoá nút', close: 'Đóng',
    empty: 'Chưa có nút nào. Thêm switch hoặc bộ phát WiFi của bạn ở trên.'
  },
  en: {
    title: 'MikroTik LAN', internet: 'Internet', router: 'MikroTik', ports: 'Ports', tunnels: 'VPN tunnels', clients: 'Devices',
    wgTitle: 'VPN WireGuard', batTay: 'handshake', truoc: 'ago', tong: 'total', vpnRa: 'exit via Internet', vpnVao: 'remote access',
    tabSoDo: 'Diagram', tabRouter: 'MikroTik', sectRouter: 'Router', sectWan: 'WAN', sectBridge: 'Bridge LAN', sectPorts: 'Ports',
    sectVpn: 'VPN WireGuard', loai: 'type', ngat: 'down', lenCuoi: 'last up', updateNew: 'new version', wired: 'Wired devices', wireless: 'WiFi devices', noWan: 'No WAN',
    subTong: 'Overview', subWan: 'WAN', subBridge: 'Bridge LAN', dangChay: 'running', ngung: 'stopped', isp: 'ISP', cong: 'Port', ipAddr: 'IP address',
    mtuLbl: 'MTU', lastUpLbl: 'Last link up', nowRate: 'Current rate', totalTx: 'Total transferred', linkDowns: 'Link drops', bridgeNote: 'Ports in the bridge share one LAN: devices on these ports can reach each other unless VLANs or filters block it.', chonCong: 'Ports in bridge', chuaCo: 'No data', kieu: 'Type', chiTietCong: 'Details',
    more: 'Show more', none: 'No data — check the prefix and the MikroTik integration.',
    up: 'up', down: 'down', online: 'online', cpu: 'CPU', ram: 'RAM', uptime: 'Uptime', noClients: 'No devices',
    connected: 'connected', disconnected: 'down', assign: 'Assign to', unassign: 'Unassign', wifiHint: 'Private MAC — usually a WiFi device',
    edit: 'Add switch / WiFi access point', addTitle: 'Add a node to the diagram', name: 'Name', kind: 'Type', kSwitch: 'Switch', kAp: 'WiFi access point',
    parent: 'Plugged into', hint: 'Hint: private-MAC devices behind this port join the WiFi group', add: 'Add', del: 'Remove node', close: 'Close',
    empty: 'No nodes yet. Add your switch or WiFi access point above.'
  }
};

// ───────────────────────── dựng HTML (thuần: nhận mô hình, trả chuỗi; mọi dữ liệu ngoài qua esc) ─────────────────────────

const chamTrangThai = (ok) => `<span class="cham ${ok === true ? 'ok' : ok === false ? 'loi' : 'chua'}"></span>`;
const thanh = (bps, toiDa = 1e8) => bps > 0 ? `<span class="thanh"><i style="width:${Math.min(100, Math.round((bps / toiDa) * 100))}%"></i></span>` : '';

function dongLuuLuong(rx, tx, t) {
  if (!(rx > 0) && !(tx > 0)) return '';
  return `<span class="lu"><b title="${esc(t.down)}">↓</b>${esc(fmtRate(rx))} <b title="${esc(t.up)}">↑</b>${esc(fmtRate(tx))}</span>`;
}

/** Danh sách nơi có thể cắm một nút: cổng của MikroTik + các nút đã có. */
export function noiCam(model, nut) {
  return [
    ...[...model.bridges, ...model.ports, ...model.ppp].map((g) => ({ value: `port:${g.id}`, label: `${g.label} (${g.name})` })),
    ...nut.map((n) => ({ value: `node:${n.key}`, label: n.name }))
  ];
}

/** Hộp MikroTik trong sơ đồ: hộp WAN (cùng kiểu hộp nhà mạng), hộp BRIDGE LAN chứa các hộp cổng ether (cùng kiểu hàng cổng). */
function renderRouterBox(model, cfg, ui, t, hangCong) {
  const { wan, wanCong, ports, bridges } = model;
  const macDinh = ports.map((g) => g.name);
  const thanhVien = Array.isArray(ui.bridge) ? ui.bridge : (Array.isArray(cfg.bridge_ports) ? cfg.bridge_ports : macDinh);
  const br = bridges[0];
  const wanHtml = !wan ? '' : `<div class="nut-node wan-hop" data-anchor="isp-trong">
      <div class="nt">${chamTrangThai(wan.running)}<span>${esc(cfg.isp_name || wan.comment || t.internet)}</span> <span class="phu">${esc(wanCong ? wanCong.name : wan.name)}</span></div>
      ${dongLuuLuong(wan.rx, wan.tx, t)}
    </div>`;
  const bridgeHtml = `<div class="hop-con bridge-khoi" data-members="${esc(thanhVien.join(','))}">
      ${br ? `<div class="bridge-tieu">${chamTrangThai(br.running)}<span class="ten">${esc((cfg.port_names || {})[br.id] || br.name || 'BridgeLAN')}</span>${dongLuuLuong(br.rx, br.tx, t)}${thanh(br.rx + br.tx)}</div>` : ''}
      ${ports.map((g) => `<div class="chon-dong"><label class="chon-cong"><input type="checkbox" data-port="${esc(g.name)}" ${thanhVien.includes(g.name) ? 'checked' : ''}></label>${hangCong(g)}</div>`).join('') || `<div class="phu">${esc(t.chuaCo)}</div>`}
    </div>`;
  return `${wanHtml}${bridgeHtml}`;
}

export function renderHtml(model, cfg = {}, ui = {}, now = Date.now()) {
  const t = CHU[cfg.language === 'en' ? 'en' : 'vi'];
  const tieuDe = cfg.title || t.title;
  const tenRouter = cfg.router_name || t.router;
  const { core, wan, ports, bridges, ppp, tunnels, clients } = model;
  const coHop = (cfg.switches || []).length + (cfg.access_points || []).length + (cfg.hosts || []).length > 0;
  // Không có dữ liệu MikroTik nào (chỉ dùng bộ phát/nguồn khác): bỏ hẳn cột router, không để hộp rỗng chiếm chỗ.
  const coMik = !!(wan || ports.length || bridges.length || ppp.length || tunnels.length || (model.vpn && (model.vpn.ifaces.length || model.vpn.peers.length)) || core.cpu != null || core.ram != null || core.uptime || core.version);
  const coDuLieu = !!(wan || ports.length || bridges.length || tunnels.length || clients.length || core.cpu != null || coHop);
  if (!coDuLieu) return `<ha-card><div class="vo">${esc(t.none)}</div></ha-card>`;

  const online = clients.filter((c) => c.online).length;
  let ds = [...clients, ...thietBiNguonThieu(cfg, ui.states || {}, clients)];
  if (cfg.hide_offline_clients) ds = ds.filter((c) => c.online);
  const gioiHan = Math.max(5, Number(ui.limit || cfg.client_limit || 30));
  // Gán tay cũ đã lưu trong trình duyệt không còn dùng; nguồn của thiết bị khai bằng device_sources trong cấu hình.
  const { nut, nhom } = phanNhom(ds, cfg, {}, ui.states || {}, ui.nodes || []);
  ui.nhomVe = { nut, nhom };            // _veDuong vẽ đường nối theo ĐÚNG nhóm này (có cả máy lấy từ cây thiết bị), không tự ghép lại
  let conLai = cfg.show_clients === false ? 0 : gioiHan;
  // Giới hạn số máy hiện: hộp có nguồn riêng (bộ phát WiFi…) được chia chỗ trước, phần còn lại (LAN, switch mặc định) lấy phần dư.
  const uuTien = (g) => (g.node && g.node.kind === KIND_AP ? 0 : 1);
  const hienTheo = new Map();
  for (const g of [...nhom].sort((x, y) => uuTien(x) - uuTien(y))) {
    const hien = g.clients.slice(0, Math.max(0, conLai)); conLai -= hien.length; hienTheo.set(g, hien);
  }
  const nhomHien = nhom.filter((g) => g.clients.length || g.node).map((g) => ({ ...g, hien: hienTheo.get(g) }));
  const hienClients = nhomHien.flatMap((g) => g.hien);

  const hangCong = (g) => `
    <div class="hang" data-anchor="cong-${esc(g.key)}" data-name="${esc(String(g.name || '').toLowerCase().replace(/\s+/g, '_'))}" data-ids="${esc([g.id, g.name].map((x) => String(x).toLowerCase().replace(/\s+/g, '_')).join(' '))}" data-luu="${esc(Math.round(g.rx + g.tx))}" title="${esc(g.name)} · ${esc(g.type)} · ${esc(g.comment)}">
      ${chamTrangThai(g.running)}<span class="ten">${esc(g.label)}</span>${dongLuuLuong(g.rx, g.tx, t)}${thanh(g.rx + g.tx)}
    </div>`;
  const hangWg = (h) => `
    <div class="hang ham ${h.connected ? '' : 'off'}" title="${esc(h.name)}">
      ${chamTrangThai(h.connected)}<span class="ten">${esc(h.name)}</span>${h.batTay != null ? `<span class="lu">${esc(t.batTay)} ${esc(Math.round(h.batTay))} s ${esc(t.truoc)}</span>` : ''}${h.rxTong > 0 || h.txTong > 0 ? `<span class="lu">↓ ${esc(fmtBytes(h.rxTong))} ↑ ${esc(fmtBytes(h.txTong))}</span>` : ''}
    </div>`;
  // Khối VPN: giao diện WireGuard (mik-hk, wg-home…) với các peer của nó. Peer có 0.0.0.0/0 là đường đi RA Internet
  // qua VPN (router mượn Internet); còn lại là truy cập TỪ XA vào mạng nhà.
  const chuan = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const vpnHtml = (() => {
    const { ifaces, peers } = model.vpn || { ifaces: [], peers: [] };
    if (!ifaces.length && !peers.length) return '';
    const daGan = new Set();
    const khoi = ifaces.map((g) => {
      const tatCa = peers.filter((p) => chuan(p.iface) === chuan(g.id) || chuan(p.iface) === chuan(g.name));
      tatCa.forEach((p) => daGan.add(p.id));
      // Không bật (giao diện tắt, hoặc peer không kết nối) thì ẩn, không chiếm chỗ.
      if (g.running === false) return '';
      const ps = tatCa.filter((p) => p.connected);
      const raNet = tatCa.some((p) => /0\.0\.0\.0\/0/.test(p.allowed || ''));
      return `<div class="vpn-khoi ${raNet ? 'ra' : 'vao'}">
        <div class="hang vpn-cong">${chamTrangThai(g.running)}<span class="ten">${esc(g.label)}</span><span class="lu">${esc(raNet ? t.vpnRa : t.vpnVao)}</span>${dongLuuLuong(g.rx, g.tx, t)}</div>
        ${ps.map(hangWg).join('')}
      </div>`;
    }).join('');
    const leLoi = peers.filter((p) => !daGan.has(p.id) && p.connected);
    if (!khoi && !leLoi.length) return '';
    return `<div class="tieu-nhom">${esc(t.wgTitle)}</div>${khoi}${leLoi.map(hangWg).join('')}`;
  })();
  const hangHam = (h) => `
    <div class="hang" data-anchor="ham-${esc(h.id)}" data-luu="${esc(Math.round(h.rx + h.tx))}">
      ${chamTrangThai(h.connected)}<span class="ten">${esc(h.name)}</span><span class="lu">${esc(h.connected ? t.connected : t.disconnected)}</span>${dongLuuLuong(h.rx, h.tx, t)}
    </div>`;
  const wifi = thongTinWifi(cfg, ui.states || {}, ui.entities || {});
  const chipWifi = (c) => {
    const w = wifi[macChuan(c.mac)];
    if (!w) return '';
    const nhan = [w.band, w.rssi != null ? `${w.rssi} dBm` : ''].filter(Boolean).join(' · ');
    // Tốc độ TX/RX của máy WiFi: hiện như cổng (↓ ↑ và thanh), tách khỏi băng tần/RSSI.
    const toc = (w.rxRate || 0) > 0 || (w.txRate || 0) > 0 ? `${dongLuuLuong(w.rxRate || 0, w.txRate || 0, t)}${thanh((w.rxRate || 0) + (w.txRate || 0))}` : '';
    return `${nhan ? `<span class="goi">${esc(nhan)}</span>` : ''}${toc}`;
  };
  const chipTruong = (ds) => (Array.isArray(ds) ? ds : []).map((f) => {
    const v = giaTriTruong(f, ui.states || {});
    return v == null ? '' : `<span class="goi">${esc(f.label ? `${f.label} ` : '')}${esc(v)}</span>`;
  }).join('');
  const tenMay = (c) => (cfg.device_names || {})[macChuan(c.mac)] || c.name;
  // Thông số của một thiết bị (băng tần, tốc độ, trường khai thêm, IP, MAC): dùng chung cho hàng thiết bị và tiêu đề hộp to.
  const thongSoMay = (c) => `${chipWifi(c)}${chipTruong((cfg.device_fields || {})[macChuan(c.mac)])}${c.interface && !/bridge/i.test(c.interface) ? `<span class="goi" title="MikroTik">${esc(c.interface)}</span>` : ''}${macRiengTu(c.mac) ? `<span class="goi" title="${esc(t.wifiHint)}">◌</span>` : ''}<span class="lu">${esc(c.mac)}</span><span class="lu">${esc(c.ip)}</span>`;
  const hangMay = (c) => `
    <div class="hang may ${c.online ? '' : 'off'}" title="${esc(c.mac)} · ${esc(c.interface)} · ${esc(c.source)}">
      ${chamTrangThai(c.online)}<span class="ten">${esc(tenMay(c))}</span>${thongSoMay(c)}
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

  // ── Bố cục cây (đúng sơ đồ): Router → cổng → switch/bộ phát → thiết bị ──
  const chuanCong = (x) => String(x || '').toLowerCase().replace(/\s+/g, '_').replace(/["\\]/g, '');
  const hienMay = cfg.show_clients !== false;
  // Nút switch/bộ phát: tên, số máy, máy của nó, rồi các nút con (ví dụ bộ phát WiFi nối dưới switch).
  // Mỗi thiết bị là một hộp nhỏ riêng; nét đứt đi từ nguồn đã cài tới hộp đó.
  const hopMay = (c, anchor) => `<div class="dev-hop" data-anchor="${anchor}" data-luu="0">${hangMay(c)}</div>`;
  const nhomCua = (n) => nhomHien.find((x) => x.node && x.node.key === n.key);
  // Chủ hộp: thiết bị trùng IP của hộp (ZTE tự lấy IP từ cảm biến chính); hộp to không khai IP thì lấy thiết bị đầu tiên.
  const chuCua = (n) => {
    const g = nhomCua(n);
    if (!g || !hienMay || n.guest) return null;
    return g.hien.find((c) => c.ip && n.ips.includes(c.ip)) || (n.box ? g.hien[0] || null : null);
  };
  // Số LXC/VM nằm trong hộp to (tính cả các hộp lồng bên trong).
  const demCon = (n) => nut.filter((x) => x.host === n.key).reduce((t, x) => t + (x.guest ? 1 : demCon(x)), 0);
  const nutCon = (n, inner = '') => {
    const g = nhomCua(n);
    if (n.guest) {
      const c = g && g.hien[0] ? g.hien[0] : { mac: n.macs[0], name: n.name, ip: '', online: true, interface: '', source: '' };
      return hopMay(c, `n-${esc(n.key)}`);
    }
    const chu = chuCua(n);
    const sl = g ? g.clients.length - (chu && !n.box ? 1 : 0) : 0;
    const truong = chipTruong(n.fields);
    // Thiết bị của chính hộp (Proxmox, ZTE…) là «chủ hộp»: thông số nằm ngay tiêu đề hộp to, không có hàng riêng, không tính vào số máy.
    const rows = n.box && g && hienMay ? g.hien.filter((c) => c !== chu).map(hangMay).join('') : '';
    const thongSoChu = chu ? thongSoMay(chu) : (n.box && (n.ips.length || n.macs.length) ? `<span class="lu">${esc(n.macs[0] || '')}</span><span class="lu">${esc(n.ips[0] || '')}</span>` : '');
    const xoaNut = n.nguon === 'user' && ui.edit ? `<button class="xoa" data-act="xoa-nut" data-key="${esc(n.key)}" title="${esc(t.del)}" aria-label="${esc(t.del)}">×</button>` : '';
    const dem = ` (${esc(n.box ? demCon(n) : sl)})`;
    return `<div class="nut-con ${n.kind === KIND_AP ? 'ap' : 'sw'}${n.box ? ' hop-chua' : ''}" data-anchor="n-${esc(n.key)}" data-luu="0">
      <div class="tieu-nhom nhom-may${n.box || chu ? ' hop-tieu-to' : ''}">${n.kind === KIND_AP || chu ? chamTrangThai(chu ? chu.online : n.online) : ''}${n.kind === KIND_AP ? '📶 ' : n.box ? '' : '⇄ '}<span class="ten-hop">${esc(n.name)}${dem}</span>${thongSoChu}${xoaNut}</div>
      ${truong ? `<div class="hop-dong">${truong}</div>` : ''}
      ${rows}
      ${inner}
    </div>`;
  };
  // Cây: hộp cha bên trái; cấp dưới và thiết bị gắn vào nó nằm cột bên phải, mỗi thiết bị một hộp nhỏ.
  const treeNode = (n) => {
    if (n.guest) return `<div class="tree-hang">${nutCon(n)}</div>`;
    // LXC/VM (host = hộp này) nằm TRONG hộp host; nét đứt vẫn đi từ nguồn của chúng.
    const trong = nut.filter((x) => x.host === n.key).map(treeNode).join('');
    const kids = nut.filter((x) => x.parent === n.key && !x.host);
    const g = nhomCua(n);
    const chu = chuCua(n);
    const devs = (!n.box && g && hienMay) ? g.hien.filter((c) => c !== chu).map((c) => hopMay(c, `dev-${esc(macChuan(c.mac))}`)) : [];
    const phai = [...kids.map(treeNode), ...devs].join('');
    return `<div class="tree-hang">${nutCon(n, trong)}${phai ? `<div class="tree-con">${phai}</div>` : ''}</div>`;
  };
  // Một nhánh = một cổng MikroTik, bên phải là các nút cắm vào cổng đó.
  const nhanhCong = (pt) => {
    const con = nut.filter((n) => !n.parent && chuanCong(n.port) === chuanCong(pt.name));
    return con.map(treeNode).join('');
  };
  const chuaGan = nhomHien.filter((g) => !g.node && g.hien.length);
  // Nút gắn vào một cổng không hiện trên card (hoặc chưa khai cổng): vẫn hiện ở cuối, không mất.
  const mocCon = nut.filter((n) => !n.parent && !ports.some((pt) => chuanCong(n.port) === chuanCong(pt.name)));

  return `<ha-card>
    <div class="dau"><div class="td">${esc(tieuDe)}</div>
      ${clients.length ? `<div class="chip">${esc(online)}/${esc(clients.length)} ${esc(t.online)}</div>` : ''}
      ${cfg.show_clients === false ? '' : `<button class="chip nut-sua" data-act="sua" aria-pressed="${ui.edit ? 'true' : 'false'}" title="${esc(t.edit)}" aria-label="${esc(t.edit)}">✎</button>`}</div>
    ${bang}
    <div class="cay${coMik ? '' : ' mot-cot'}">
      <svg class="duong" aria-hidden="true"></svg>
      ${coMik ? `<div class="cot cot-router">
        <div class="nut-node chinh" data-anchor="router">
          <div class="nt"><span>${esc(tenRouter)}</span>${ds.length ? ` <span class="phu">(${esc(ds.length)})</span>` : ''}</div>
          <div class="phu">${core.cpu != null ? `${esc(t.cpu)} ${esc(core.cpu)}%` : ''} ${core.ram != null ? `· ${esc(t.ram)} ${esc(core.ram)}%` : ''}</div>
          <div class="phu">${core.uptime ? `${esc(t.uptime)} ${esc(fmtUptime(core.uptime, now))}` : ''} ${core.version ? `· RouterOS ${esc(core.version)}` : ''}</div>
        ${renderRouterBox(model, cfg, ui, t, hangCong)}
        </div>
        ${vpnHtml}
      </div>` : ''}
      <div class="cot cot-cong">
        ${coMik ? '' : `<div class="tieu-nhom">${esc(t.clients)} (${esc(ds.length)})</div>`}
        ${ports.map(nhanhCong).join('')}
        ${mocCon.map(treeNode).join('')}
        ${chuaGan.length ? `<div class="nut-con sw"><div class="tieu-nhom nhom-may">LAN (${esc(chuaGan.reduce((x, g) => x + g.clients.length, 0))})</div>${chuaGan.map((g) => g.hien.map(hangMay).join('')).join('')}</div>` : ''}
        ${!ports.length && !chuaGan.length && !mocCon.length ? `<div class="phu">${esc(t.noClients)}</div>` : ''}
        ${nutXemThem}
      </div>
    </div>
  </ha-card>`;
}

export const CSS = `
:host{display:block}
.goc{display:contents}
ha-card{padding:12px 14px;overflow:hidden;color:var(--primary-text-color)}
.vo{padding:16px;color:var(--secondary-text-color)}
.dau{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px}
.td{font-weight:600;font-size:16px;margin-right:auto}
.chip{padding:3px 10px;border-radius:999px;border:1px solid var(--divider-color,#ddd);font-size:12px;background:var(--secondary-background-color,transparent);color:inherit;font-family:inherit}
.nut-sua{cursor:pointer}
.nut-sua[aria-pressed="true"]{background:var(--primary-color);color:#fff;border-color:var(--primary-color)}
.chip b,.lu b{color:var(--primary-color);margin-right:3px}
.cay.mot-cot{grid-template-columns:minmax(0,1fr)}
.cay{position:relative;display:grid;grid-template-columns:minmax(300px,1fr) minmax(0,3fr);gap:24px;align-items:start}
.tree-hang{display:flex;gap:16px;align-items:flex-start;margin-bottom:10px}
.nut-con.hop-chua>.nut-con{margin-top:8px}
.dev-hop{border:1px solid var(--divider-color,#444);border-radius:10px;margin-bottom:6px}
.tree-con{display:grid;grid-template-columns:max-content;justify-content:start;gap:10px;flex:0 1 auto;min-width:0}
.tree-con>*{min-width:0}
.nut-con{border:1px solid var(--divider-color,#444);border-radius:12px;padding:8px 10px}
.nut-con .nhom-may{margin:0 0 6px}
.bridge-tieu{display:flex;align-items:center;gap:6px;font-size:13px;min-width:0}
.bridge-tieu .ten{font-weight:600}
.hop-tieu-to{flex-wrap:wrap;text-transform:none;font-size:13px;letter-spacing:0}
.hop-tieu-to .ten-hop{font-weight:600}
.duong{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:visible}      /* trên các cột (z-index:1), nếu không hộp đè mất đoạn đầu của đường */
.duong path{fill:none;stroke:var(--primary-color,#03a9f4);stroke-linecap:round;opacity:.85}
.duong circle.nguon{fill:var(--primary-color,#03a9f4)}
.duong path.chay{stroke-dasharray:6 8;animation:chay linear infinite}
.duong path.nd{animation:none}
.duong path.nd0{stroke-dasharray:5 6}
.duong path.nd1{stroke-dasharray:2 4}
.duong path.nd2{stroke-dasharray:10 4 2 4}
.duong path.nd3{stroke-dasharray:14 6}
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
.sua input[type=text],.sua select{width:100%;box-sizing:border-box;padding:6px 10px;border-radius:8px;border:1px solid var(--divider-color,#ddd);background:var(--card-background-color,#fff);color:inherit;font:inherit;font-size:13px}
.them{align-self:flex-start;padding:5px 12px;border-radius:8px;border:1px solid var(--divider-color,#ddd);background:none;color:var(--primary-color);cursor:pointer;font:inherit;font-size:12px}
.phu-nut{color:var(--secondary-text-color)}
.sua{display:flex;flex-direction:column;gap:8px;padding:10px 12px;margin-bottom:12px;border:1px dashed var(--divider-color,#ccc);border-radius:12px;max-width:520px}
.sua label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--secondary-text-color)}
.sua label.ngang{flex-direction:row;align-items:center;gap:8px}
.hang-nut{display:flex;gap:8px}
.cot-router .hang .ten,.cot-cong .hang .ten{flex:1 1 auto;min-width:0}
.cot-router .bridge-khoi .chon-dong{display:flex;align-items:center;gap:6px}
.cot-router .bridge-khoi .chon-dong .hang{flex:1;min-width:0}
.cot-router .bridge-khoi .chon-dong input{margin:0}
.hop-con{border:1px solid var(--divider-color,#444);border-radius:10px;padding:6px 8px;margin:6px 0}
.hop-dong{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:.9rem;margin:2px 0}
.tab-con-hang{display:flex;gap:6px;padding:0 12px 10px;flex-wrap:wrap}
.tab-con{padding:5px 12px;border-radius:12px;border:1px solid var(--divider-color,#555);background:transparent;color:var(--secondary-text-color);cursor:pointer;font:inherit;font-size:.9rem}
.tab-con.on{color:var(--primary-color,#03a9f4);border-color:var(--primary-color,#03a9f4)}
.kv{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px dashed var(--divider-color,#444);font-size:.92rem}
.kv span{color:var(--secondary-text-color)}
.wan-khoi,.bridge-khoi{display:flex;flex-direction:column;gap:6px}
.wan-tieu{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:1.05rem}
.wan-luoi{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 18px}
.cong-chon{display:flex;flex-wrap:wrap;gap:8px 14px}
.chon-cong{display:inline-flex;gap:6px;align-items:center;padding:0}
.chon-goc{margin-left:auto}
.cong-the{margin-bottom:8px}
.cong-chi-tiet{margin:0 0 4px 26px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0 18px}
.hang-chip{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.chi-tiet{margin:-2px 0 6px 26px;font-size:.85rem}
.vpn-khoi{margin:4px 0 8px 10px;padding-left:8px;border-left:2px solid var(--divider-color,#555)}
.vpn-khoi.ra{border-left-style:dashed}
.vpn-cong .ten{font-weight:600}
@media (max-width:820px){.cay{grid-template-columns:1fr;gap:12px}.duong{display:none}}
@media (max-width:820px){.cay{grid-template-columns:minmax(0,1fr)}.cot-router{min-width:0}.tree-hang{flex-direction:column;gap:8px}.tree-con{grid-template-columns:minmax(0,1fr);width:100%}.tree-con>*{min-width:0}.hang{flex-wrap:wrap}.nut-con,.dev-hop{max-width:100%;box-sizing:border-box}}
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
      this._ui = { limit: 0, gan: {}, nodes: [], states: {}, edit: false, form: { name: '', kind: 'switch', parent: '', tuDong: false } };
      this._chuKy = ''; this._hass = null; this._daNapUserData = false;
      this._lanVe = 0; this._hen = null; this._can = false; this._hienThi = true; this._goc = null;
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
        this._ui.bridge = lamSachCong(luu.bridge);
      } catch (e) { this._ui.nodes = []; this._ui.gan = {}; this._ui.bridge = null; }
      this._chuKy = '';
      this._ve(true);
    }

    set hass(h) {
      this._hass = h;
      if (!this._daNapUserData && h && typeof h.callWS === 'function') this._napUserData();
      this._henVe();
    }

    getCardSize() { return 8; }

    static getStubConfig() { return { type: 'custom:mikrotik-topo-lan-card', title: 'Mạng LAN MikroTik' }; }
    static getConfigElement() { return document.createElement('mikrotik-topo-lan-card-editor'); }

    /** Đồng bộ theo người dùng HA (giữa các thiết bị): lỗi thì giữ bản trong trình duyệt. */
    async _napUserData() {
      this._daNapUserData = true;
      try {
        const r = await this._hass.callWS({ type: 'frontend/get_user_data', key: this._khoaLuu });
        const v = r && r.value;
        if (v && typeof v === 'object') {
          this._ui.nodes = lamSachNutNguoiDung(v.nodes); this._ui.gan = lamSachGan(v.gan); this._ui.bridge = lamSachCong(v.bridge);
          try { localStorage.setItem(this._khoaLuu, JSON.stringify({ nodes: this._ui.nodes, gan: this._ui.gan })); } catch (e) { /* bỏ qua */ }
          this._ve(true);
        }
      } catch (e) { /* không có user data: dùng localStorage */ }
    }

    _luu() {
      const goi = { nodes: this._ui.nodes, gan: this._ui.gan, bridge: this._ui.bridge || null };
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

    /** Home Assistant gán `hass` mỗi khi BẤT KỲ thực thể nào đổi: chỉ vẽ lại tối đa mỗi `refresh_ms` (mặc định 1 giây) và chỉ khi card đang được xem. */
    _henVe() {
      if (!this._dangXem()) { this._can = true; return; }
      const doi = tinhDoiVe(Date.now(), this._lanVe, this._cfg.refresh_ms);
      if (doi <= 0) { this._ve(); return; }
      if (!this._hen) this._hen = setTimeout(() => { this._hen = null; if (this._dangXem()) this._ve(); else this._can = true; }, doi);
    }

    _dangXem() { return this._hienThi !== false && !(typeof document !== 'undefined' && document.hidden); }

    _ve(ep = false) {
      if (!this._hass) return;
      this._lanVe = Date.now(); this._can = false;
      const cfgHl = autoCauHinh(this._hass.states, this._cfg);
      const model = discover(this._hass.states, cfgHl);
      this._ui.clients = model.clients;
      this._ui.cfgHl = cfgHl;           // cấu hình đã thêm hộp tự dựng từ cây: nơi vẽ đường và nút «gán» phải dùng đúng bản này
      this._ui.states = this._hass.states;
      this._ui.entities = this._hass.entities || {};
      const chuKy = JSON.stringify([model, this._ui.limit, this._cfg.language, this._ui.gan, this._ui.nodes, this._ui.edit,
        (this._cfg.access_points || []).map((a) => (a && a.entity && this._hass.states[a.entity] ? this._hass.states[a.entity].state : '')),
        [this._cfg, ...(this._cfg.switches || []), ...(this._cfg.access_points || [])]
          .map((x) => (x && x.mac_sensor && this._hass.states[x.mac_sensor] ? JSON.stringify(this._hass.states[x.mac_sensor].attributes) : '')),
        (this._cfg.access_points || []).map((x) => (x && x.clients_sensor && this._hass.states[x.clients_sensor] ? JSON.stringify(this._hass.states[x.clients_sensor].attributes) : '')),
        // Mọi thực thể cấu hình nhắc tới (sources, fields…) và tốc độ từng máy: đổi giá trị thì vẽ lại.
        [...new Set(JSON.stringify(this._cfg).match(/"(?:entity|clients_sensor|mac_sensor|topo_sensor)":"[^"]+"/g) || [])]
          .map((k) => { const st = this._hass.states[k.split('":"')[1].slice(0, -1)]; return st ? [st.state, st.attributes] : null; }),
        thongTinWifi(cfgHl, this._hass.states, this._ui.entities)]);
      if (!ep && chuKy === this._chuKy) return;
      this._chuKy = chuKy;
      this._docForm();
      if (!this._goc) {                 // CSS chỉ nạp một lần; mỗi lần vẽ chỉ thay phần nội dung
        this.shadowRoot.innerHTML = `<style>${CSS}</style><div class="goc"></div>`;
        this._goc = this.shadowRoot.querySelector('.goc');
      }
      this._goc.innerHTML = renderHtml(model, cfgHl, this._ui);
      this._gan();
      requestAnimationFrame(() => this._veDuong());
    }

    _gan() {
      const r = this.shadowRoot;
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
      r.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => { this._ui.rtab = b.dataset.rtab; this._ve(true); }));
      r.querySelectorAll('[data-port]').forEach((c) => c.addEventListener('change', () => {
        const hien = new Set(String((r.querySelector('.bridge-khoi') || {}).dataset ? r.querySelector('.bridge-khoi').dataset.members : '').split(',').filter(Boolean));
        if (c.checked) hien.add(c.dataset.port); else hien.delete(c.dataset.port);
        this._ui.bridge = [...hien];
        this._luu();
        this._ve(true);
      }));
      r.querySelectorAll('[data-act="xoa-nut"]').forEach((b) => b.addEventListener('click', () => {
        const key = b.dataset.key; const id = String(key).replace(/^u-/, '');
        // nút cha bị xoá → nút con mất cha (không treo); gán tay vào nút đã xoá bị bỏ
        this._ui.nodes = this._ui.nodes.filter((u) => u.id !== id).map((u) => (u.parent === `node:${key}` ? { ...u, parent: '' } : u));
        for (const [mac, g] of Object.entries(this._ui.gan)) if (g === key) delete this._ui.gan[mac];
        this._luu(); this._ve(true);
      }));
      r.querySelectorAll('[data-act="gan"]').forEach((nut) => nut.addEventListener('click', () => {
        const mac = nut.dataset.mac;
        const { nut: ds } = phanNhom([], this._ui.cfgHl || this._cfg, {}, this._hass.states, this._ui.nodes);
        const g = this._ui.gan[mac];
        const hien = g == null ? -1 : ds.findIndex((n) => n.key === (typeof g === 'number' ? `ap-${g}` : g));
        if (hien + 1 >= ds.length) delete this._ui.gan[mac]; else this._ui.gan[mac] = ds[hien + 1].key;
        this._luu(); this._ve(true);
      }));
    }

    _veDuong() {
      const cay = this.shadowRoot.querySelector('.cay');
      const svg = this.shadowRoot.querySelector('.duong');
      if (!cay || !svg || !this._dangXem() || getComputedStyle(svg).display === 'none') return;
      const goc = cay.getBoundingClientRect();
      const hinh = new Map();                         // mỗi phần tử chỉ đo một lần (một hộp là nguồn của nhiều đường)
      const diem = (el, canh) => {
        let r = hinh.get(el);
        if (!r) { r = el.getBoundingClientRect(); hinh.set(el, r); }
        return { x: (canh === 'phai' ? r.right : r.left) - goc.left, y: r.top + r.height / 2 - goc.top };
      };
      const neo = new Map();
      cay.querySelectorAll('[data-anchor]').forEach((e) => neo.set(e.dataset.anchor, e));
      const tim = (a) => neo.get(a) || null;
      // Tên RouterOS (ether2) là tên dùng trong cấu hình và bảng MAC: khớp đúng tên trước, rồi mới tới id thực thể.
      const timCong = (ten) => {
        const k = String(ten || '').toLowerCase().replace(/\s+/g, '_').replace(/["\\]/g, '');
        if (!k) return null;
        return cay.querySelector(`[data-name="${k}"]`) || cay.querySelector(`[data-ids~="${k}"]`);
      };
      const dongChay = this._cfg.animate_lines !== false && !mayYeu();      // máy yếu hoặc animate_lines:false: nét đứt tĩnh, không chạy
      const duong = [];
      const noi = (tu, den, nd = '') => {
        if (!tu || !den) return;
        const p = diem(tu, 'phai'); const q = diem(den, 'trai');
        if (q.x <= p.x) return;          // đích không nằm bên phải nguồn (ví dụ cổng nằm trong hộp router): không có gì để nối
        const luu = Number(den.dataset.luu || tu.dataset.luu || 0);
        const rong = luu > 0 ? Math.min(4, 1.8 + Math.log10(luu + 1) / 2.2) : 1.8;
        const giay = dongChay && !nd && luu > 0 ? Math.max(0.5, 4 - Math.log10(luu + 1) * 0.5) : 0;
        const mx = (p.x + q.x) / 2;
        const lop = nd ? `nd ${nd}` : (giay ? 'chay' : 'nd nd0');       // không có lưu lượng: nét đứt tĩnh, không để nét liền mờ
        duong.push(`<path d="M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}" stroke-width="${rong.toFixed(2)}" class="${lop}" style="${giay ? `animation-duration:${giay.toFixed(2)}s` : ''}"/>`);
        duong.push(`<circle class="nguon" cx="${p.x}" cy="${p.y}" r="3.5"/>`);      // chấm ở nguồn: thấy rõ đường đi ra từ cổng/hộp nào
      };
      noi(tim('isp'), tim('router'));
      const { nut, nhom } = this._ui.nhomVe || { nut: [], nhom: [] };
      for (const n of nut) {
        const anh = nut.filter((x) => x.parent && x.parent === n.parent).indexOf(n) % 4;
        // Máy con (LXC/VM) nối bằng nét đứt từ THIẾT BỊ NGUỒN (dòng của máy host trong hộp cha), không từ mép hộp.
        let tu = n.parent ? tim(`n-${n.parent}`) : (n.port ? timCong(n.port) : null);
        const cha = n.parent ? nut.find((x) => x.key === n.parent) : null;
        if (cha && cha.box && tu) { const nguon = tu.querySelector(':scope > .hang.may'); if (nguon) tu = nguon; }
        noi(tu, tim(`n-${n.key}`), n.parent ? `nd${anh < 0 ? 0 : anh}` : '');
      }
      for (const g of nhom) {
        if (!g.node || g.node.guest || g.node.box) continue;
        g.clients.forEach((c, k) => {
          const el = tim(`dev-${macChuan(c.mac)}`);
          if (el) noi(tim(`n-${g.node.key}`), el, `nd${k % 4}`);
        });
      }
      cay.querySelectorAll('[data-anchor^="cong-"], [data-anchor^="ham-"]').forEach((el) => noi(tim('router'), el));
      svg.innerHTML = duong.join('');
    }

    connectedCallback() {
      // Đổi kích thước: gộp về một lần vẽ đường mỗi khung hình
      this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
        if (this._rafDuong) return;
        this._rafDuong = requestAnimationFrame(() => { this._rafDuong = 0; this._veDuong(); });
      }) : null;
      if (this._ro) this._ro.observe(this);
      // Card ngoài màn hình hoặc tab ẩn: không vẽ; hiện lại thì vẽ ngay bản mới nhất
      this._io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => {
        this._hienThi = es.some((e) => e.isIntersecting);
        if (this._hienThi && this._can) this._ve();
      }) : null;
      if (this._io) this._io.observe(this);
      this._khiHienTab = () => { if (!document.hidden && this._can && this._hienThi !== false) this._ve(); };
      document.addEventListener('visibilitychange', this._khiHienTab);
    }

    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
      if (this._io) this._io.disconnect();
      if (this._khiHienTab) document.removeEventListener('visibilitychange', this._khiHienTab);
      if (this._hen) { clearTimeout(this._hen); this._hen = null; }
      if (this._rafDuong) { cancelAnimationFrame(this._rafDuong); this._rafDuong = 0; }
    }
  }


  /* Trình sửa bằng giao diện (Sửa thẻ): hai tab. Hợp đồng với Home Assistant: setConfig, gán .hass,
     phát «config-changed». Nút Lưu/Huỷ là của Home Assistant. */
  class MikrotikTopoLanCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
      this._tab = 'cau-hinh';
      this._built = false;
    }

    setConfig(config) {
      this._config = { ...(config || {}) };
      this._build();
      this._fill();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._built) this._fillDatalist();
    }

    _doi(config) {
      this._config = config;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    }

    _build() {
      if (this._built) return;
      this._built = true;
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--divider-color, #444); margin-bottom: 14px; }
          .tab { padding: 9px 14px; border: 0; background: transparent; cursor: pointer; color: var(--secondary-text-color);
            font: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px; }
          .tab.on { color: var(--primary-color, #03a9f4); border-bottom-color: var(--primary-color, #03a9f4); }
          .nhom { border: 1px solid var(--divider-color, #444); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
          .nhom h4 { margin: 0 0 10px; font-size: 1rem; font-weight: 600; }
          .dong { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 10px; align-items: center; margin-bottom: 10px; }
          .dong label { color: var(--secondary-text-color); font-size: .9rem; }
          input, select { width: 100%; box-sizing: border-box; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--divider-color, #555);
            background: var(--card-background-color, #1c1c1c); color: var(--primary-text-color); font: inherit; }
          .muc { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; margin-bottom: 8px; align-items: center; }
          .muc.ap { grid-template-columns: 1fr 1fr 1fr 1fr auto; }
          button.them { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--primary-color, #03a9f4); background: transparent;
            color: var(--primary-color, #03a9f4); cursor: pointer; font: inherit; }
          button.xoa { padding: 6px 9px; border-radius: 8px; border: 1px solid var(--error-color, #db4437); background: transparent;
            color: var(--error-color, #db4437); cursor: pointer; font: inherit; }
          .ghi { color: var(--secondary-text-color); font-size: .85rem; margin: 0 0 8px; }
        </style>
        <div class="tabs">
          <button class="tab" data-tab="cau-hinh">Cấu hình</button>
          <button class="tab" data-tab="thiet-bi">Thiết bị</button>
        </div>
        <div class="noi-dung"></div>
        <datalist id="dl-cam-bien"></datalist>
        <datalist id="dl-cong"></datalist>
        <datalist id="dl-clients"></datalist>`;
      this.shadowRoot.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
        this._tab = b.dataset.tab;
        this._fill();
      }));
    }

    _fill() {
      if (!this._built) return;
      this.shadowRoot.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === this._tab));
      const nd = this.shadowRoot.querySelector('.noi-dung');
      nd.innerHTML = this._tab === 'thiet-bi' ? this._htmlThietBi() : this._htmlCauHinh();
      this._gan();
      this._fillDatalist();
    }

    _truong(khoa, nhan, kieu = 'text', goiY = '') {
      const gia = this._config[khoa] ?? '';
      return `<div class="dong"><label>${nhan}</label><input data-khoa="${khoa}" type="${kieu}" value="${String(gia).replace(/"/g, '&quot;')}" placeholder="${goiY}"></div>`;
    }

    _htmlCauHinh() {
      return `
        <div class="nhom"><h4>Thẻ</h4>
          ${this._truong('title', 'Tiêu đề', 'text', 'Mạng LAN MikroTik')}
          ${this._truong('isp_name', 'Tên đường ra Internet', 'text', 'Internet')}
          ${this._truong('client_limit', 'Số máy hiện ban đầu', 'number', '30')}
          <div class="dong"><label>Ngôn ngữ</label>
            <select data-khoa="language"><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
          <div class="dong"><label>Hiện danh sách máy</label>
            <input data-khoa="show_clients" type="checkbox" ${this._config.show_clients === false ? '' : 'checked'}></div>
        </div>
        <div class="nhom"><h4>Nguồn dữ liệu</h4>
          <p class="ghi">Để trống thì card tự nhận từ tích hợp MikroTik Extended.</p>
          ${this._truong('prefix', 'Tiền tố thực thể', 'text', 'tự nhận')}
          ${this._truong('wan', 'Cổng WAN (nếu khác PPPoE)', 'text', 'pppoe-out1')}
          ${this._truong('mac_sensor', 'Cảm biến bảng MAC theo cổng', 'text', 'sensor.mikrotik_bang_mac')}
          ${this._truong('zte_port', 'Cổng cắm bộ phát ZTE', 'text', 'ether2')}
          ${this._truong('zte_name', 'Tên bộ phát ZTE', 'text', 'ZTE WiFi')}
        </div>`;
    }

    _thietBi() {
      const st = (this._hass && this._hass.states) || {};
      return Object.keys(st)
        .filter((id) => id.startsWith('device_tracker.') && /mikrotik/i.test((st[id].attributes || {}).attribution || ''))
        .map((id) => { const a = st[id].attributes; return { mac: macChuan(a.mac || ''), name: a.host_name || a.friendly_name || id }; })
        .filter((d) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(d.mac))
        .sort((x, y) => x.name.localeCompare(y.name));
    }

    _htmlThietBi() {
      const ds = Array.isArray(this._config.switches) ? this._config.switches : [];
      const aps = Array.isArray(this._config.access_points) ? this._config.access_points : [];
      const hs = Array.isArray(this._config.hosts) ? this._config.hosts : [];
      const nguon = this._config.device_sources || {};
      const tens = [...ds, ...aps, ...hs].map((x) => x && x.name).filter(Boolean);
      const devs = this._thietBi();
      const phanNguon = `
        <div class="nhom"><h4>Nguồn của thiết bị</h4>
          <p class="ghi">Chọn nguồn cho từng thiết bị. Thiết bị chưa chọn sẽ vào default_source (nếu có).</p>
          ${devs.map((d) => `<div class="dong"><label>${esc(d.name)}</label><select data-dev="${esc(d.mac)}"><option value="">— bỏ gán —</option>${tens.map((n) => `<option value="${esc(n)}" ${nguon[d.mac] === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`).join('') || '<p class="ghi">Chưa có thiết bị MikroTik.</p>'}
        </div>`;
      return `
        <div class="nhom"><h4>Switch</h4>
          <p class="ghi">Switch nối với một cổng MikroTik. Máy nào nằm sau cổng của switch sẽ hiện trong switch đó.</p>
          ${ds.map((m, i) => `<div class="muc">
              <input data-loai="switches" data-i="${i}" data-truong="name" value="${String(m.name || '').replace(/"/g, '&quot;')}" placeholder="Tên switch">
              <input data-loai="switches" data-i="${i}" data-truong="port" list="dl-cong" value="${String(m.port || '').replace(/"/g, '&quot;')}" placeholder="cổng, ví dụ ether3">
              <input data-loai="switches" data-i="${i}" data-truong="mac_sensor" list="dl-cam-bien" value="${String(m.mac_sensor || '').replace(/"/g, '&quot;')}" placeholder="cảm biến MAC (tuỳ chọn)">
              <button class="xoa" data-xoa="switches" data-i="${i}">Xoá</button></div>`).join('')}
          <button class="them" data-them="switches">+ Thêm switch</button>
        </div>
        <div class="nhom"><h4>Bộ phát WiFi</h4>
          ${aps.map((m, i) => `<div class="muc ap">
              <input data-loai="access_points" data-i="${i}" data-truong="name" value="${String(m.name || '').replace(/"/g, '&quot;')}" placeholder="Tên bộ phát">
              <input data-loai="access_points" data-i="${i}" data-truong="port" list="dl-cong" value="${String(m.port || '').replace(/"/g, '&quot;')}" placeholder="cổng cắm">
              <input data-loai="access_points" data-i="${i}" data-truong="clients_sensor" list="dl-clients" value="${String(m.clients_sensor || '').replace(/"/g, '&quot;')}" placeholder="cảm biến clients">
              <input data-loai="access_points" data-i="${i}" data-truong="mac_sensor" list="dl-cam-bien" value="${String(m.mac_sensor || '').replace(/"/g, '&quot;')}" placeholder="cảm biến MAC (tuỳ chọn)">
              <button class="xoa" data-xoa="access_points" data-i="${i}">Xoá</button></div>`).join('')}
          <button class="them" data-them="access_points">+ Thêm bộ phát</button>
        </div>
        ${phanNguon}`;
    }

    _gan() {
      const root = this.shadowRoot;
      root.querySelectorAll('[data-dev]').forEach((sel) => sel.addEventListener('change', () => {
        const map = { ...(this._config.device_sources || {}) };
        if (sel.value) map[sel.dataset.dev] = sel.value; else delete map[sel.dataset.dev];
        this._doi(capNhatCauHinh(this._config, 'device_sources', Object.keys(map).length ? map : undefined));
      }));
      root.querySelectorAll('.noi-dung [data-khoa]').forEach((el) => {
        const sk = el.dataset.khoa;
        if (el.tagName === 'SELECT') el.value = this._config[sk] || 'vi';
        el.addEventListener('change', () => {
          const gia = el.type === 'checkbox' ? el.checked : (el.type === 'number' && el.value !== '' ? Number(el.value) : el.value.trim());
          // Mặc định là hiện: bỏ khoá khi tick, đặt false khi bỏ tick.
          if (sk === 'show_clients') this._doi(capNhatCauHinh(this._config, sk, gia ? undefined : false));
          else this._doi(capNhatCauHinh(this._config, sk, gia));
        });
      });
      root.querySelectorAll('[data-loai]').forEach((el) => el.addEventListener('change', () => {
        this._doi(suaMuc(this._config, el.dataset.loai, Number(el.dataset.i), el.dataset.truong, el.value.trim()));
      }));
      root.querySelectorAll('[data-them]').forEach((b) => b.addEventListener('click', () => {
        const khoa = b.dataset.them;
        const muc = khoa === 'switches' ? { name: 'Switch mới', port: '' } : { name: 'Bộ phát mới', port: '' };
        this._doi(themMuc(this._config, khoa, muc));
      }));
      root.querySelectorAll('[data-xoa]').forEach((b) => b.addEventListener('click', () => {
        this._doi(xoaMuc(this._config, b.dataset.xoa, Number(b.dataset.i)));
      }));
    }

    _fillDatalist() {
      if (!this._hass || !this.shadowRoot) return;
      const st = this._hass.states || {};
      const ids = Object.keys(st);
      const cong = new Set();
      for (const id of ids) {
        const m = /^switch\.(.+?)_port_(.+)_port$/.exec(id);
        if (m && st[id].attributes && st[id].attributes.name) cong.add(st[id].attributes.name);
        if (m && /^ether|^sfp|^wlan|^bridge/i.test(m[2])) cong.add(m[2]);
      }
      const fill = (idDl, danhSach) => {
        const dl = this.shadowRoot.getElementById(idDl);
        if (dl) dl.innerHTML = danhSach.map((v) => `<option value="${String(v).replace(/"/g, '&quot;')}"></option>`).join('');
      };
      fill('dl-cong', [...cong]);
      fill('dl-cam-bien', ids.filter((id) => id.startsWith('sensor.') && /mac|port|bang/i.test(id)));
      fill('dl-clients', ids.filter((id) => id.startsWith('sensor.') && st[id].attributes && Array.isArray(st[id].attributes.clients)));
    }
  }


  if (!customElements.get('mikrotik-topo-lan-card')) customElements.define('mikrotik-topo-lan-card', MikrotikTopoLanCard);
  if (!customElements.get('mikrotik-topo-lan-card-editor')) customElements.define('mikrotik-topo-lan-card-editor', MikrotikTopoLanCardEditor);
  // Ghi phiên bản vào console (như các card khác): để biết trình duyệt/app đang chạy bản nào, tránh nhầm với bản cũ còn trong bộ nhớ đệm.
  console.info(`%c MIKROTIK-TOPO-LAN-CARD %c v${VERSION} `, 'color:#fff;background:#03a9f4;font-weight:700', 'color:#03a9f4;font-weight:700');
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'mikrotik-topo-lan-card', name: 'MikroTik Topo LAN Card',
    description: 'Sơ đồ mạng LAN của router MikroTik (đọc tích hợp MikroTik, không cần SNMP)', preview: false
  });
}
