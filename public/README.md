# public/ — หน้าเว็บ + แอปครู

โฟลเดอร์นี้ deploy ขึ้น GitHub Pages ทั้งก้อน (`.github/workflows/deploy-pages.yml`) · HTML/CSS/JS ล้วน ไม่มี build

```
public/
├── index.html        เปิดเว็บแล้วพาไป dashboard/
├── dashboard/        เว็บฝ่ายวิชาการ (back office) — sidebar: Dashboard · Application (แอปครูในกรอบมือถือ)
├── app/              แอปครูผู้สอน (ตัวที่จะทำเป็นแอปมือถือ)
│   ├── app.js        หน้าทั้งหมด: login · ข้อสอบของฉัน · ตรวจข้อสอบ (ถ่ายภาพ → ครอบภาพ → ตรวจ) · ตั้งค่า
│   ├── photos.js     เปิดรูปจากมือถือ (รวม HEIC ของ iPhone) · vendor/heic2any.min.js
│   └── app.css
├── shared/           ใช้ร่วมกันทั้ง dashboard/ และ app/
│   ├── core.js       ตัวช่วย · ไอคอน · โลโก้ · login (ต้นแบบ) · router
│   ├── base.css      สี ฟอนต์ ปุ่ม ช่องกรอก
│   ├── store.js      IndexedDB (ข้อสอบ, กระดาษ+รูป) + เกณฑ์ตรวจ — ของ Prame
│   ├── pipeline.js   ผลอ่านจำลอง + เกณฑ์ให้คะแนน (รูปแบบตาม docs/ENGINE.md) — ของ Prame
│   └── engine.js, engine-worker.js   รันโมเดลในเบราว์เซอร์ — ของ Prame (ยังไม่ได้ต่อกับหน้าใหม่)
└── engine/           examer_engine.py, torch/ (จำลอง), models/ (ONNX + meta.json)
```

- `dashboard/` กับ `app/` อยู่เว็บเดียวกัน → ข้อมูลในเครื่อง (IndexedDB) ใช้ร่วมกันได้ และหน้า Application เปิด `../app/` ในกรอบมือถือ
- ทำแอปมือถือจริงภายหลัง (เช่น Capacitor): รวม `app/` + `shared/` + `engine/` เป็นโฟลเดอร์เดียวตอน build — แอปจริงจะมีที่เก็บข้อมูลของตัวเอง แยกจากเว็บ
- UI เดิมของ Prame ย้ายไปเก็บที่ [`../legacy/`](../legacy/) (ไม่ได้ deploy)

## เปิดใช้ในเครื่อง
ต้องเปิดผ่าน http (Web Worker / IndexedDB ใช้กับ `file://` ไม่ได้)
```bash
cd public && python -m http.server 8080   # Dashboard: http://localhost:8080 · แอปครู: http://localhost:8080/app/
```

## ระบบตรวจในเบราว์เซอร์ (engine)
| ขั้น | ทำงานด้วย | มาจาก |
|---|---|---|
| ① ตัดขอบ/ปรับภาพ ② หาช่อง + เตรียมภาพช่อง | โค้ด Python เดิมของ repo โมเดล รันด้วย **Pyodide + OpenCV** | ดึงจาก [67160328/Computer-Vision](https://github.com/67160328/Computer-Vision) ผ่าน jsDelivr (ปัก commit ไว้ใน `shared/engine.js`) |
| ③ อ่านตัวอักษร A–Z, ตัวเลขรหัส, ช่องขีดฆ่า | โมเดล 3 ตัวแปลงเป็น **ONNX** รันด้วย onnxruntime-web | `engine/models/*.onnx` (แปลงจาก `.pt` ของ repo โมเดล) |

- `shared/engine.js` → `shared/engine-worker.js` (Web Worker) → `engine/examer_engine.py`
- `engine/torch/` = torch จำลอง (numpy) ให้โค้ด repo โมเดล import ได้ — ตัวโมเดลจริงไปรันที่ ONNX
- รายละเอียดผลทดสอบ engine ดู `legacy/README.md` (ส่วน "ระบบตรวจในเบราว์เซอร์")

<!-- [claude/gelatin · 2026-10-21] เขียนใหม่ตอนแยก apps/ → public/ (dashboard · app · shared) -->
