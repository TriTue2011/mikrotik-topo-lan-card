/*!
 * MikroTik Topo LAN Card — sơ đồ mạng LAN của router MikroTik trong Home Assistant.
 * Đọc thẳng thực thể của tích hợp MikroTik (Mikrotik Router / MikroTik Extended): KHÔNG cần SNMP.
 * Ý tưởng sơ đồ cây lấy cảm hứng từ doanlong1412/snmp-topo-lan-card (MIT); mã viết lại cho MikroTik.
 * Giấy phép: MIT.
 */

export const VERSION = '0.1.0';

// ───────────────────────── tiện ích thuần (kiểm thử được, không cần trình duyệt) ─────────────────────────

/** Thoát ký tự HTML. MỌI chuỗi từ mạng (tên máy, ghi chú cổng…) phải đi qua đây trước khi chèn vào HTML. */
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

/**
 * Khám phá thực thể MikroTik từ `states` (đối tượng {entity_id: {state, attributes}}).
 * Quy ước tên của tích hợp: sensor.<tiền_tố>_(port|bridge|ppp)_<id>_(rx|tx), binary_sensor.<tiền_tố>_…_connection,
 * sensor.<tiền_tố>_core_* và device_tracker.* có attribution «Mikrotik».
 */
export function discover(states, cfg = {}) {
  const P = reEsc(cfg.prefix || 'mikrotik_router');
  const reLuuLuong = new RegExp(`^sensor\\.${P}_(port|bridge|ppp)_(.+)_(rx|tx)$`);
  const reWg = new RegExp(`^sensor\\.${P}_wireguard_(.+)_(rx|tx)$`);
  const reKetNoi = new RegExp(`^binary_sensor\\.${P}_(port|bridge|ppp)_(.+)_connection$`);
  const reWgNoi = new RegExp(`^binary_sensor\\.${P}_wireguard_(.+)_connected$`);
  const giaoDien = new Map();
  const duongHam = new Map();
  const lay = (loai, id) => {
    const k = `${loai}:${id}`;
    if (!giaoDien.has(k)) giaoDien.set(k, { key: k, id, kind: loai, name: id, comment: '', running: null, type: '', rx: 0, tx: 0 });
    return giaoDien.get(k);
  };
  const hầm = (id) => {
    if (!duongHam.has(id)) duongHam.set(id, { id, name: id, connected: null, rx: 0, tx: 0 });
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
    } else if ((m = reKetNoi.exec(eid))) {
      const gd = lay(m[1], m[2]);
      gd.running = on(s.state);
    } else if ((m = reWg.exec(eid))) {
      const h = hầm(m[1]);
      h[m[2]] = toBps(s.state, a.unit_of_measurement);
      h.name = (a.friendly_name || '').replace(/^.*WireGuard\s+/i, '').replace(/\s+(RX|TX)$/i, '') || h.name;
    } else if ((m = reWgNoi.exec(eid))) {
      hầm(m[1]).connected = on(s.state);
    } else if (eid.startsWith('device_tracker.') && /mikrotik/i.test(a.attribution || '')) {
      may.push({
        name: a.host_name || a.friendly_name || eid, ip: a.ip || '', mac: a.mac || '',
        interface: a.interface || '', online: s.state === 'home', source: a.source || ''
      });
    }
  }
  const lõi = (hau) => (states || {})[`sensor.${cfg.prefix || 'mikrotik_router'}_core_${hau}`];
  const so = (s) => (s && isFinite(Number(s.state)) ? Number(s.state) : null);
  const capNhat = (states || {})[`update.${cfg.prefix || 'mikrotik_router'}_core_routeros_update`];
  const core = {
    cpu: so(lõi('cpu_load')), ram: so(lõi('memory_usage')), hdd: so(lõi('hdd_usage')),
    uptime: lõi('uptime') ? lõi('uptime').state : '', wired: so(lõi('wired_clients')), wireless: so(lõi('wireless_clients')),
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
  const ports = tatCa.filter((g) => g.kind === 'port' && g !== wan && !an.has(g.id)).map(hienThi);
  const bridges = tatCa.filter((g) => g.kind === 'bridge' && !an.has(g.id)).map(hienThi);
  const pppKhac = tatCa.filter((g) => g.kind === 'ppp' && g !== wan && !an.has(g.id)).map(hienThi);
  return {
    core, wan: wan ? hienThi(wan) : null, ports, bridges, ppp: pppKhac,
    tunnels: [...duongHam.values()].filter((h) => !an.has(h.id)),
    clients: may.sort((x, y) => (y.online - x.online) || x.name.localeCompare(y.name))
  };
}

