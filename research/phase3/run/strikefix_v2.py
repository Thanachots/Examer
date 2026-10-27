# แก้ 2B ทาย "ขีดฆ่า" ผิดบนแผ่นเขียนทับเส้น: ในช่องเห็นแค่ขีดนอนของตัว I/T/H ที่ตัวจริงอยู่นอกกรอบ
# กฎ: ช่องที่ 2B ทายว่าขีดฆ่า ถ้ามีหมึกในช่องว่างระหว่างแถว (เหนือเส้นบน/ใต้เส้นล่าง) ในแนวเดียวกัน ≥ 25% ของหมึกในช่อง → ตัวอักษรคร่อมเส้น ไม่ใช่ขีดฆ่า → ว่าง
import numpy as np, cv2
def fix(col, rows, cls, ratio=0.25):
    g = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY); paper = float(np.median(g)); dark = g < paper - 45
    out = [list(r) for r in cls]
    for i, rw in enumerate(rows):
        h = rw['bot'][0] - rw['top'][1]
        up0 = rows[i - 1]['bot'][1] + 3 if i > 0 else rw['top'][0] - int(0.5 * h); up1 = rw['top'][0] - 2
        dn0 = rw['bot'][1] + 3; dn1 = rows[i + 1]['top'][0] - 2 if i + 1 < len(rows) else rw['bot'][1] + int(0.5 * h)
        for k, c in enumerate(rw['cells']):
            if out[i][k] != 2: continue
            x0, x1 = c[0] + 6, c[2] - 6
            inside = dark[c[1] + 6:c[3] - 6, x0:x1].sum()
            outside = (dark[up0:up1, x0:x1].sum() if up1 > up0 else 0) + (dark[dn0:dn1, x0:x1].sum() if dn1 > dn0 else 0)
            if inside > 0 and outside >= ratio * inside: out[i][k] = 0
    return out
