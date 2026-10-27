# LOCK Phase 2A (2026-10-22)

ล็อกก่อนรันชุด Test ครั้งเดียว · run_p2a.py test ตรวจ hash ของ phase2a_locked.py ก่อนรัน

| ไฟล์ | sha256 |
|---|---|
| phase2a_locked.py | cddc528e7e3ef24916f597284a02242c99d3b2ea412e11f09e2faf4fe389bc72 |
| p2a_gt_sheet.py | acd69e3b7a1e0d754dce14ee2392f27b70dd8a6e9e56a866f6c634eef589a0ff |
| p2a_gt_printed.json | 933f3c14374414f5b81c0c26182a1d5455298741a2cba299584fa5f8d71c2273 |
| run_p2a.py | e23663c2e2dc5bf982bca05975a4d51e94d25dc995176ace4586669c79ef9aea |
| sum_p2a.py | d91ff389ec2638748db06f0f0794a242b71c7e810c2693a4778745e90c39eab8 |
| ../dataset/splits_v2.csv | 7d04a00a6381168a5d5c238642a4ae29b12680df4c1d6490d174715da331f811 |

หมายเหตุ splits_v2.csv: hash ใน P2A_PROTOCOL.md (0640754d…) ไม่ตรงกับไฟล์บนดิสก์ (ไฟล์ขึ้นบรรทัดแบบ CRLF · แก้ล่าสุด 2026-10-22 14:28 UTC)
ตรวจเนื้อหาแล้วตรงตามที่บันทึกทุกจำนวน: 529 แถว · p2a dev 196 / test 330 / − 3 · p23 Edge 48/11/11 · Horizontal 49/11/10 · Words 49/11/10 · final 16 · overflow 3
ระบุสาเหตุไม่ได้ (น่าจะคำนวณ hash จากสำเนาที่ท้ายบรรทัดต่างกัน) → ใช้ hash ในตารางนี้เป็นตัวล็อกต่อจากนี้
