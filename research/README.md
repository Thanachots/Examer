# research/ — งานพัฒนาและวัดผลโมเดล (ของ Prame)

ย้ายมาจากโฟลเดอร์ `EXAMER/` ของ Prame (28 ต.ค. 2569) · **ตัวที่แอปใช้จริงอยู่ที่ [`../model/`](../model/)** ที่นี่คือที่มาของตัวเลขในรายงาน

| โฟลเดอร์ | มีอะไร |
|---|---|
| `phase1/` | Phase 1 สแกน: โค้ดทุกเวอร์ชัน (`phase1_v4_locked.py` = ตัวที่ใช้) · ผลวัด · `LOCK_v*.md` |
| `phase2/` | Phase 2A หาตาราง: `phase2a_locked.py` · `P2A_PROTOCOL.md` · `P2A_RESULTS.md` |
| `phase2b/` | 2B ว่าง/ตัวอักษร/ขีดฆ่า: สคริปต์เทรน v1–v3 · `v3/m2b_v3_locked.pt` → `model/examer/models/m2b_v3.onnx` |
| `phase3/` | Phase 3 อ่าน A–Z: `run/p3lib_v5.py` · `data/m3_all2.pt` → `model/examer/models/m3_az.onnx` |
| `final_test/` | ทดสอบทั้งระบบ 20 แผ่น (Nice / Korn) · เฉลย `gt_final20.py` · ผล `FINAL20_*.md` |
| `dataset/` | ไฟล์แบ่งชุดข้อมูล (`splits_v2.csv` ฯลฯ) · รูปจริง ~2 GB ไม่อยู่ใน git (ขอ Prame ทาง Drive) |
| `reports/` | รายงาน Word ล่าสุด (Phase1 v11 · Phase2 v7 · Phase3 v6) · ไม่ขึ้น git (ใหญ่) |

## ข้อควรรู้
- **ห้ามแก้ไฟล์ `_locked` และไฟล์ที่มี sha256 ใน `LOCK_*` / `model/SHA256SUMS.txt`** — ตัวเลขในรายงานพึ่งไฟล์เหล่านี้ · จะเปลี่ยน → ทำเวอร์ชันใหม่แล้ววัดใหม่
- สคริปต์ในนี้เขียนตอนอยู่โฟลเดอร์ `EXAMER/` (และบาง path ชี้โฟลเดอร์บน cloud) → **path ในสคริปต์ยังเป็นแบบเดิม** ต้องแก้ก่อนรัน
- ไฟล์ใหญ่ (`*.npz`, `*.pt`, `cells_meta.json`, รูปใน `dataset/`) ไม่ขึ้น git — ดู `.gitignore`
- คู่มือพัฒนาต่อ: [`../docs/DEV_GUIDE.md`](../docs/DEV_GUIDE.md) · บันทึกการทำงานของ Prame: `../ai-agents/claude/prame/`

<!-- [claude/gelatin · 2026-10-28] -->
