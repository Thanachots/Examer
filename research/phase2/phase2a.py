# Phase 2A — หาช่องคำตอบจากเส้นในภาพสแกน (โมดูล ไม่มีการเทรน)
# ขั้น: (1) ภาพไบนารีของเส้น → (2) เส้นนอนยาว = ขอบแถว → จับคู่บน/ล่างเป็นแถว
#       (3) ในแต่ละแถว เส้นตั้งที่สูงเกือบเต็มแถว = เส้นแบ่งช่อง → (4) ช่อง = ระหว่างเส้นตั้งติดกัน → (5) crop หดเข้า 5 px
import cv2, numpy as np

TABLE_X = (230, 2260)        # แนวตารางคำตอบ (ใช้จำกัดพื้นที่ค้นหาเท่านั้น)
TABLE_Y = (820, 3260)
DARK = 205                   # เส้นพิมพ์บนภาพลบเงา (พื้น ≈ 248) · เส้นช่องบางเส้นจาง 110–140 และขอบเบลอ
MIN_GAP = 60                 # ช่องกว้าง ~98 px · เส้นที่ห่างกันน้อยกว่านี้ = เส้นลายมือแทรก → เก็บเส้นที่เข้มกว่า
ROW_GAP = (65, 100)          # ระยะเส้นบน→ล่างของแถว (ด้านใน)
INSET = 7                    # Dev กระดาษเปล่า: 5 → crop สะอาด 99.04% (เส้นบนเอียงแตะขอบ crop) · 6 → 99.94% · 7 → 100%
HALF = 3                     # ครึ่งความหนาเส้น · ช่อง = ภายในเส้น นิยามจากกึ่งกลางเส้น (เหมือน GT)

def _groups(idx, gap=2):
    g = []
    for i in idx:
        if g and i - g[-1][-1] <= gap: g[-1].append(i)
        else: g.append([i])
    return [(int(min(a)), int(max(a))) for a in g]

def detect(scan_bgr):
    g = cv2.cvtColor(scan_bgr, cv2.COLOR_BGR2GRAY) if scan_bgr.ndim == 3 else scan_bgr
    b = (g < DARK).astype(np.uint8)
    x0, x1 = TABLE_X; y0, y1 = TABLE_Y
    # (2) เส้นนอน: เปิดด้วยแท่งนอนยาว 400 px → ตัวหนังสือ/ลายมือหายหมด
    # หนาเส้นขึ้น ±2 px ตามแนวตั้งก่อน → เส้นที่เอียง/โค้งเล็กน้อย (กระดาษโค้ง) ยังต่อกันเป็นแนวยาวได้ · กึ่งกลางเส้นไม่เปลี่ยน
    hl = cv2.morphologyEx(cv2.dilate(b[y0:y1, x0:x1], np.ones((5, 1), np.uint8)), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (400, 1)))
    lines = _groups(np.where(hl.mean(1) > 0.5)[0] + y0)
    rows, i = [], 0
    while i < len(lines) - 1:
        top, bot = lines[i], lines[i + 1]
        if ROW_GAP[0] <= bot[0] - top[1] <= ROW_GAP[1]: rows.append((top, bot)); i += 2
        else: i += 1
    out = []
    for top, bot in rows:
        ya, yb = top[1] + 1, bot[0] - 1; band = b[ya:yb, x0 - 30:x1 + 30]; hh = band.shape[0]
        # (3) เส้นตั้ง: เปิดด้วยแท่งตั้งยาว 85% ของความสูงแถว → เส้นตัวอักษรส่วนใหญ่สั้นกว่า
        band = cv2.morphologyEx(band, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 7)))   # ต่อเส้นที่ขาดเป็นช่วง
        band = cv2.dilate(band, np.ones((1, 3), np.uint8))                                                  # เส้นเอียงเล็กน้อย
        vl = cv2.morphologyEx(band, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, int(hh * 0.75)))))
        prof = vl.mean(0)
        V = [(a + x0 - 30, c + x0 - 30, float(prof[a:c + 1].max())) for a, c in _groups(np.where(prof > 0.5)[0], gap=3)]
        V = [v for v in V if v[1] - v[0] <= 14]                       # เส้นกรอบบาง (ตัดก้อนหมึกหนา)
        K = []
        for v in V:                                                    # เส้นที่ชิดกันเกิน → เก็บเส้นที่เต็มกว่า (เส้นพิมพ์ยาวเต็มแถว)
            if K and v[0] - K[-1][1] < MIN_GAP:
                if v[2] > K[-1][2]: K[-1] = v
            else: K.append(v)
        V = [(a, c) for a, c, _ in K]
        # เส้นแบ่งช่องที่พิมพ์จางมาก (เทาอ่อนกว่าเกณฑ์) → ช่องว่างกว้าง ~2 เท่า · หาเส้นกลางจากโปรไฟล์ความเข้มภาพเทา
        F = []
        for k in range(len(V)):
            F.append(V[k])
            if k + 1 < len(V) and 170 <= V[k + 1][0] - V[k][1] <= 230:
                m = (V[k][1] + V[k + 1][0]) // 2; xa = m - 25
                p = g[ya + 8:yb - 8, xa:m + 26].astype(np.float32).mean(0)
                i = int(np.argmin(p)); bgv = float(np.median(g[ya + 8:yb - 8, V[k][1] + 10:V[k + 1][0] - 10]))
                if p[i] < bgv - 12: F.append((xa + i - 1, xa + i + 1))
        V = F
        tc, bc = (top[0] + top[1]) / 2, (bot[0] + bot[1]) / 2; vc = [(a + c) / 2 for a, c in V]
        cells = [(int(round(vc[k] + HALF)), int(round(tc + HALF)), int(round(vc[k + 1] - HALF)), int(round(bc - HALF))) for k in range(len(V) - 1)]
        out.append(dict(top=top, bot=bot, vlines=V, cells=cells))
    return out

