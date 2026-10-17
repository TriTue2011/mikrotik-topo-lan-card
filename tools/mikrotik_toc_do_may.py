#!/usr/bin/env python3
"""In ra tốc độ vào/ra TỪNG MÁY do MikroTik đo (Kid Control) dưới dạng JSON: {"clients": [{"mac", "ip", "name", "rx_rate", "tx_rate"}, …]} (bit/giây).

MikroTik Extended không có lưu lượng theo máy; Kid Control của RouterOS có (`/ip kid-control device`: rate-down, rate-up theo MAC).
Cần bật Kid Control trên router (chỉ ĐỌC từ phía công cụ này): `/ip kid-control add name=cả-nhà mon=0s-1d tue=0s-1d wed=0s-1d thu=0s-1d fri=0s-1d sat=0s-1d sun=0s-1d`.
rx_rate = máy tải xuống (rate-down), tx_rate = máy tải lên (rate-up). Chỉ dùng thư viện chuẩn; dùng chung lớp API với mikrotik_bridge_hosts.py.

Ví dụ:  MIKROTIK_PASSWORD='…' python3 mikrotik_toc_do_may.py --host 192.168.88.1 --port 8729 --tls --insecure --user docdulieu
Tài khoản chỉ quyền `read` + `api`; mật khẩu CHỈ đọc từ biến môi trường MIKROTIK_PASSWORD.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mikrotik_bridge_hosts as api  # noqa: E402

_DON_VI = {"": 1, "k": 1e3, "m": 1e6, "g": 1e9}


def bps(gia_tri) -> int:
    """'1200', '1.5Mbps', '512kbps' → bit/giây; không hiểu thì 0."""
    m = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)\s*([kmg]?)(?:bps|b/s)?\s*", str(gia_tri or ""), re.I)
    return int(float(m.group(1)) * _DON_VI[m.group(2).lower()]) if m else 0


def thiet_bi(muc: list[dict]) -> list[dict]:
    """Bản ghi Kid Control → danh sách máy; bỏ bản ghi không có MAC hợp lệ."""
    ra = []
    for m in muc:
        mac = (m.get("mac-address") or "").upper()
        if not re.fullmatch(r"([0-9A-F]{2}:){5}[0-9A-F]{2}", mac):
            continue
        ra.append({"mac": mac, "ip": m.get("ip-address", ""), "name": m.get("name", ""),
                   "rx_rate": bps(m.get("rate-down")), "tx_rate": bps(m.get("rate-up"))})
    return ra


def lay(host: str, port: int, user: str, password: str, tls: bool, insecure: bool, timeout: float = 10.0) -> dict:
    s = api.mo_ket_noi(host, port, tls, insecure, timeout)
    try:
        api.dang_nhap(s, user, password)
        return {"clients": thiet_bi(api.chay_lenh(s, "/ip/kid-control/device/print"))}
    finally:
        s.close()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--host", required=True)
    ap.add_argument("--port", type=int, default=0, help="mặc định 8728 (hoặc 8729 khi --tls)")
    ap.add_argument("--user", required=True)
    ap.add_argument("--tls", action="store_true", help="API-SSL (8729)")
    ap.add_argument("--insecure", action="store_true", help="không kiểm chứng chỉ (chỉ với --tls)")
    a = ap.parse_args(argv)
    mk = os.environ.get("MIKROTIK_PASSWORD", "")
    if not mk:
        print("thiếu biến môi trường MIKROTIK_PASSWORD", file=sys.stderr)
        return 2
    try:
        print(json.dumps(lay(a.host, a.port or (8729 if a.tls else 8728), a.user, mk, a.tls, a.insecure), ensure_ascii=False))
    except (OSError, EOFError, PermissionError, RuntimeError, ValueError) as e:
        print(f"lỗi: {type(e).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
