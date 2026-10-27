# LOCK Phase 3 (24 ต.ค. 2569 ก่อนแตะ Test)

| ไฟล์ | sha256 |
|---|---|
| phase3/run/p3lib.py | b30aa569664cbd22f7c949a3a7d7889263cf0d4b9e630486032ac76738cedccf |
| phase3/run/run_p12.py | f12cbf9ccda088c6c95fe938670275efe851724938f267aa6f084770f3a2f199 |
| phase3/run/extract_train.py | 21591ab2c3ede3ffdf20d88fe3056bd47128ded917c1548983b84f83fcc28a4e |
| phase3/run/p3train.py | 1ec1a2acfc5cf2073cb6e84c11689b4ea4ea63e27a002fe514f80d9e71eb9b3d |
| phase3/data/print_template.npz | 66ebc669b2d3ba7259dee63a942dfeca4a5eb6ec88f8c548c9145cd35baf3fd8 |
| phase3/data/m3_all2.pt | 3b520a17ff6a59d7d10ba439a7a8bcc0cf084d06cb9ca2b98df8d859187a5565 |
| phase1/phase1_v3_locked.py | 12b4652ba37540eb8dfde6be67685f1448a39e2d7d2b6379ade6a4bcda4efca4 |
| phase2/phase2a_locked.py | cddc528e7e3ef24916f597284a02242c99d3b2ea412e11f09e2faf4fe389bc72 |
| phase2b/m2b_locked.pt | cef51ffac548e0056200b2ffc43045281cdad25aaecc2b2cc2c7122132a182f1 |
| dataset/phase3_edge/split_p3.csv | 53bc1ab1ca7e4f78cd53a235074dac54caedda684153913a11f2ca2824757649 |

## ค่าที่ล็อก
- โมเดล: m3_all2.pt (Horizontal Train + ตัวอักษรทับเส้น train แบบสี + แบบรูปทรง) · 8 epoch
- โหมดรูปทรงอัตโนมัติเมื่อเกณฑ์สีรายแผ่น t < 6 · แม่แบบของที่พิมพ์จาก train 30 แผ่น
- ส่งครูตรวจเมื่อความมั่นใจ < 0.8 (เลือกจาก val) · แถวที่แยกจำนวนตัวไม่ตรง = ส่งครูตรวจทั้งแถว

## เลือกบน val (ตัวเลขประกอบ · val ใช้พัฒนาด้วย)
- โมเดลเดิม (Horizontal อย่างเดียว): CAR 0.9667 · WAR 0.685
- **โมเดลใหม่ m3_all2: CAR 0.9835 · WAR 0.84** · บน 0.9834 · ล่าง 0.9758 · ซ้าย 0.9885 · เส้นตั้ง 0.9904

## ขั้นตอน Test (หลังผู้ใช้อนุญาต)
1. ดาวน์โหลด Main Test 10 แผ่น · Phase 1 + 2A (ล็อก)
2. **ทำเฉลยก่อนดูผลระบบ**: ดูภาพทุกแถว (200 แถว) จดเฉพาะแถวที่เขียนต่างจากแบบ → test/truth_override.json · ล็อก hash
3. รันระบบครั้งเดียว → CAR / WAR / แยกชนิดทับเส้น / ส่งครูตรวจ · 95% CI Wilson · baseline = โมเดลเดิมบนสายงานเดียวกัน · ไม่แก้หลังเห็นผล

## ล็อกสุดท้าย (24 ต.ค. 23:25 ก่อนรัน test · เฉลย test จดก่อนรันระบบ)
- เลือก m3_all2 (val CAR 0.9835) · รุ่นทดลองตัดเศษเส้น m3_all3 ได้ 0.977 → ไม่ใช้ · การกู้เส้นจากความหนา → ไม่ช่วย ไม่ใช้
- p3train.py / run_p12.py / extract_train.py เปลี่ยนเฉพาะชื่อไฟล์ผลและ assert ชุดข้อมูล (ไม่กระทบผล) · เพิ่ม system.py (ระบบรวมรายช่อง) · eval_test.py
- เกณฑ์: CAR ≥ 70% (ผู้ใช้ 22:57) · baseline = m_baseline.pt (เทรนเฉพาะ Horizontal)

| ไฟล์ | sha256 |
|---|---|
| phase3/run/p3lib.py | b30aa569664cbd22f7c949a3a7d7889263cf0d4b9e630486032ac76738cedccf |
| phase3/run/run_p12.py | 8fd9a3c8d07be8630990fe0fe72a1a2c30ec64511830036f37659e0f55348834 |
| phase3/run/extract_train.py | 16275cfc7e0d43046aea3e56785c052ba187302771abec9a51b1a386f93e44f9 |
| phase3/run/p3train.py | 0e104604c7347d79f35034b494b25bd2d3ee62d793e9f1f8708f9bc64c834c27 |
| phase3/run/system.py | 0e1035a567975a7b0899fa31ec1e1bc0139f238d6e9dd57ce8209628a40f859e |
| phase3/run/eval_test.py | 1528412a47aac203a3233455cb64736d859ecf8e10f7abb9b2200826e7241b30 |
| phase3/data/print_template.npz | 66ebc669b2d3ba7259dee63a942dfeca4a5eb6ec88f8c548c9145cd35baf3fd8 |
| phase3/data/m3_all2.pt | 3b520a17ff6a59d7d10ba439a7a8bcc0cf084d06cb9ca2b98df8d859187a5565 |
| phase3/data/m_baseline.pt | 25674d2f3dabbb0b503e15c2b3b977facbf88b9c9387b7509b7e3ac5398c4dd7 |
| phase3/data/test/truth_override.json | ec6cae9542af25e904922b63ccf781fbb07bcc2f5006dece34f7bc06ca0f3098 |
