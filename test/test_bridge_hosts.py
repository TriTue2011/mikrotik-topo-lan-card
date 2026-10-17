import json, os, socket, sys, threading, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import mikrotik_bridge_hosts as t


class MaHoa(unittest.TestCase):
    def test_do_dai_khu_hoi(self):
        class S:  # ổ cắm giả đọc từ bộ đệm
            def __init__(self, b): self.b = b
            def recv(self, n): r, self.b = self.b[:n], self.b[n:]; return r
        for n in (0, 1, 127, 128, 300, 16383, 16384, 100000):
            self.assertEqual(t.doc_do_dai(S(t.ma_hoa_do_dai(n))), n)

    def test_gom_mac_theo_cong(self):
        hosts = [
            {"on-interface": "ether2", "mac-address": "aa:aa:aa:aa:aa:01"},
            {"on-interface": "ether2", "mac-address": "AA:AA:AA:AA:AA:02"},
            {"on-interface": "ether2", "mac-address": "AA:AA:AA:AA:AA:02"},  # trùng
            {"on-interface": "ether3", "mac-address": "BB:BB:BB:BB:BB:01"},
            {"on-interface": "BridgeLAN", "mac-address": "CC:CC:CC:CC:CC:01", "local": "true"},  # của router
            {"mac-address": "DD:DD:DD:DD:DD:01"},  # không có cổng
        ]
        self.assertEqual(t.mac_theo_cong(hosts), {"ether2": ["AA:AA:AA:AA:AA:01", "AA:AA:AA:AA:AA:02"], "ether3": ["BB:BB:BB:BB:BB:01"]})


def router_gia(dung_mat_khau: str):
    """Router giả nói giao thức API RouterOS tối thiểu (không TLS) trên một cổng ngẫu nhiên."""
    srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen(1)
    nhan = []

    def phuc_vu():
        c, _ = srv.accept()
        try:
            cau = t.doc_cau(c); nhan.append(cau)
            ok = f"=password={dung_mat_khau}" in cau
            c.sendall(t.ma_hoa_cau(["!done"]) if ok else t.ma_hoa_cau(["!trap", "=message=invalid user name or password"]))
            if not ok:
                return
            cau = t.doc_cau(c); nhan.append(cau)
            for h in ({"on-interface": "ether2", "mac-address": "AA:AA:AA:AA:AA:01"}, {"on-interface": "ether3", "mac-address": "BB:BB:BB:BB:BB:01"}):
                c.sendall(t.ma_hoa_cau(["!re"] + [f"={k}={v}" for k, v in h.items()]))
            c.sendall(t.ma_hoa_cau(["!done"]))
        finally:
            c.close(); srv.close()
    th = threading.Thread(target=phuc_vu, daemon=True); th.start()
    return srv.getsockname()[1], nhan, th


class VoiRouterGia(unittest.TestCase):
    def test_lay_bang_mac_chi_gui_lenh_doc(self):
        cong, nhan, th = router_gia("mk-dung")
        kq = t.lay("127.0.0.1", cong, "docdulieu", "mk-dung", tls=False, insecure=False)
        th.join(2)
        self.assertEqual(kq, {"ether2": ["AA:AA:AA:AA:AA:01"], "ether3": ["BB:BB:BB:BB:BB:01"]})
        lenh = [c[0] for c in nhan]
        self.assertEqual(lenh, ["/login", "/interface/bridge/host/print"], "chỉ đăng nhập và đọc, không lệnh ghi nào")

    def test_sai_mat_khau_khong_lo_noi_dung(self):
        cong, _, th = router_gia("mk-dung")
        with self.assertRaises(PermissionError):
            t.lay("127.0.0.1", cong, "docdulieu", "mk-sai", tls=False, insecure=False)
        th.join(2)

    def test_main_thieu_mat_khau(self):
        os.environ.pop("MIKROTIK_PASSWORD", None)
        self.assertEqual(t.main(["--host", "127.0.0.1", "--user", "x"]), 2)


if __name__ == "__main__":
    unittest.main()
