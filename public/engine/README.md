# public/engine/ — โมเดลอ่านกระดาษคำตอบในเบราว์เซอร์

มาจาก `examer_web/` ของ Prame · รันในเครื่องทั้งหมด (Python ผ่าน **Pyodide** + CNN ผ่าน **onnxruntime-web**) ไม่มี server ไม่ส่งรูปออก
ใช้ได้แบบไม่มีเน็ตหลังโหลดครั้งแรก (เบราว์เซอร์จำไฟล์ไว้)

หน้า app ไม่เรียกไฟล์ในนี้ตรงๆ — เรียกผ่าน `Pipeline.run()` → `Engine` ใน [`../shared/pipeline.js`](../shared/pipeline.js) ซึ่งแปลงผล (`fromModel`) ให้เป็นรูปแบบที่หน้า app ใช้ (ดู [`docs/ENGINE.md`](../../docs/ENGINE.md))

| ไฟล์ | คืออะไร |
|---|---|
| `examer.js` | ตัวที่หน้าเว็บเรียก: `Examer.read(file)` · `warmup()` · `onProgress(msg, step)` · `onReady` · `onError` · `reset()` |
| `worker.js` | Web Worker โหลด Python + โมเดล แล้วอ่านทีละแผ่น (หน้าเว็บไม่ค้าง) |
| `py/web_pipeline.py` | ต่อทุกเฟสแบบ async (ตรรกะเดียวกับ `model/examer/pipeline.py`) |
| `py/examer/` | **สำเนา**ของ `model/examer/` (ยกเว้น `models/`) — เบราว์เซอร์เห็นแค่ไฟล์ใน `public/` เลยต้องก๊อปมา · ต้องตรงกับ `model/` ทุกไบต์ |
| `models/*.onnx` | 2B (ว่าง/ตัวอักษร/ขีดฆ่า) และ A–Z — ไฟล์เดียวกับ `model/examer/models/` |
| `pyodide/`, `ort*` | Python และ onnxruntime สำหรับเบราว์เซอร์ (เก็บในเว็บเอง ไม่ดึงจาก CDN) |

## ตัวเลขที่ควรรู้
- โหลดครั้งแรก ~45 MB · 10–30 วินาที
- อ่านแผ่นละ ~30–90 วินาที (ทดสอบใน Chromium: ~90 วินาที โดย Phase 1 ใช้ ~60 วินาที) — ช้าเพราะ Python ใน Pyodide + เธรดเดียว (GitHub Pages เปิด multi-thread ไม่ได้)
- มือถือรุ่นเก่าอาจหน่วยความจำไม่พอกับรูปใหญ่

## ต่างจาก `examer_web/` ต้นฉบับ
- ไม่เอา `index.html` (หน้าตัวอย่าง), `serve.py`, `start_server.bat` และ `py/examer/models/` (worker ไม่ได้ใช้) — ต้นฉบับยังอยู่ใน `_review/incoming/examer_web/`
- ไม่เอา `pyodide/scipy-*.whl`, `pyodide/openblas-*.zip` (~20 MB) — worker ไม่ได้โหลด (ตรวจจากรายการไฟล์ที่เบราว์เซอร์ดึงตอนทดสอบ)
- `examer.js`: เพิ่ม `step`, `onReady`, `onError`, `reset()` ให้แอปบอกสถานะได้
- `py/web_pipeline.py`: ภาพหน้าสแกนที่ส่งกลับ (`scan_jpg`) ใหญ่ขึ้นเป็น 1240×1754 ให้ครูเห็นลายมือชัด (ไม่มีผลกับการอ่าน)

## เช็กว่าสำเนาตรงกับ `model/` (PowerShell ที่โฟลเดอร์ repo)
```powershell
Get-ChildItem model\examer -Recurse -File | Where-Object { $_.FullName -notmatch '\\models\\' } | ForEach-Object {
  $rel = $_.FullName.Substring((Resolve-Path model\examer).Path.Length)
  if ((Get-FileHash $_.FullName).Hash -ne (Get-FileHash "public\engine\py\examer$rel").Hash) { "ไม่ตรง: $rel" } }
```
ไม่มีอะไรขึ้น = ตรงกันหมด · ถ้าแก้โค้ดใน `model/` ต้องก๊อปมาที่นี่ด้วย (และ `web_pipeline.py` ต้องแก้ให้ตรงกับ `pipeline.py` — กฎของ Prame)

<!-- [claude/gelatin · 2026-10-28] รวม examer_web ของ Prame เข้า public/engine/ -->