/** MAC «riêng tư» (bit 0x02 của byte đầu): điện thoại/máy bật địa chỉ ngẫu nhiên — dấu hiệu CẤU TRÚC (không phải danh sách tên) của máy dùng WiFi. */
export function macRiengTu(mac) {
  const m = /^([0-9a-f]{2})[:-]/i.exec(String(mac || ''));
  return !!m && (parseInt(m[1], 16) & 2) === 2;
}

const macChuan = (m) => String(m || '').toLowerCase().replace(/-/g, ':');

/** MAC của các máy sau một cổng, lấy từ thuộc tính của một cảm biến (xem tools/mikrotik_bridge_hosts.py): {cổng: [MAC…]}. Không có → rỗng. */
export function macTuCamBien(ap, states) {
  const cb = ap && ap.mac_sensor && states ? states[ap.mac_sensor] : null;
  if (!cb || !cb.attributes) return [];
  const ds = cb.attributes[ap.mac_attr || ap.port];
  return Array.isArray(ds) ? ds.filter((m) => typeof m === 'string') : [];
}

/**
 * Chia thiết bị thành nhóm theo ĐIỂM PHÁT WiFi. MikroTik chỉ thấy MỘT thiết bị (ví dụ bộ phát WiFi ZTE) cắm vào một cổng; mọi máy
 * dùng WiFi sau nó đều hiện là máy trên BridgeLAN, nên phải GÁN: (1) cấu hình `access_points[].macs/ips`, (2) gán tay trong card
 * (`gan`: {mac: chỉ_số_AP}), (3) giao diện mang tên wlan/wifi (khi chính MikroTik phát WiFi). Còn lại: nhóm «có dây».
 */
export function phanNhom(clients, cfg = {}, gan = {}, states = {}) {
  const aps = (cfg.access_points || []).map((a, i) => ({
    i, name: a.name || `WiFi ${i + 1}`, port: a.port || '', entity: a.entity || '',
    macs: new Set([...(a.macs || []), ...macTuCamBien(a, states)].map(macChuan)), ips: new Set(a.ips || []),
    online: a.entity && states[a.entity] ? states[a.entity].state === 'home' : null,
    clients: []
  }));
  const wifiMik = { key: 'mik-wifi', name: 'WiFi (MikroTik)', clients: [] };
  const coDay = { key: 'lan', name: 'LAN', clients: [] };
  for (const c of clients) {
    const mac = macChuan(c.mac);
    const chiSo = mac in gan ? Number(gan[mac])
      : aps.findIndex((a) => a.macs.has(mac) || (c.ip && a.ips.has(c.ip)));
    if (chiSo >= 0 && aps[chiSo]) aps[chiSo].clients.push(c);
    else if (/^(wlan|wifi|wl)/i.test(c.interface || '')) wifiMik.clients.push(c);
    else coDay.clients.push(c);
  }
  return { aps, nhom: [...aps.map((a) => ({ key: `ap-${a.i}`, name: a.name, ap: a, clients: a.clients })),
    ...(wifiMik.clients.length ? [wifiMik] : []), coDay] };
}

// ───────────────────────── chữ hiển thị ─────────────────────────

