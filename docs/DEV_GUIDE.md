# EXAMER — คู่มือสำหรับทีม (ใช้งาน + พัฒนาโมเดลต่อ)

อัปเดต 27 ต.ค. 2569 · อ่านไฟล์นี้ก่อน แล้วค่อยเปิดโฟลเดอร์อื่น

## ระบบทำอะไร
รูปถ่ายกระดาษคำตอบ Template 2 → คำตอบ 20 แถว × 20 ช่อง

```
Phase 1 สแกน → 2A หาตาราง → 2B ว่าง/ตัวอักษร/ขีดฆ่า → Phase 3 อ่าน A–Z → รวมผล (v3) → JSON
```

| เฟส | ชนิด | ไฟล์หลัก | ตัวที่ใช้ตอนนี้ |
|---|---|---|---|
| Phase 1 สแกน | โมดูล (ไม่เทรน) | `phase1/phase1_v4_locked.py` | v4 |
| 2A หาตาราง | โมดูล (ไม่เทรน) | `phase2/phase2a_locked.py` | ล็อก 22 ต.ค. |
| 2B ว่าง/ตัวอักษร/ขีดฆ่า | CNN | `phase2b/v3/m2b_v3_locked.pt` → `model/examer/models/m2b_v3.onnx` | v3 |
| Phase 3 อ่าน A–Z | แยกหมึก + CNN | `phase3/run/p3lib_v5.py` · `phase3/data/m3_all2.pt` → `m3_az.onnx` | v5 |
| รวมผล | กฎ | `model/examer/pipeline.py` (`combine_v3`) | v3 (27 ต.ค.) |

## 1) อยากใช้โมเดลเลย
- **Python:** `model/` → `pip install -r requirements.txt` → `python run.py รูป.jpg --viz ผล.jpg` (ดู `model/README.md`)
- **เว็บ:** `examer_web/` → `start_server.bat` → http://localhost:8000 · ในเว็บเรียก `await Examer.read(file)` (ดู `examer_web/README.md`)
- รูปแบบ JSON: `cells` 20 ค่าต่อแถว · `"A"–"Z"` · `""` ว่าง · `"-"` ขีดฆ่า · `"?"` ให้ครูตรวจ

**ตรรกะรวมผลมี 2 ที่ ต้องแก้ให้ตรงกัน:** `model/examer/pipeline.py` และ `examer_web/py/web_pipeline.py`

## 2) อยากพัฒนาต่อ
### ข้อมูลรูป (ไม่อยู่ใน zip นี้ เพราะใหญ่ ~2 GB · ขอโฟลเดอร์ `dataset/` จาก Prame ทาง Drive)
| โฟลเดอร์ | ใช้ทำอะไร |
|---|---|
| `dataset/jpg/`, `dataset/jpg_new/` | รูปแผ่นเปล่า + แผ่นลายมือ (Edge / Horizontal / Words / Test คำศัพท์) · การแบ่งชุดอยู่ใน `dataset/splits_v2.csv` |
| `dataset/phase3_edge/` | แผ่นเขียนทับเส้น train/val/test (Phase 3) · แบ่งชุดใน `split_p3.csv` |
| `dataset/final20/` | 20 แผ่นทดสอบทั้งระบบ (Nice / Korn) · เฉลย `final_test/gt_final20.py` |
| `dataset/phase1_new/` | รูปชุดใหม่ 60 รูป ที่ใช้ปิดด่าน Phase 1 |

### Phase 1 / 2A (ไม่มีการเทรน)
- แก้โค้ดใน `phase1/` หรือ `phase2/` แล้วตั้งชื่อเวอร์ชันใหม่ (อย่าแก้ไฟล์ `_locked`)
- ตัววัดผล: `phase1/run_*.py`, `phase1/label_eval*.py` · `phase2/run_p2a.py dev|test <วินาที>` + `sum_p2a.py`
- เกณฑ์และผลเดิม: `phase1/LOCK_v*.md`, `phase2/P2A_PROTOCOL.md`, `phase2/P2A_RESULTS.md`

