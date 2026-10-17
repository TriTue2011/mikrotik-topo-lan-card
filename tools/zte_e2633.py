#!/usr/bin/env python3
"""Bộ ĐỌC dữ liệu của ZTE ZXHN E2633 (bản China Mobile, phần mềm V1.0.4) — chỉ phân tích JSON, KHÔNG đăng nhập, KHÔNG gọi mạng.

Trang quản trị của E2633 trả danh sách thiết bị qua:
    getpage.lua?pid=1005&nextpage=topo_lua.lua&Action=GetALLClients   → {"clientsData": {"1": {...}, ..., "MGET_INST_NUM": N}}
    getpage.lua?pid=1005&nextpage=topo_lua.lua&Action=GetALLAP        → {"apData": {"1": {...}, "MGET_INST_NUM": 1}}
Mỗi thiết bị: MacAddr, IpAddr, HostName, Rssi (dBm), AccessType («1» = 2.4 GHz, «2» = 5 GHz), WirelessMode, AssocTime (giây), TxRateBps/RxRateBps.

Công cụ này đổi JSON đó thành thuộc tính cảm biến cho card (`access_points[].clients_sensor`):
    python3 zte_e2633.py clients.json [ap.json]      → in ra {"clients": [...], "ap": {...}}
Dán nội dung JSON bạn tự lấy từ trình duyệt (tab Network → Response) vào tệp rồi chạy; công cụ không giữ mật khẩu hay cookie nào.
"""
from __future__ import annotations

import json
import re
import sys
from typing import Any

BAND = {"1": "2.4G", "2": "5G"}
MAC_RE = re.compile(r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}$")


def _so_nguyen(v: Any, mac_dinh: int | None = None) -> int | None:
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return mac_dinh


def _muc(du_lieu: Any) -> list[dict]:
    """Các mục «1», «2», … của một khối ({"1": {...}, "MGET_INST_NUM": N}) theo thứ tự số; bỏ khoá khác và mục không phải đối tượng."""
    if not isinstance(du_lieu, dict):
        return []
    ra = []
    for k, v in du_lieu.items():
        if str(k).isdigit() and isinstance(v, dict):
            ra.append((int(k), v))
    return [v for _, v in sorted(ra)]


def phan_tich_thiet_bi(doi_tuong: Any) -> list[dict]:
    """JSON của GetALLClients → danh sách {mac, ip, name, band, rssi, mode, assoc_s, rx_bps, tx_bps}. Mục hỏng (MAC sai khuôn) bị bỏ."""
    goc = doi_tuong.get("clientsData") if isinstance(doi_tuong, dict) else None
    ra: list[dict] = []
    for m in _muc(goc):
        mac = str(m.get("MacAddr", "")).strip().lower()
        if not MAC_RE.match(mac):
            continue
        ra.append({
            "mac": mac,
            "ip": str(m.get("IpAddr", ""))[:45],
            "name": str(m.get("HostName", ""))[:64],
            "band": BAND.get(str(m.get("AccessType", "")).strip(), ""),
            "rssi": _so_nguyen(m.get("Rssi")),
            "mode": str(m.get("WirelessMode", ""))[:16],
            "assoc_s": _so_nguyen(m.get("AssocTime")),
            "rx_bps": _so_nguyen(m.get("RxRateBps"), 0),
            "tx_bps": _so_nguyen(m.get("TxRateBps"), 0),
        })
    return ra


def phan_tich_ap(doi_tuong: Any) -> dict:
    """JSON của GetALLAP → thông tin bộ phát điều khiển (mục đầu tiên), hoặc {}."""
    goc = doi_tuong.get("apData") if isinstance(doi_tuong, dict) else None
    ds = _muc(goc)
    if not ds:
        return {}
    a = ds[0]
    mac = str(a.get("MacAddr", "")).strip().lower()
    return {"mac": mac if MAC_RE.match(mac) else "", "ip": str(a.get("IpAddr", ""))[:45],
            "name": str(a.get("DeviceName", ""))[:64], "firmware": str(a.get("SoftwareVer", ""))[:32]}


def thuoc_tinh_cam_bien(clients_json: Any, ap_json: Any = None) -> dict:
    """Thuộc tính để đặt cho một cảm biến Home Assistant mà card đọc (`clients_sensor`)."""
    return {"clients": phan_tich_thiet_bi(clients_json), "ap": phan_tich_ap(ap_json) if ap_json is not None else {}}


def main(argv: list[str] | None = None) -> int:
    a = sys.argv[1:] if argv is None else argv
    if not a or len(a) > 2:
        print("cách dùng: zte_e2633.py clients.json [ap.json]", file=sys.stderr)
        return 2
    try:
        doc = lambda p: json.load(open(p, encoding="utf-8"))  # noqa: E731
        kq = thuoc_tinh_cam_bien(doc(a[0]), doc(a[1]) if len(a) > 1 else None)
    except (OSError, ValueError):
        print("không đọc được tệp JSON", file=sys.stderr)
        return 1
    print(json.dumps(kq, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
