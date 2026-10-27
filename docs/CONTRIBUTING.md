# กติกาการทำงานร่วมกัน (Git)

## หลักสั้นๆ

1. **`git pull` ก่อนเริ่มงานทุกครั้ง**
2. **ห้าม commit / push เข้า `main` ตรงๆ** — ทำงานบน branch ของตัวเอง แล้วเปิด Pull Request
3. **แก้เฉพาะไฟล์ในส่วนที่ตัวเองรับผิดชอบ** — ถ้าต้องแก้ไฟล์ส่วนกลาง บอกในกลุ่มก่อน
4. **commit เล็กๆ บ่อยๆ** ดีกว่ารวมงานทั้งวันเป็น commit เดียว

## ขั้นตอนทำงาน 1 รอบ

```bash
# 1) เริ่มจาก main ล่าสุด
git switch main
git pull

# 2) แตก branch ใหม่สำหรับงานนี้
git switch -c feat/ชื่องาน

# 3) ทำงาน แล้ว commit
git add .
git commit -m "อธิบายสั้นๆ ว่าทำอะไร"

# 4) ส่งขึ้น GitHub
git push -u origin feat/ชื่องาน
```

5) เข้า GitHub → กด **Compare & pull request** → ให้เพื่อนอย่างน้อย 1 คนดู → รอเช็คขึ้น ✓ → **Merge**
6) กลับมาที่เครื่อง: `git switch main && git pull` แล้วเริ่มงานถัดไปจากข้อ 2

## ตั้งชื่อ branch

| ขึ้นต้นด้วย | ใช้เมื่อ | ตัวอย่าง |
|---|---|---|
| `feat/` | เพิ่มของใหม่ | `feat/capture-screen` |
| `fix/` | แก้บั๊ก | `fix/score-empty-row` |
| `docs/` | แก้เอกสาร | `docs/engine-format` |
| `chore/` | จัดไฟล์, ตั้งค่า | `chore/project-structure` |

## ใครดูแลส่วนไหน

| ส่วน | ไฟล์/โฟลเดอร์ | ผู้รับผิดชอบ |
|---|---|---|
| หน้า app | `public/` (`dashboard/` · `app/` · `shared/`) | [ ] |
| จุดเชื่อมโมเดล | `public/shared/pipeline.js`, `docs/ENGINE.md` | [ ] ร่วมกับทีมโมเดล |
| โมเดล | `model/` (+ งานวิจัยใน `research/`) ~~repo Computer-Vision~~ [claude/gelatin · 2026-10-28] | [ ] Prame |
| เอกสาร/สไลด์ | `docs/` | [ ] |

## รู้ได้ไงว่ามี commit ใหม่

- **VS Code:** Settings → ค้นหา `git.autofetch` → เปิด ✓ — แถบล่างซ้ายจะขึ้น `↓1` เมื่อมีของใหม่
- **GitHub Desktop:** fetch ให้อัตโนมัติ มีปุ่ม Pull origin ขึ้นมาเอง
- **คำสั่ง:** `git fetch` แล้ว `git status` → ถ้าขึ้น `behind 'origin/main' by N commits` แปลว่ามีของใหม่

## ถ้าเจอ conflict

```bash
git pull --rebase
```

ไฟล์ที่ชนจะมีเครื่องหมาย

```
<<<<<<< HEAD
ของคนอื่น
=======
ของเรา
>>>>>>>
```

แก้ให้เหลือแบบที่ถูกต้อง (VS Code มีปุ่ม Accept Current / Incoming / Both) แล้ว

```bash
git add <ไฟล์ที่แก้>
git rebase --continue
git push
```

ไม่แน่ใจ → หยุด แล้วถามในกลุ่มก่อน อย่าใช้ `git push --force`

## ห้ามเอาขึ้น git

- dataset / ภาพกระดาษคำตอบจริง (ไฟล์ใหญ่ + ข้อมูลนักเรียน)
- ไฟล์โมเดลขนาดใหญ่ (`.pt`, `.h5`, `.onnx` เกิน ~50 MB)
- `.env`, รหัสผ่าน, API key
