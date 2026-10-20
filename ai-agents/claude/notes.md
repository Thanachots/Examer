# claude/notes — เรื่องเฉพาะ Claude (ทุกคนที่ใช้ Claude ต้องรู้)

ข้อจำกัด / วิธีแก้ที่เจอจริง ตอนทำงานกับไฟล์ในเครื่องผู้ใช้ผ่าน Claude app (เชื่อมโฟลเดอร์ผ่าน remote-devices)

## ทำอะไรได้ ขึ้นกับชุดเครื่องมือของแชทนั้น
- แต่ละแชทได้เครื่องมือไม่เท่ากัน → แชทหนึ่งทำได้ อีกแชททำไม่ได้ เป็นเรื่องปกติ · เริ่มแชทให้เช็กเครื่องมือที่มีจริง แล้วบอกผู้ใช้ตรงๆ ห้ามเดา  [claude/gelatin · 2026-10-19]

| มีเครื่องมืออะไร | ทำได้ | ทำไม่ได้ |
|---|---|---|
| ไม่มี `mcp__remote-devices__*` | อ่านไฟล์ที่ผู้ใช้แนบในแชท | เข้าเครื่องผู้ใช้ไม่ได้ (แชทไม่ได้ link กับคอม) |
| list_dir / stage / commit / request_folder_access (**ไม่มี device_bash**) | ดูรายชื่อไฟล์ · ดึงไฟล์มาอ่าน · สร้างไฟล์ใหม่ / เขียนทับ | **ย้าย เปลี่ยนชื่อ ลบ ไม่ได้ · สั่ง git ไม่ได้** |
| + `device_bash` | รันคำสั่งบนเครื่อง (ในโฟลเดอร์ที่เชื่อม) · ย้าย/เปลี่ยนชื่อ | ลบได้ต่อเมื่อขอ delete permission แล้วผู้ใช้อนุญาต |

- device_bash ขึ้นกับเครื่อง/แอปฝั่งผู้ใช้ ไม่ใช่สวิตช์ที่ Claude หรือผู้ใช้เปิดเองได้ — อย่าเดาเงื่อนไขให้ผู้ใช้  [claude/gelatin · 2026-10-19]
- ไม่มี device_bash → ลบ/ย้าย/git: ให้คำสั่ง PowerShell ผู้ใช้รันเอง  [claude/gelatin · 2026-10-19]
- แชทไม่ได้ link กับคอม → ผู้ใช้เปิดงานใน Claude desktop app แล้วเลือก "Link to this computer" (ไม่มีให้เลือก = เริ่มงานใหม่จาก desktop app)  [claude/gelatin · 2026-10-19]
- computer use ลบไฟล์ผ่าน File Explorer ไม่ได้จริง (ได้สิทธิ์แค่คลิก) — อย่าเสนอทางนี้  [claude/gelatin · 2026-10-19]

## แก้ไฟล์เมื่อไม่มี device_bash (stage → แก้ใน cloud → commit)
1. `device_list_dir` เอา mtimeMs ปัจจุบัน  [claude/gelatin · 2026-10-19]
2. `device_stage_files` → ไฟล์อยู่ที่ `/mnt/user-data/uploads/...` (รอ 1–2 วินาที) · เป็นสำเนา ณ ตอนนั้น — ผู้ใช้แก้แล้วต้อง stage ใหม่  [claude/gelatin · 2026-10-19]
3. แก้ใน cloud · ก่อน commit **ก๊อปเป็นชื่อไฟล์ใหม่ทุกครั้ง** — commit จาก stagedPath เดิมซ้ำรอบสองอาจได้เนื้อหาเก่า  [claude/gelatin · 2026-10-19]
4. `device_commit_files` ใส่ `expectedMtimeMs` เมื่อทับไฟล์เดิม (กันทับงานที่ผู้ใช้เพิ่งแก้) แล้ว stage กลับมา `cmp` เทียบว่าตรง  [claude/gelatin · 2026-10-19]

## ข้อจำกัดอื่น
- **โฟลเดอร์ `.github/` เขียนไม่ได้** (protected) → วางไฟล์ไว้ที่รากโปรเจค แล้วให้ผู้ใช้ `Move-Item` เข้าที่  [claude/gelatin · 2026-10-19]
- `device_stage_files` ดึงได้ลึกสุด 7 โฟลเดอร์ใต้โฟลเดอร์ที่เชื่อม (commit ลึกกว่านั้นได้)  [claude/gelatin · 2026-10-19]
- ขนาดไฟล์ที่ `device_list_dir` รายงานหลัง commit อาจไม่ตรง → เทียบเนื้อหาด้วย stage + cmp แทน  [claude/gelatin · 2026-10-19]
- ไฟล์ที่ส่งเข้าแชท (`SendUserFile`) อาจถูกแอปเซฟลงโฟลเดอร์ `Claude outputs` ในโฟลเดอร์ที่เชื่อมไว้ → ถ้าเห็นโฟลเดอร์นี้โผล่ที่รากโปรเจค อย่า commit ขึ้น git  [claude/gelatin · 2026-10-19]

## ทดสอบ
- repo บน GitHub (public) clone มาทดสอบใน cloud ได้ · `pip install torch` จาก PyPI ได้ (download.pytorch.org ถูกบล็อก)  [claude/gelatin · 2026-10-19]
- ทดสอบหน้า app: `python -m http.server` + Playwright (Chromium ติดตั้งไว้แล้ว) · Google Fonts โหลดไม่ได้ใน cloud — error นี้ไม่ใช่บั๊ก  [claude/gelatin · 2026-10-19]
- Browser pane ถูกซ่อนอยู่ → `img.decode()` อาจค้างจน timeout · อ่านข้อมูลผ่าน DOM / javascript แทน  [claude/gelatin · 2026-10-19]
- cloud เข้า cdn.jsdelivr.net ไม่ได้ → ทดสอบ engine ด้วยไฟล์ในเครื่อง: Pyodide จาก GitHub release (`pyodide-0.26.4.tar.bz2`), onnxruntime-web จาก `npm pack` แล้วตั้ง `localStorage["examer.engineConfig"]` ชี้ไปที่ไฟล์เหล่านั้น  [claude/prame · 2026-10-19]
- เทียบผล engine กับ PyTorch: รัน `examer_engine.py` + onnxruntime (Python) กับ `data/Test` ต้องตรง 100% · ในเบราว์เซอร์ต่างได้เล็กน้อยเพราะ OpenCV 4.9  [claude/prame · 2026-10-19]