const CHU = {
  vi: {
    title: 'Mạng LAN MikroTik', internet: 'Internet', router: 'MikroTik', ports: 'Cổng', tunnels: 'Đường hầm VPN', clients: 'Thiết bị',
    search: 'Tìm tên, IP, MAC…', more: 'Xem thêm', none: 'Không có dữ liệu — kiểm tra tiền tố (prefix) và tích hợp MikroTik.',
    up: 'lên', down: 'xuống', online: 'đang kết nối', cpu: 'CPU', ram: 'RAM', uptime: 'Hoạt động', noClients: 'Chưa có thiết bị',
    connected: 'đã kết nối', disconnected: 'ngắt', assign: 'Gán vào', unassign: 'Bỏ gán khỏi', wifiHint: 'MAC riêng tư — thường là máy dùng WiFi'
  },
  en: {
    title: 'MikroTik LAN', internet: 'Internet', router: 'MikroTik', ports: 'Ports', tunnels: 'VPN tunnels', clients: 'Devices',
    search: 'Search name, IP, MAC…', more: 'Show more', none: 'No data — check the prefix and the MikroTik integration.',
    up: 'up', down: 'down', online: 'online', cpu: 'CPU', ram: 'RAM', uptime: 'Uptime', noClients: 'No devices',
    connected: 'connected', disconnected: 'down', assign: 'Assign to', unassign: 'Unassign from', wifiHint: 'Private MAC — usually a WiFi device'
  }
};

// ───────────────────────── dựng HTML (thuần: nhận mô hình, trả chuỗi; mọi dữ liệu ngoài qua esc) ─────────────────────────

const chamTrangThai = (ok) => `<span class="cham ${ok === true ? 'ok' : ok === false ? 'loi' : 'chua'}"></span>`;
const thanh = (bps, toiDa = 1e8) => `<span class="thanh"><i style="width:${Math.min(100, Math.round((bps / toiDa) * 100))}%"></i></span>`;

function dongLuuLuong(rx, tx, t) {
  return `<span class="lu"><b title="${esc(t.down)}">↓</b>${esc(fmtRate(rx))} <b title="${esc(t.up)}">↑</b>${esc(fmtRate(tx))}</span>`;
}

