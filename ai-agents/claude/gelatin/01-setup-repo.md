# 01 — setup repo (2026-10-19)

## ทำอะไรไป
- อ่าน README หลัก + repo · commit ใหม่ของเพื่อน (`web/` ต้นแบบ) → ผู้ใช้ pull ลงมา
- อธิบายวิธีทำงานเป็นทีมใน git (auto-fetch, branch + PR, แก้ conflict) → เขียนเป็น `docs/CONTRIBUTING.md`
- (นอกโปรเจค) ช่วยถอน OneDrive + คืน Desktop/Documents/Pictures กลับเข้าเครื่อง · ย้าย repo ไป `Desktop\Works\Y3\Computer Vision\Examer`
- สร้าง GitHub Actions: `deploy-apps.yml` (deploy `apps/` ขึ้น Pages) + `check-pr.yml` (เช็ค JS ทุก PR)
- ดู repo โมเดล ([67160328/Computer-Vision](https://github.com/67160328/Computer-Vision)) — 5 phase, PyTorch 3 โมเดล, รันได้ ~2.5 วิ/แผ่นบน CPU
- เคยทำ `server/` (FastAPI) ต่อโมเดล → **ผู้ใช้ไม่ได้สั่ง แค่ให้ดูคร่าวๆ** + ภายหลังตัดสินใจรันโมเดลในเว็บ → ลบทิ้งแล้ว
- จัดโครงสร้าง: `web/` → `apps/`, เพิ่ม `docs/` (CONTRIBUTING, ENGINE), README หลักเก็บของเดิม + ส่วน "Repo นี้"
- ลบโค้ดต่อ server ออกจาก `pipeline.js` / `app.js` → เหลือ `ENGINE = null` (โหมดจำลอง)
- ผู้ใช้ commit เอง: "จัดโครงสร้างโปรเจคใหม่" บน branch `chore/project-structure`
- ออกแบบ + สร้าง `ai-agents/` (ไฟล์นี้) · เดิมชื่อ `agents/` → `_agents/` → ผู้ใช้เปลี่ยนเป็น `ai-agents/`
- ดึงไฟล์ตั้งค่าความจำจาก claude-memories เดิม (user-personality, reply-style, กฎการทำงาน, ข้อจำกัดเครื่องมือ) — ตัดทุกอย่างที่มาจากโปรเจคเก่าออก

## ตกลงอะไร
- ดู `ai-agents/decisions.md` (ทุกแถววันที่ 2026-10-19)

## ค้าง
- push branch `chore/project-structure` + เปิด PR + merge + เปิด Pages (ผู้ใช้ทำ)
- commit `ai-agents/` (ผู้ใช้ทำ)
- ออกแบบหน้าจอหน้า app — ยังไม่ได้เริ่ม
- เลือกวิธีเอาโมเดลเข้าเว็บ — รอโมเดลนิ่ง
