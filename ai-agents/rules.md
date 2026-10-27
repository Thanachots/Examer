# rules — กฎของโปรเจค Examer

ทุกข้อติดป้าย `[agent/ชื่อคน · วันที่]` (ดู INDEX.md)

## การสื่อสาร
- ตอบผู้ใช้เป็นภาษาไทย (ศัพท์เทคนิค / ชื่อไฟล์ ใช้อังกฤษได้)  [claude/gelatin · 2026-10-19]

## Git
- ทำงานบน branch แล้วเปิด Pull Request — ห้าม commit / push เข้า `main` ตรงๆ (รายละเอียด: `docs/CONTRIBUTING.md`)  [claude/gelatin · 2026-10-19]
- **ก่อนแก้ไฟล์ใดๆ — ดู GitHub ก่อนเสมอ**  [claude/gelatin · 2026-10-20]
  1. `main` มี commit ใหม่กว่าในเครื่องไหม → มี: pull ก่อน (สั่ง git เองไม่ได้ → เตือนผู้ใช้ให้ pull)
  2. มี **branch / Pull Request ของคนอื่นที่ยังไม่ merge** ไหม → ดูว่าแก้ไฟล์ / ส่วนเดียวกับที่กำลังจะแก้หรือเปล่า
     — แยก branch กันก็ยังแก้ไฟล์เดียวกันได้ แล้วจะชนกันตอน merge
  3. เจอแบบข้อ 2 → **แจ้งผู้ใช้ก่อนลงมือ**: branch ไหน ของใคร แก้ไฟล์อะไร ทับกับงานที่จะทำตรงไหน · แล้วถามว่าจะทำต่อ / รอให้ merge ก่อน / คุยกับเจ้าของ
  - วิธีดู: `git fetch --prune` → `git branch -r` → `git log --oneline main..origin/<branch>` และ `git diff --stat main...origin/<branch>` · หรือหน้าเว็บ Branches / Pull requests ของ repo · agent ที่สั่ง git บนเครื่องผู้ใช้ไม่ได้ → clone repo มาดูเอง (repo เป็น public)
- **ก่อนผู้ใช้ commit / push** — เช็กโฟลเดอร์ว่ามีของที่ไม่ควรขึ้นไหม (ไฟล์ส่วนตัว, ความจำของ agent จากโปรเจคอื่น, ไฟล์ใหญ่, รหัสผ่าน) · เครื่องมือที่ใช้ `git add -A` จะเอาทุกอย่างในโฟลเดอร์ขึ้นไป  [claude/gelatin · 2026-10-19]
- **GitHub มี commit ใหม่กว่าในเครื่อง** (push ไม่ผ่าน / behind) → ดึงของ GitHub มารวมก่อน (`git pull --rebase`) · **ห้ามเลือกทางที่เขียนทับ GitHub** (`push --force`, "Overwrite") — งานของเพื่อนจะหาย · conflict แก้ไม่ได้ → หยุด ถามในทีม  [claude/gelatin · 2026-10-19]
- ห้ามเอาขึ้น git: dataset / ภาพกระดาษคำตอบจริง, ไฟล์โมเดลขนาดใหญ่, `.env` / รหัสผ่าน / API key  [claude/gelatin · 2026-10-19]
- ก่อนแก้ไฟล์ส่วนกลาง (README, `docs/`, `public/shared/pipeline.js`) บอกในทีมก่อน  [claude/gelatin · 2026-10-19] [แก้ apps/ → public/: claude/gelatin · 2026-10-21]

## โครงสร้างไฟล์
- `public/` = หน้าเว็บที่ deploy (HTML/CSS/JS ล้วน ไม่มี build): `dashboard/` เว็บฝ่ายวิชาการ · `app/` แอปครู · `shared/` ใช้ร่วม · `engine/` โมเดล · `model/` = โมเดลตัวจริงชุดเดียว (Python + ONNX) · `research/` = งานพัฒนา/วัดผลของแต่ละเฟส · `legacy/` = UI เดิมเก็บไว้ดู · `docs/` = เอกสารให้คนอ่าน · `ai-agents/` = ความจำของ agent  [claude/gelatin · 2026-10-19] [แก้ apps/ → public/: claude/gelatin · 2026-10-21] [แก้ เพิ่ม model/ research/: claude/gelatin · 2026-10-28]
- โค้ดโมเดลมีชุดเดียวที่ `model/` — เว็บ/แอปเอาไปใช้ต่อ ห้ามก๊อปเก็บซ้ำในโฟลเดอร์อื่น · ไฟล์ `_locked` และโมเดลที่มี sha256 ห้ามแก้ (ตัวเลขในรายงานพึ่งไฟล์เหล่านี้) [claude/gelatin · 2026-10-28]
- `_review/` = ของที่ยังไม่ได้รวม / อาจไม่ใช้ (ไม่ขึ้น git) — ให้ผู้ใช้ตรวจก่อน ห้ามลบเอง [claude/gelatin · 2026-10-28]
- `app/` ห้ามเรียกโค้ดใน `dashboard/` (และกลับกัน) — ของที่ใช้ทั้งสองฝั่งไว้ `shared/` · แอปมือถือจริงจะรวมแค่ `app/` + `shared/` + `engine/`  [claude/gelatin · 2026-10-21]
- อย่าสร้างโฟลเดอร์ใหม่ที่รากโปรเจค โดยไม่ถามผู้ใช้ก่อน  [claude/gelatin · 2026-10-19]

## หน้า app ↔ โมเดล
- หน้า app เรียกโมเดลผ่าน `Pipeline.run()` ใน `public/shared/pipeline.js` จุดเดียว · รูปแบบข้อมูลตาม `docs/ENGINE.md`  [claude/gelatin · 2026-10-19] [แก้ apps/ → public/: claude/gelatin · 2026-10-21]
- ~~โมเดลอยู่ repo แยก ([67160328/Computer-Vision](https://github.com/67160328/Computer-Vision)) — ไม่ก๊อปโค้ดโมเดลเข้า Examer โดยไม่ได้ตกลงกัน~~  [claude/gelatin · 2026-10-19] เลิกใช้แล้ว — engine ชุดเก่า + repo โมเดลเก่าเอาออกแล้ว [claude/gelatin · 2026-10-28]

## agent
- ทำเฉพาะที่ผู้ใช้สั่ง — "ให้ดูคร่าวๆ" / "ลองอ่าน" = อ่านแล้วสรุป ไม่ลงมือทำ  [claude/gelatin · 2026-10-19]
- เปลี่ยนแผนแล้ว → ลบของที่ไม่ใช้ตามแผนใหม่ด้วย (เช่น โค้ดต่อ server หลังตัดสินใจรันโมเดลในเว็บ) ไม่ทิ้งค้าง  [claude/gelatin · 2026-10-19]
- เจอปัญหานอกงานที่สั่ง → จดใน `todo.md` แล้วบอกผู้ใช้ ไม่แก้เอง  [claude/gelatin · 2026-10-19]
