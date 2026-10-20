# todo — งานค้าง / ปัญหาที่ทุกคนต้องรู้

ทำเสร็จ → ขีดฆ่า (`~~...~~`) + ป้ายคนปิด

## ต้องทำ
- เปิด GitHub Pages: Settings → Pages → Source: **GitHub Actions** (ต้องเป็นเจ้าของ repo)  [claude/gelatin · 2026-10-19]
- เติมชื่อผู้รับผิดชอบในตาราง "ใครดูแลส่วนไหน" ใน `docs/CONTRIBUTING.md`  [claude/gelatin · 2026-10-19]
- เลือกวิธีเอาโมเดลเข้าเว็บ (Pyodide / JS + ONNX) เมื่อโมเดลนิ่ง — ดู `decisions.md`  [claude/gelatin · 2026-10-19]
  - ทำต้นแบบแล้ว: Pyodide (โค้ด ①② เดิม) + ONNX (โมเดล ③) บน branch `feat/school-app` — ผลตรง PyTorch 3,193/3,200 ช่อง · **รอทีมตกลงว่าจะใช้แบบนี้ไหม** (ดู `public/README.md`)  [claude/prame · 2026-10-19] [แก้ apps/ → public/: claude/gelatin · 2026-10-21]
- ~~ออกแบบหน้าจอของหน้า app (กี่หน้า, flow ถ่ายรูป → ดู/แก้ผล → สรุปคะแนน?)~~  [claude/gelatin · 2026-10-19] [ร่างแรก: เตรียม → สแกน → ตรวจทาน → คะแนน + ห้องเรียน/รายชื่อ บน `feat/school-app` — รอทีมดู: claude/prame · 2026-10-19]

- ไฟล์ ONNX (`public/engine/models/`, 3 ไฟล์ ~3.5 MB) จะเก็บที่ไหน: ใน Examer (ตอนนี้) หรือให้ repo โมเดลแปลง/ปล่อยเอง  [claude/prame · 2026-10-19] [แก้ apps/ → public/: claude/gelatin · 2026-10-21]
- engine ดึงโค้ด Python จาก repo โมเดลที่ commit `7fe575a` (ปักไว้ใน `public/shared/engine.js`) — ทีมโมเดลอัปเดตแล้วต้องเลื่อน commit + แปลง ONNX ใหม่  [claude/prame · 2026-10-19] [แก้ apps/ → public/: claude/gelatin · 2026-10-21]

## รอตกลง (จาก README ส่วนที่ 4 และ 9)
- เกณฑ์: ตัวพิมพ์เล็ก, เว้นช่องกลางคำ, คะแนนบางส่วน  [claude/gelatin · 2026-10-19] [หน้า app ทำเป็นตัวเลือกในตั้งค่าไว้ก่อน + เพิ่ม "ไม่เริ่มช่องแรก": claude/prame · 2026-10-19]

## ข้อสังเกต
- โค้ดโมเดลปัจจุบันมี "Top-3 Lexicon Refinement" ที่ใช้คำในเฉลยช่วยแก้คำที่อ่านได้ → ความแม่นยำที่รายงานจะสูงกว่าการอ่านจริง ควรรายงานแยก (ดู `docs/ENGINE.md`)  [claude/gelatin · 2026-10-19]
- ส่วนอ่านตัวอักษรในโค้ดโมเดลใช้ ResNet ขนาดเล็ก (32×32) 3 โมเดล ไม่ใช่ MobileNetV2 28 คลาสตาม README หลัก → ถ้าเปลี่ยนจริงควรแก้ README / สไลด์หน้า 7  [claude/gelatin · 2026-10-19]
- ผลอ่านขึ้นกับเวอร์ชัน OpenCV: Pyodide ใช้ 4.9 · เครื่องที่วัดผลใช้ 5.0 → ต่างกัน 7/3,200 ช่องบน `data/Test` (มี I/T 1 ช่องที่มั่นใจสูง) — ทีมโมเดลควรวัดผลด้วย OpenCV 4.9 ด้วย  [claude/prame · 2026-10-19]