export function renderHtml(model, cfg = {}, ui = {}, now = Date.now()) {
  const t = CHU[cfg.language === 'en' ? 'en' : 'vi'];
  const tieuDe = cfg.title || t.title;
  const tenRouter = cfg.router_name || t.router;
  const { core, wan, ports, bridges, ppp, tunnels, clients } = model;
  const coDuLieu = !!(wan || ports.length || bridges.length || clients.length || core.cpu != null);
  if (!coDuLieu) return `<ha-card><div class="vo">${esc(t.none)}</div></ha-card>`;

  const tong = wan ? { rx: wan.rx, tx: wan.tx } : ports.reduce((s, p) => ({ rx: s.rx + p.rx, tx: s.tx + p.tx }), { rx: 0, tx: 0 });
  const online = clients.filter((c) => c.online).length;
  const loc = String(ui.search || '').trim().toLowerCase();
  let ds = clients;
  if (cfg.hide_offline_clients) ds = ds.filter((c) => c.online);
  if (loc) ds = ds.filter((c) => `${c.name} ${c.ip} ${c.mac}`.toLowerCase().includes(loc));
  const gioiHan = Math.max(5, Number(ui.limit || cfg.client_limit || 30));
  const { nhom } = phanNhom(ds, cfg, ui.gan || {}, ui.states || {});
  let conLai = cfg.show_clients === false ? 0 : gioiHan;
  const nhomHien = nhom.filter((g) => g.clients.length || g.ap).map((g) => {
    const hien = g.clients.slice(0, Math.max(0, conLai)); conLai -= hien.length; return { ...g, hien };
  });
  const hienClients = nhomHien.flatMap((g) => g.hien);

  const hangCong = (g, nhom) => `
    <div class="hang" data-anchor="cong-${esc(g.key)}" data-ids="${esc([g.id, g.name].map((x) => String(x).toLowerCase().replace(/\s+/g, '_')).join(' '))}" data-luu="${esc(Math.round(g.rx + g.tx))}" title="${esc(g.name)} · ${esc(g.type)} · ${esc(g.comment)}">
      ${chamTrangThai(g.running)}<span class="ten">${esc(g.label)}</span>${dongLuuLuong(g.rx, g.tx, t)}${thanh(g.rx + g.tx)}
    </div>`;
  const hangHam = (h) => `
    <div class="hang" data-anchor="ham-${esc(h.id)}" data-luu="${esc(Math.round(h.rx + h.tx))}">
      ${chamTrangThai(h.connected)}<span class="ten">${esc(h.name)}</span><span class="lu">${esc(h.connected ? t.connected : t.disconnected)}</span>${dongLuuLuong(h.rx, h.tx, t)}
    </div>`;
  const aps = (ui.aps || []);
  const nutGan = (c) => {
    if (!aps.length) return '';
    const mac = macChuan(c.mac);
    const hien = mac in (ui.gan || {}) ? Number(ui.gan[mac]) : -1;
    const dich = aps[(hien + 1) % (aps.length + 1)] && hien + 1 < aps.length ? aps[hien + 1] : null;
    const nhan = dich ? `${t.assign} ${dich.name}` : (hien >= 0 ? `${t.unassign} ${aps[hien] ? aps[hien].name : ''}` : '');
    return `<button class="gan" data-act="gan" data-mac="${esc(mac)}" title="${esc(nhan)}" aria-label="${esc(nhan)}">📶</button>`;
  };
  const hangMay = (c) => `
    <div class="hang may ${c.online ? '' : 'off'}" title="${esc(c.mac)} · ${esc(c.interface)} · ${esc(c.source)}">
      ${chamTrangThai(c.online)}<span class="ten">${esc(c.name)}</span>${macRiengTu(c.mac) ? `<span class="goi" title="${esc(t.wifiHint)}">◌</span>` : ''}<span class="lu">${esc(c.ip)}</span>${nutGan(c)}
    </div>`;

  const nutXemThem = ds.length > hienClients.length && cfg.show_clients !== false
    ? `<button class="them" data-act="more">${esc(t.more)} (${esc(ds.length - hienClients.length)})</button>` : '';

  return `<ha-card>
    <div class="dau"><div class="td">${esc(tieuDe)}</div>
      <div class="chip"><b>↓</b>${esc(fmtRate(tong.rx))}</div><div class="chip"><b>↑</b>${esc(fmtRate(tong.tx))}</div>
      <div class="chip">${esc(online)}/${esc(clients.length)} ${esc(t.online)}</div></div>
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
        ${tunnels.length ? `<div class="tieu-nhom">${esc(t.tunnels)}</div>${tunnels.map(hangHam).join('')}` : ''}
      </div>
      ${cfg.show_clients === false ? '' : `<div class="cot cot-may">
        <div class="tieu-nhom">${esc(t.clients)} (${esc(ds.length)})</div>
        <input class="tim" type="search" placeholder="${esc(t.search)}" value="${esc(ui.search || '')}" aria-label="${esc(t.search)}">
        ${nhomHien.length ? nhomHien.map((g) => `<div class="tieu-nhom nhom-may" ${g.ap ? `data-anchor="ap-${esc(g.ap.i)}" data-luu="0"` : ''}>${g.ap ? chamTrangThai(g.ap.online) : ''}${esc(g.name)} (${esc(g.clients.length)})</div>${g.hien.map(hangMay).join('')}`).join('') : `<div class="phu">${esc(t.noClients)}</div>`}
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
.chip{padding:3px 10px;border-radius:999px;border:1px solid var(--divider-color,#ddd);font-size:12px;background:var(--secondary-background-color,transparent)}
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
.gan{flex:0 0 auto;border:0;background:none;cursor:pointer;font-size:13px;opacity:.55;padding:0 2px}
.gan:hover{opacity:1}
.ten{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lu{flex:0 0 auto;font-size:12px;color:var(--secondary-text-color);white-space:nowrap}
.thanh{flex:0 0 38px;height:4px;border-radius:2px;background:var(--divider-color,#e5e5e5);overflow:hidden}
.thanh i{display:block;height:100%;background:var(--primary-color,#03a9f4)}
.cham{flex:0 0 8px;width:8px;height:8px;border-radius:50%;background:#9e9e9e}
.cham.ok{background:var(--success-color,#43a047)}
.cham.loi{background:var(--error-color,#e53935)}
.tim{width:100%;box-sizing:border-box;padding:6px 10px;border-radius:8px;border:1px solid var(--divider-color,#ddd);background:var(--card-background-color,#fff);color:inherit;font:inherit;font-size:13px}
.them{align-self:flex-start;padding:5px 12px;border-radius:8px;border:1px solid var(--divider-color,#ddd);background:none;color:var(--primary-color);cursor:pointer;font:inherit;font-size:12px}
@media (max-width:820px){.cay{grid-template-columns:1fr;gap:12px}.duong{display:none}}
@media (prefers-reduced-motion:reduce){.duong path.chay{animation:none}}
`;

// ───────────────────────── phần tử tuỳ chỉnh (chỉ chạy trong trình duyệt) ─────────────────────────

if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') {
  class MikrotikTopoLanCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._cfg = {}; this._ui = { search: '', limit: 0, gan: {}, aps: [], states: {} }; this._chuKy = ''; this._hass = null;
    }

    setConfig(cfg) {
      if (cfg && cfg.port_names != null && (typeof cfg.port_names !== 'object' || Array.isArray(cfg.port_names))) throw new Error('port_names phải là đối tượng {id: tên}');
      if (cfg && cfg.hide_ports != null && !Array.isArray(cfg.hide_ports)) throw new Error('hide_ports phải là danh sách');
      if (cfg && cfg.access_points != null && !Array.isArray(cfg.access_points)) throw new Error('access_points phải là danh sách');
      this._cfg = { ...(cfg || {}) };
      this._ui.aps = (this._cfg.access_points || []).map((a, i) => ({ i, name: (a && a.name) || `WiFi ${i + 1}` }));
      this._khoaGan = `mikrotik-topo-lan-card:gan:${this._cfg.prefix || 'mikrotik_router'}`;
      try { this._ui.gan = JSON.parse(localStorage.getItem(this._khoaGan) || '{}') || {}; } catch (e) { this._ui.gan = {}; }
      this._chuKy = '';
      this._ve();
    }

    set hass(h) {
      this._hass = h;
      this._ve();
    }

    getCardSize() { return 8; }

    static getStubConfig() { return { type: 'custom:mikrotik-topo-lan-card', prefix: 'mikrotik_router' }; }

    _ve(ep = false) {
      if (!this._hass) return;
      const model = discover(this._hass.states, this._cfg);
      this._ui.states = this._hass.states;
      const chuKy = JSON.stringify([model, this._ui.search, this._ui.limit, this._cfg.language, this._ui.gan,
        (this._cfg.access_points || []).map((a) => a && a.entity && this._hass.states[a.entity] ? this._hass.states[a.entity].state : '')]);
      if (!ep && chuKy === this._chuKy) return;
      this._chuKy = chuKy;
      const dangTim = this.shadowRoot.activeElement && this.shadowRoot.activeElement.classList.contains('tim');
      const vt = dangTim ? this.shadowRoot.activeElement.selectionStart : 0;
      this.shadowRoot.innerHTML = `<style>${CSS}</style>${renderHtml(model, this._cfg, this._ui)}`;
      const o = this.shadowRoot.querySelector('.tim');
      if (o) {
        o.addEventListener('input', () => { this._ui.search = o.value; this._ui.limit = 0; this._ve(true); });
        if (dangTim) { o.focus(); try { o.setSelectionRange(vt, vt); } catch (e) { /* bỏ qua */ } }
      }
      this.shadowRoot.querySelectorAll('[data-act="gan"]').forEach((nut) => nut.addEventListener('click', () => {
        const mac = nut.dataset.mac; const n = this._ui.aps.length;
        const hien = mac in this._ui.gan ? Number(this._ui.gan[mac]) : -1;
        const moi = hien + 1;
        if (moi >= n) delete this._ui.gan[mac]; else this._ui.gan[mac] = moi;
        try { localStorage.setItem(this._khoaGan, JSON.stringify(this._ui.gan)); } catch (e) { /* bỏ qua */ }
        this._ve(true);
      }));
      const them = this.shadowRoot.querySelector('[data-act="more"]');
      if (them) them.addEventListener('click', () => { this._ui.limit = (this._ui.limit || this._cfg.client_limit || 30) + 30; this._ve(true); });
      requestAnimationFrame(() => this._veDuong());
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
      (this._cfg.access_points || []).forEach((a, i) => {
        if (!a || !a.port) return;
        const k = String(a.port).toLowerCase().replace(/\s+/g, '_');
        noi(cay.querySelector(`[data-ids~="${k.replace(/["\\]/g, '')}"]`), tim(`ap-${i}`));
      });
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
