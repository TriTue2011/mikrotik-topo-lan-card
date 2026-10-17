#!/usr/bin/env python3
"""In ra bảng «MAC học được theo cổng» của bridge MikroTik dưới dạng JSON: {"ether2": ["AA:BB:…", …], …}.

Dùng cho card (access_points[].mac_sensor): MikroTik biết MAC nào nằm sau cổng cắm bộ phát WiFi (ví dụ ZTE), nên không cần
SNMP của bộ phát. Chỉ ĐỌC (lệnh /interface/bridge/host/print). Chỉ dùng thư viện chuẩn.

Ví dụ:  MIKROTIK_PASSWORD='…' python3 mikrotik_bridge_hosts.py --host 192.168.88.1 --port 8729 --tls --user docdulieu
Nên tạo tài khoản riêng quyền `read` + `api` (không `write`), và hạn chế theo địa chỉ IP của Home Assistant.
Mật khẩu CHỈ đọc từ biến môi trường MIKROTIK_PASSWORD (không nhận qua tham số dòng lệnh để khỏi lộ trong danh sách tiến trình).
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import sys


def ma_hoa_do_dai(n: int) -> bytes:
    if n < 0x80:
        return bytes([n])
    if n < 0x4000:
        return (n | 0x8000).to_bytes(2, "big")
    if n < 0x200000:
        return (n | 0xC00000).to_bytes(3, "big")
    raise ValueError("từ quá dài")


def ma_hoa_cau(tu: list[str]) -> bytes:
    return b"".join(ma_hoa_do_dai(len(t.encode())) + t.encode() for t in tu) + b"\x00"


def _doc_du(s, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        phan = s.recv(n - len(buf))
        if not phan:
            raise EOFError("router đóng kết nối")
        buf += phan
    return buf


def doc_do_dai(s) -> int:
    b = _doc_du(s, 1)[0]
    if b < 0x80:
        return b
    if b < 0xC0:
        return ((b & 0x3F) << 8) | _doc_du(s, 1)[0]
    if b < 0xE0:
        x = _doc_du(s, 2)
        return ((b & 0x1F) << 16) | (x[0] << 8) | x[1]
    raise ValueError("độ dài không hỗ trợ")


def doc_cau(s) -> list[str]:
    tu: list[str] = []
    while True:
        n = doc_do_dai(s)
        if n == 0:
            return tu
        tu.append(_doc_du(s, n).decode(errors="replace"))


def chay_lenh(s, lenh: str) -> list[dict]:
    s.sendall(ma_hoa_cau([lenh]))
    ra: list[dict] = []
    while True:
        cau = doc_cau(s)
        if not cau:
            continue
        if cau[0] == "!re":
            muc = {}
            for t in cau[1:]:
                if t.startswith("=") and t.count("=") >= 2:
                    khoa, _, gia_tri = t[1:].partition("=")
                    muc[khoa] = gia_tri
            ra.append(muc)
        elif cau[0] == "!done":
            return ra
        else:
            raise RuntimeError(f"router báo lỗi: {' '.join(cau)[:120]}")


def dang_nhap(s, user: str, password: str) -> None:
    s.sendall(ma_hoa_cau(["/login", f"=name={user}", f"=password={password}"]))
    cau = doc_cau(s)
    if not cau or cau[0] != "!done":
        raise PermissionError("đăng nhập router không thành công")


def mac_theo_cong(hosts: list[dict]) -> dict[str, list[str]]:
    """Gom MAC theo cổng vật lý; bỏ bản ghi của chính router (local=true) và bản ghi không có cổng."""
    ra: dict[str, list[str]] = {}
    for h in hosts:
        cong, mac = h.get("on-interface"), (h.get("mac-address") or "").upper()
        if not cong or not mac or h.get("local") == "true":
            continue
        ra.setdefault(cong, []).append(mac)
    return {k: sorted(set(v)) for k, v in sorted(ra.items())}


def lay(host: str, port: int, user: str, password: str, tls: bool, insecure: bool, timeout: float = 10.0) -> dict[str, list[str]]:
    raw = socket.create_connection((host, port), timeout=timeout)
    if tls:
        ctx = ssl.create_default_context()
        if insecure:  # router thường dùng chứng chỉ tự ký; chỉ bật khi bạn chấp nhận rủi ro đường truyền nội bộ
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        s = ctx.wrap_socket(raw, server_hostname=host)
    else:
        s = raw
    s.settimeout(timeout)
    try:
        dang_nhap(s, user, password)
        return mac_theo_cong(chay_lenh(s, "/interface/bridge/host/print"))
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
        print(f"lỗi: {type(e).__name__}", file=sys.stderr)  # không in nội dung lỗi: có thể chứa tên đăng nhập
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