### 2B (CNN ว่าง/ตัวอักษร/ขีดฆ่า)
- โครงโมเดล + การตัดภาพบริบท 56×96: `phase2b/v3/m2b_v2_net.py`
- เทรน: `phase2b/v3/train2b_v3.py` (อ่าน `ctx_all.npz` + `over_meta.json`)
- สร้าง `ctx_all.npz`: `phase2b/v2/build_ctx.py` ← **path ในไฟล์ยังชี้โฟลเดอร์บน cloud ต้องแก้ path ก่อนใช้** · ต้องมี `cells_meta.json` (`phase2b/extract_cells.py`) + ป้าย (`phase2b/build_labels.py`, `labels_strike.txt`, `pseudo_r0.json`) + ช่องแผ่นทับเส้น (`phase2b/v2/over_ctx_*.npz`)
- `cells.npz` (171 MB) ไม่ได้ใส่ใน zip · สร้างใหม่ด้วย `phase2b/extract_cells.py` (ต้องมี `scans_v3/` จาก `phase1/make_scans_v3.py`)
- แปลงเป็น ONNX ให้แอปใช้: ส่งออกจาก PyTorch ด้วย `torch.onnx.export` (input `x` ขนาด N×1×96×56)
- ผลและล็อก: `phase2b/v3/P2B_V3_RESULTS.md`, `LOCK_2B_V3.txt`

### Phase 3 (อ่าน A–Z)
- แยกหมึก/ตัวอักษร: `phase3/run/p3lib_v5.py` (`letters()`)
- เตรียมข้อมูล: `phase3/run/run_p12.py train` → `phase3/run/extract_train.py train` (ได้ `phase3/data/train/letters.npz` · **ยังไม่มีในเครื่อง ต้องสร้างใหม่**)
- เทรน: `phase3/run/p3train.py all2 <epoch>` (ใช้ `phase3/exp_lines/feas_train.npz` + letters.npz) → `phase3/data/m3_all2.pt`
- วัดผล: `eval_val.py`, `eval_test.py`, `eval_system.py` · เกณฑ์ `phase3/P3_PROTOCOL.md` · ผล `P3_RESULTS.md`

## 3) กติกาที่ทีมใช้ (สำคัญกับตัวเลขในรายงาน)
- แบ่ง Train / Val / Test ก่อนเริ่ม · ปรับโค้ดด้วย Dev/Val เท่านั้น
- ล็อกโค้ด/โมเดลด้วย sha256 ก่อนรัน Test **ครั้งเดียว** · ห้ามแก้หลังเห็นผล Test
- ข้อมูลที่ใช้หาจุดบกพร่องแล้ว → ใช้เป็นผลทดสอบอิสระไม่ได้อีก

## 4) สถานะตัวเลข (27 ต.ค.)
| | ผล | หมายเหตุ |
|---|---|---|
| Phase 1 | รูปใหม่ 60/60 · 20 แผ่น 20/20 | ปิดด่านแล้ว |
| 2A | Test 330 แผ่น หน้าถูก 99.39% · 20 แผ่น 20/20 | ผ่านด่าน |
| 2B v3 | 20 แผ่น 99.70–99.95% · ขีดฆ่า 599/599 | |
| Phase 3 อ่านทับเส้น | Test 10 แผ่น CAR 99.12% | |
| ระบบรวมก่อนแก้ (ล็อก · ผลจริง) | Nice 84.42% · Korn 92.46% | ตัวขีดฆ่าทำให้ช่องเลื่อน |
| ระบบรวม v3 (หลังแก้) | Nice 99.21% · Korn 98.32% · แผ่นคำ 2 แผ่น 99.62% | **ผลหลังแก้ ไม่ใช่ผลอิสระ** |

## 5) จุดอ่อนที่รู้แล้ว / งานถัดไป
1. วัดระบบรวม v3 กับแผ่นใหม่ที่ไม่เคยเห็น (หลายคนเขียน) → ได้เลขอิสระ
2. 2B ทายตัว I / H / F / G ที่ช่องขอบซ้าย/ขวาว่าขีดฆ่า (7/4,000) → เพิ่มข้อมูลเทรนตัวที่ช่องขอบ
3. แถวทับเส้นที่เขียนเบียด/คร่อมแถว ยังมีตัวขาด/เกิน
4. ยังไม่อ่านช่องรหัสนักเรียนและวงกลมเลือกชุดข้อสอบ
5. ในเว็บช้า (~20–90 วินาที/แผ่น) · พิจารณาย่อรูปก่อนส่ง หรือย้ายไปรันบนเซิร์ฟเวอร์

เอกสารรายละเอียด: `docs/EXAMER_Phase1_…_v11.docx`, `Phase2_…_v7.docx`, `Phase3_…_v6.docx` · ประวัติงาน: `HANDOFF_26oct.md`
