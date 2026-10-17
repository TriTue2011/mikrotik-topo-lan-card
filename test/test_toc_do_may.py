import os, socket, sys, threading, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import mikrotik_bridge_hosts as api
import mikrotik_toc_do_may as t


def router_gia(ban_ghi):
    """Router giả nói giao thức API tối thiểu: chấp nhận đăng nhập rồi trả các bản ghi Kid Control."""
    srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen(1)
    nhan = []

    def phuc_vu():
        c, _ = srv.accept()
        try:
            nhan.append(api.doc_cau(c)); c.sendall(api.ma_hoa_cau(["!done"]))
            nhan.append(api.doc_cau(c))
            for h in ban_ghi:
                c.sendall(api.ma_hoa_cau(["!re"] + [f"={k}={v}" for k, v in h.items()]))
            c.sendall(api.ma_hoa_cau(["!done"]))
        finally:
            c.close(); srv.close()
    th = threading.Thread(target=phuc_vu, daemon=True); th.start()
    return srv.getsockname()[1], nhan, th


class TocDoMay(unittest.TestCase):
    def test_doi_don_vi(self):
        self.assertEqual([t.bps(x) for x in ("1200", "1.5Mbps", "512kbps", "2Gbps", "", None, "hỏng")], [1200, 1500000, 512000, 2000000000, 0, 0, 0])

    def test_chi_giu_ban_ghi_co_mac_hop_le(self):
        ds = t.thiet_bi([
            {"mac-address": "aa:bb:cc:00:00:01", "ip-address": "192.168.88.10", "name": "tivi", "rate-down": "2Mbps", "rate-up": "100kbps"},
            {"mac-address": "khong-phai-mac", "rate-down": "5"},
            {"name": "thiếu MAC"},
        ])
        self.assertEqual(ds, [{"mac": "AA:BB:CC:00:00:01", "ip": "192.168.88.10", "name": "tivi", "rx_rate": 2000000, "tx_rate": 100000}])

    def test_lay_chi_gui_lenh_doc(self):
        cong, nhan, th = router_gia([{"mac-address": "AA:BB:CC:00:00:02", "rate-down": "1000", "rate-up": "0"}])
        kq = t.lay("127.0.0.1", cong, "docdulieu", "x", tls=False, insecure=False)
        th.join(2)
        self.assertEqual(kq["clients"][0]["rx_rate"], 1000)
        self.assertEqual([c[0] for c in nhan], ["/login", "/ip/kid-control/device/print"], "chỉ đăng nhập và đọc")

    def test_main_thieu_mat_khau(self):
        os.environ.pop("MIKROTIK_PASSWORD", None)
        self.assertEqual(t.main(["--host", "127.0.0.1", "--user", "x"]), 2)


if __name__ == "__main__":
    unittest.main()
