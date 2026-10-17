import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import zte_e2633 as z

F = os.path.join(os.path.dirname(__file__), "fixtures")
CLIENTS = json.load(open(os.path.join(F, "zte_e2633_clients.json"), encoding="utf-8"))
AP = json.load(open(os.path.join(F, "zte_e2633_ap.json"), encoding="utf-8"))


class DocDuLieu(unittest.TestCase):
    def test_chin_may_dung_bang_tan(self):
        ds = z.phan_tich_thiet_bi(CLIENTS)
        self.assertEqual(len(ds), 9)
        self.assertEqual([d["band"] for d in ds].count("2.4G"), 8)
        self.assertEqual([d["band"] for d in ds].count("5G"), 1)
        d1 = ds[0]
        self.assertEqual((d1["mac"], d1["ip"], d1["rssi"], d1["mode"]), ("02:00:00:00:00:01", "192.168.88.41", -46, "802.11n"))
        self.assertIsInstance(d1["assoc_s"], int)

    def test_ap(self):
        a = z.phan_tich_ap(AP)
        self.assertEqual((a["mac"], a["firmware"], a["name"]), ("02:00:00:00:00:ff", "V1.0.4", "ZTE:ZXHN E2633"))

    def test_du_lieu_hong_khong_nem_loi_khong_bia(self):
        for xau in (None, 5, "x", [], {}, {"clientsData": None}, {"clientsData": "x"}, {"clientsData": {"1": "khong-phai-doi-tuong"}}):
            self.assertEqual(z.phan_tich_thiet_bi(xau), [])
        self.assertEqual(z.phan_tich_ap({"apData": {}}), {})
        # MAC sai khuôn bị bỏ; băng tần lạ → rỗng; số hỏng → None
        ds = z.phan_tich_thiet_bi({"clientsData": {"1": {"MacAddr": "khong-phai-mac"}, "2": {"MacAddr": "AA:BB:CC:DD:EE:01", "AccessType": "9", "Rssi": "abc", "TxRateBps": "x"}}})
        self.assertEqual(len(ds), 1)
        self.assertEqual((ds[0]["mac"], ds[0]["band"], ds[0]["rssi"], ds[0]["tx_bps"]), ("aa:bb:cc:dd:ee:01", "", None, 0))

    def test_chuoi_dai_bi_cat_va_thu_tu_theo_so(self):
        long = {"clientsData": {"10": {"MacAddr": "02:00:00:00:00:0a", "HostName": "x" * 500}, "2": {"MacAddr": "02:00:00:00:00:02"}, "MGET_INST_NUM": 2}}
        ds = z.phan_tich_thiet_bi(long)
        self.assertEqual([d["mac"] for d in ds], ["02:00:00:00:00:02", "02:00:00:00:00:0a"])
        self.assertLessEqual(len(ds[1]["name"]), 64)

    def test_main_thieu_doi_so_va_tep_hong(self):
        self.assertEqual(z.main([]), 2)
        self.assertEqual(z.main(["khong-co-tep.json"]), 1)


if __name__ == "__main__":
    unittest.main()