def crops(scan_bgr, rows, inset=INSET):
    return [[scan_bgr[c[1] + inset:c[3] - inset + 1, c[0] + inset:c[2] - inset + 1] for c in r['cells']] for r in rows]

# ---------------- วัดผล ----------------
def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]) + 1); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]) + 1)
    inter = ix * iy; ua = (a[2] - a[0] + 1) * (a[3] - a[1] + 1) + (b[2] - b[0] + 1) * (b[3] - b[1] + 1) - inter
    return inter / ua if ua > 0 else 0.0

def evaluate(rows, GT, scan_bgr=None, blank=False):
    R = {'gt_rows': len(GT), 'det_rows': len(rows)}
    gtr = [(r['cells'][0][0], r['top'][0], r['cells'][-1][2], r['bot'][1]) for r in GT]
    dtr = [(r['cells'][0][0], r['top'][0], r['cells'][-1][2], r['bot'][1]) if r['cells'] else (0, r['top'][0], 1, r['bot'][1]) for r in rows]
    match = {}
    for j, d in enumerate(dtr):
        k = int(np.argmax([iou(d, g) for g in gtr]));
        if iou(d, gtr[k]) >= 0.5 and k not in match.values(): match[j] = k
    R['rows_found'] = len(set(match.values())); R['row_count_ok'] = sum(len(rows[j]['cells']) == len(GT[k]['cells']) for j, k in match.items())
    R['counts'] = [len(r['cells']) for r in rows]
    gc = [c for r in GT for c in r['cells']]; dc = [c for r in rows for c in r['cells']]
    for t in (0.6, 0.7, 0.8, 0.9):
        used, tp = set(), 0
        for d in dc:
            best, bi = 0, -1
            for i, gg in enumerate(gc):
                if i in used or abs(gg[0] - d[0]) > 120 or abs(gg[1] - d[1]) > 120: continue
                v = iou(d, gg)
                if v > best: best, bi = v, i
            if best >= t: used.add(bi); tp += 1
        P = tp / len(dc) if dc else 0; Rr = tp / len(gc); R[f'f1_{t}'] = 2 * P * Rr / (P + Rr) if P + Rr else 0
    R['wavg_f1'] = sum(t * R[f'f1_{t}'] for t in (0.6, 0.7, 0.8, 0.9)) / sum((0.6, 0.7, 0.8, 0.9))
    if blank and scan_bgr is not None:
        g = cv2.cvtColor(scan_bgr, cv2.COLOR_BGR2GRAY); fr = []
        for r in rows:
            for c in r['cells']:
                cr = g[c[1] + INSET:c[3] - INSET + 1, c[0] + INSET:c[2] - INSET + 1]
                if cr.size: fr.append(float((cr < 128).mean()))
        R['crop_dark'] = fr; R['crop_clean'] = int(sum(f <= 0.002 for f in fr)); R['crop_total'] = len(fr)
    R['page_ok'] = bool(R['rows_found'] == 20 and len(rows) == 20 and all(n == 20 for n in R['counts']))
    return R
