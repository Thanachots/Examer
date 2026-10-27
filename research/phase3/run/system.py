# ระบบรวม (ทุกชนิดกระดาษ): 1 → 2A → 2B (ว่าง/ตัวอักษร/ขีดฆ่า รายช่อง) → 3 (อ่านตัวอักษรรายแถว) → จับคู่ตัวอักษรเข้าช่อง → คำตอบรายช่อง
# คำตอบต่อช่อง: 'A'–'Z' · '' (ว่าง) · '-' (ขีดฆ่า) · '?' (ส่งครูตรวจ)
import numpy as np
TAU = 0.8
def assign(rows_cells, cls2b, letters_row, pred, conf):
    """rows_cells: [[(x0,y0,x1,y1) ×ช่อง] ×แถว] · cls2b: [[0/1/2 ×ช่อง] ×แถว] (0 ว่าง 1 ตัวอักษร 2 ขีดฆ่า)
    letters_row: [[(x0,y0,x1,y1) ×ตัว] ×แถว] จาก Phase 3 · pred/conf: [[ตัว ×ตัว] ×แถว]
    คืน answers[แถว][ช่อง] และ flags (เหตุผลที่ส่งครูตรวจ)"""
    A, F = [], []
    for ri, cells in enumerate(rows_cells):
        ans = [''] * len(cells); why = [''] * len(cells)
        xc = np.array([(c[0] + c[2]) / 2 for c in cells]); hit = [[] for _ in cells]; cover = np.zeros(len(cells), bool)
        # จับคู่ตามลำดับซ้าย→ขวา: ตัวละ 1 ช่อง · ช่องที่ใกล้จุดกลางที่สุดที่ยังว่างและอยู่ขวาของตัวก่อนหน้า (ตัวคร่อมเส้นไม่ชนกัน)
        last = -1
        for (b_, p, cf) in sorted(zip(letters_row[ri], pred[ri], conf[ri]), key=lambda q: q[0][0]):
            cx = (b_[0] + b_[2]) / 2; order = np.argsort(np.abs(xc - cx))
            k = next((int(k_) for k_ in order if k_ > last and abs(xc[k_] - cx) < 1.2 * (cells[0][2] - cells[0][0])), None)
            if k is None: k = int(order[0])
            hit[k].append((p, cf)); last = max(last, k)
            for kk, c in enumerate(cells):                                            # ช่องที่ตัวนี้คร่อมเข้าไป
                if min(b_[2], c[2]) - max(b_[0], c[0]) > 4: cover[kk] = True
        for k in range(len(cells)):
            c2 = cls2b[ri][k]
            if c2 == 2: ans[k] = '-'; continue                                       # ขีดฆ่า (2B)
            if not hit[k]:
                if c2 == 1 and not cover[k]: ans[k] = '?'; why[k] = '2B เห็นหมึก แต่ Phase 3 ไม่พบตัวอักษร'
                continue                                                             # ว่าง
            if len(hit[k]) > 1: ans[k] = '?'; why[k] = 'มีหลายตัวในช่องเดียว'; continue
            p, cf = hit[k][0]
            if cf < TAU: ans[k] = '?'; why[k] = f'ไม่มั่นใจ ({cf:.2f})'; continue
            ans[k] = p
        A.append(ans); F.append(why)
    return A, F
