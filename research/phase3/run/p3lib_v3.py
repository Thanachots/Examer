# Phase 3 v3 (25 ต.ค. 2569 · สร้างจาก v2): ตัดสินพิกเซลบนเส้นพิมพ์ด้วยรูปทรง (ต่อเฉพาะจุดที่เส้นตัวอักษรลากผ่าน) ทุกแผ่น · เลิกใช้เกณฑ์สลับโหมดด้วยสี t < 6
# (เดิม: Phase 3 v2 สร้างจาก p3lib.py ที่ล็อก): + ตัดเศษเส้นพิมพ์แนวนอนก่อนจัดกลุ่ม + ตัดเศษเล็กผิดปกติท้ายแถว · พัฒนาบน Train 30 + Valid 10 + IMG_5417 + IMG_8029
# Phase 3 library: หมึกจากสี (เส้นที่ track ได้ + likelihood ratio สีรายแผ่น) → แยกตัวอักษรรายแถว → ภาพ 48×48
# ที่มา: phase3/exp_lines/prep_test5.py (mode track_lr) — คัดลอกมาเป็นโมดูล ไม่แก้ตรรกะ
import cv2, numpy as np
S = 48
def blueness(c):
    b, g, r = [c[..., i].astype(np.int16) for i in range(3)]; return b - (r + g) // 2
def linemask(shape, rows, w=1):
    lm = np.zeros(shape, bool)
    for rw in rows:
        x0, x1 = rw['cells'][0][0] - 45, rw['cells'][-1][2] + 8
        for (a, c) in (rw['top'], rw['bot']): lm[a - w:c + 1 + w, x0:x1] = True
        for (a, c) in rw['vlines']: lm[rw['top'][0] - 3:rw['bot'][1] + 4, a - w:c + 1 + w] = True
    return lm
def norm(mask):
    ys, xs = np.nonzero(mask)
    if len(ys) == 0: return None
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8) * 255
    h, w = m.shape; s = max(h, w) + 4; o = np.zeros((s, s), np.uint8)
    o[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = m
    return cv2.resize(o, (S, S), interpolation=cv2.INTER_AREA)
def track_h(g, bl, a, c, x0, x1, tl, step=8, win=24):
    """หาแนวเส้นนอนจริงทีละช่วง → (xs, top, bot) · ใช้เฉพาะพิกเซลเข้มที่ไม่ใช่สีหมึก"""
    xs, tops, bots = [], [], []
    for x in range(x0, x1, step):
        p = (g[a - 12:c + 13, x:x + win] < 185) & (bl[a - 12:c + 13, x:x + win] <= tl)
        frac = p.mean(1); r = np.nonzero(frac >= 0.6)[0]
        if len(r) == 0: continue
        # เลือกกลุ่มแถวที่ติดกันและใกล้ค่ากลางเดิมที่สุด
        grp = np.split(r, np.nonzero(np.diff(r) > 1)[0] + 1); mid = 12 + (c - a) / 2
        gg = min(grp, key=lambda q: abs(q.mean() - mid))
        xs.append(x + win // 2); tops.append(a - 12 + gg[0]); bots.append(a - 12 + gg[-1])
    if len(xs) < 5: return None
    t = np.array(tops, float); b = np.array(bots, float)
    tm = np.array([np.median(t[max(0, i - 3):i + 4]) for i in range(len(t))]); bm = np.array([np.median(b[max(0, i - 3):i + 4]) for i in range(len(b))])
    return np.array(xs), tm, bm

def track_v(g, bl, a, c, y0, y1, tl, step=8, win=24):
    r = track_h(g.T, bl.T, a, c, y0, y1, tl, step, win); return r

def build(c, rows, mode):
    g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY); bl = blueness(c)
    tab = np.zeros(g.shape, bool)
    for rw in rows: tab[rw['top'][0] - 50:rw['bot'][1] + 50, rw['cells'][0][0] - 50:rw['cells'][-1][2] + 10] = True
    paper = np.median(g[tab]); lm0 = linemask(g.shape, rows, 3)
    # เกณฑ์สีหมึกรายแผ่น (เหมือนเดิม)
    dark0 = g < 170; inkfree0 = dark0 & ~lm0 & tab
    far = dark0 & lm0 & ~cv2.dilate(inkfree0.astype(np.uint8), np.ones((11, 11))).astype(bool)
    Lv, Iv = bl[far], bl[inkfree0]; ts = np.arange(-5, 40); t = int(ts[int(np.argmax([(Iv > x).mean() - (Lv > x).mean() for x in ts]))])
    tl = max(2, t // 2)
    # (2) ความเข้มปรับรายแผ่น: หมึก = เข้มกว่าพื้นกระดาษอย่างชัดเจน หรือเป็นสีหมึก
    ink_dark = (g < paper - 45) | ((g < paper - 20) & (bl > t))
    if mode == 'old': ink_dark = g < 170
    # (1) มาสก์เส้นตามจริง
    if mode in ('track', 'track_bridge', 'old', 'track_lr'):
        lm = np.zeros(g.shape, bool); hb = []; vbands = []
        for rw in rows:
            x0, x1 = rw['cells'][0][0] - 45, rw['cells'][-1][2] + 8
            for (a, cc) in (rw['top'], rw['bot']):
                r = track_h(g, bl, a, cc, x0, x1, tl)
                if r is None: lm[a - 3:cc + 4, x0:x1] = True; hb.append((None, a, cc, x0, x1)); continue
                xs, tm, bm = r
                for x in range(x0, x1):
                    k = int(np.clip(np.searchsorted(xs, x), 0, len(xs) - 1)); lm[int(tm[k]) - 1:int(bm[k]) + 2, x] = True
                hb.append((r, a, cc, x0, x1))
            for (a, cc) in rw['vlines']:
                y0, y1 = rw['top'][0] - 2, rw['bot'][1] + 3
                r = track_v(g, bl, a, cc, y0, y1, tl, step=6, win=16)
                if r is None: lm[y0:y1, a - 3:cc + 4] = True; continue
                ys, lt, rt = r
                for y in range(y0, y1):
                    k = int(np.clip(np.searchsorted(ys, y), 0, len(ys) - 1)); lm[y, int(lt[k]) - 1:int(rt[k]) + 2] = True
                vbands.append((ys, lt, rt, y0, y1))
    else:
        lm = lm0
    near = cv2.dilate(lm.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & ~lm   # ขอบเส้น (±4 px)
    if mode == 'track_lr':
        # ต้นเหตุ: ไม่ใช้ค่าตายตัว → เรียนสีเส้น/สีหมึกจากแผ่นนี้เอง (ฮิสโทแกรม 2 มิติ: ความเข้ม × ความน้ำเงิน) แล้วตัดสินด้วยอัตราส่วนความน่าจะเป็น
        nonpaper = g < paper - 20
        zone = (lm | near) & tab
        inkcore = nonpaper & tab & ~cv2.dilate(lm.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
        linecls = zone & nonpaper & ~cv2.dilate(inkcore.astype(np.uint8), np.ones((11, 11), np.uint8)).astype(bool)
        gb = np.clip((g.astype(int) // 12), 0, 21); bb = np.clip((bl.astype(int) + 10) // 3, 0, 29)
        Hi = np.ones((22, 30)); Hl = np.ones((22, 30))
        np.add.at(Hi, (gb[inkcore], bb[inkcore]), 1); np.add.at(Hl, (gb[linecls], bb[linecls]), 1)
        Hi = cv2.GaussianBlur(Hi / Hi.sum(), (3, 3), 0); Hl = cv2.GaussianBlur(Hl / Hl.sum(), (3, 3), 0)
        LR = Hi / Hl
        isink = LR[gb, bb] > 1.0
        inkfree = (g < paper - 35) & ~zone & tab
        ink = inkfree | (zone & nonpaper & isink)
    else:
        inkfree = ink_dark & ~lm & tab & ~(near & (bl <= tl))
        ink = inkfree | (lm & ink_dark & (bl > t) & tab)
    # ตัดเศษเส้น: แนวยาว (≥31 px) ที่บาง (≤3 px) ใกล้เส้นพิมพ์ = ขอบเส้นที่หลุดมาสก์ ไม่ใช่เส้นตัวอักษร
    band = cv2.dilate(lm.astype(np.uint8), np.ones((17, 17), np.uint8)) > 0
    R = (ink & band).astype(np.uint8)
    for k_long, k_thick in (((1, 31), (4, 1)), ((31, 1), (1, 4))):
        longr = cv2.morphologyEx(R, cv2.MORPH_OPEN, np.ones(k_long[::-1] if False else (k_long[0], k_long[1]), np.uint8))
        thick = cv2.dilate(cv2.morphologyEx(R, cv2.MORPH_OPEN, np.ones((k_thick[0], k_thick[1]), np.uint8)), np.ones((3, 3), np.uint8))
        ink = ink & ~((longr > 0) & (thick == 0))
    if mode == 'track_bridge':
        # (3) ต่อเส้นตัวอักษร: คอลัมน์ไหนมีหมึกติดขอบบนและขอบล่างของแถบเส้นนอน → เติมแถบตรงนั้น (เส้นตั้งทำแนวเดียวกันแบบแนวนอน)
        add = np.zeros_like(ink)
        H_, W_ = g.shape
        ys_, xs_ = np.nonzero(lm)
        # แนวนอน: สำหรับทุกคอลัมน์ หาเซ็กเมนต์มาสก์ต่อเนื่องแนวตั้ง
        lmu = lm.astype(np.uint8)
        up = np.zeros_like(lmu); up[1:] = lmu[:-1]
        starts = np.nonzero((lmu == 1) & (up == 0))
        for y, x in zip(*starts):
            h = 0
            while y + h < H_ and lm[y + h, x]: h += 1
            if h > 16: continue
            if ink[max(0, y - 3):y, x].any() and ink[y + h:y + h + 3, x].any(): add[y:y + h, x] = True
        lft = np.zeros_like(lmu); lft[:, 1:] = lmu[:, :-1]
        starts = np.nonzero((lmu == 1) & (lft == 0))
        for y, x in zip(*starts):
            w = 0
            while x + w < W_ and lm[y, x + w]: w += 1
            if w > 16: continue
            if ink[y, max(0, x - 3):x].any() and ink[y, x + w:x + w + 3].any(): add[y, x:x + w] = True
        ink = ink | (add & tab)
    return ink, lm, bl, t, tab


SIDE = ['top', 'bottom', 'left', 'vline']
def side(ri): return SIDE[(ri // 2) % 4]
def expected(ri): return 'ABCDEFGHIJKLM' if ri % 2 == 0 else 'NOPQRSTUVWXYZ'

FRAG_H, FRAG_AR = 7, 3
CLEAN_CROP, DROP_LEFT, DROP_FRAG, FRAG_A, FRAG_HR = False, False, True, 0.25, 0.45
def letters(c, rows, gap=10, min_px=60, force_geo=False):
    """คืน list ต่อแถว: [(ภาพ48, (x0,y0,x1,y1))] เรียงซ้าย→ขวา"""
    ink, lm, bl, t, tab = build(c, rows, 'track_lr')
    # ปากกาสีเข้ม/ดำ (เกณฑ์สีรายแผ่น t ต่ำ: แยกหมึกจากเส้นด้วยสีไม่ได้) → ใช้รูปทรง: ตัดเส้นที่ track ได้ แล้วต่อเฉพาะจุดที่เส้นตัวอักษรตัดผ่าน (ด้านบนและล่างมีหมึก)
    # Train t = 7–16 (ปากกาน้ำเงิน) · Val t = 1–5 (ปากกาเข้ม) → เกณฑ์ 6
    geo = True  # [ต้นเหตุ] แยกเส้นด้วยตำแหน่งทุกแผ่น ไม่ขึ้นกับสีหมึก
    if geo: ink, lm, bl, t2, tab = build(c, rows, 'track_bridge')
    # เลขแถวที่พิมพ์ (ซ้ายของช่องแรก) เป็นหมึกดำ ไม่ใช่สีหมึกลายมือ → ตัดเฉพาะพิกเซลที่ไม่ใช่สีหมึก (เกณฑ์สีรายแผ่น t) ในแถบนี้
    # เลขแถวที่พิมพ์: ลบด้วยแม่แบบของที่พิมพ์ (เรียนจาก train · หน้าสแกนถูกจัดตำแหน่งตรงแม่แบบแล้วใน Phase 1) — ใช้ได้ทั้งปากกาสีและสีเข้ม
    import os
    tp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'print_template.npz')
    if os.path.exists(tp):
        PT = cv2.dilate(np.load(tp)['P'].astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        xL0 = min(rw['cells'][0][0] for rw in rows); ink[:, :xL0 - 3] &= ~PT[:, :xL0 - 3]
    for rw in rows:
        x0 = rw['cells'][0][0]; y0, y1 = rw['top'][0] - 30, rw['bot'][1] + 30
        if not geo: strip = ink[y0:y1, max(0, x0 - 70):x0 - 2]; strip &= ~(bl[y0:y1, max(0, x0 - 70):x0 - 2] <= t)
    n, lab, st, cen = cv2.connectedComponentsWithStats((ink & tab).astype(np.uint8), 8)
    centers = np.array([(rw['top'][0] + rw['bot'][1]) / 2 for rw in rows])
    # เจ้าของหมึก: ชิ้นที่ถูกเส้นพิมพ์ตัดขาด (บน/ล่างของเส้นนอน) รวมกลับเป็นตัวเดียวกัน ก่อนกำหนดแถว
    mbl = np.bincount(lab.ravel(), weights=bl.ravel().astype(float), minlength=n) / np.maximum(st[:, 4], 1)
    xL = min(rw['cells'][0][0] for rw in rows)
    # ชิ้นที่อยู่ในคอลัมน์เลขแถว (ขวาสุดไม่เกินขอบช่องแรก +8) และไม่ใช่สีหมึก = เลขพิมพ์ → ตัดทิ้ง
    big = [j for j in range(1, n) if st[j, 4] >= 15 and not (st[j, 0] + st[j, 2] < xL + 8 and (mbl[j] < t or geo))]; par = {j: j for j in big}
    def f(j):
        while par[j] != j: par[j] = par[par[j]]; j = par[j]
        return j
    HL = [tuple(ln) for rw in rows for ln in (rw['top'], rw['bot'])]
    # [dev] เศษเส้นพิมพ์แนวนอนที่หลุดเป็นหมึก (บาง ยาว อยู่บนเส้น) → ตัดทิ้ง ก่อนจัดกลุ่ม · ไม่งั้นจะพาตัวอักษรหลายตัวรวมเป็นก้อนเดียว
    def _hfrag(j):
        x, y, w, h = st[j, :4]
        if h > FRAG_H or w < FRAG_AR * h or w < 12: return False
        return any(a0 - 6 <= y and y + h <= a1 + 6 for a0, a1 in HL)
    big = [j for j in big if not _hfrag(j)]; par = {j: j for j in big}
    lmd = cv2.dilate(lm.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    hl = np.zeros(lab.shape[0], bool)
    for rw in rows:
        for (a, cc) in (rw['top'], rw['bot']): hl[max(0, a - 3):cc + 4] = True
    for ii, i in enumerate(big):
        xi0, yi0, wi, hi = st[i, :4]
        for j in big[ii + 1:]:
            xj0, yj0, wj, hj = st[j, :4]
            ov = min(xi0 + wi, xj0 + wj) - max(xi0, xj0)
            if ov < 0.3 * min(wi, wj): continue
            if yi0 + hi <= yj0: g0, g1 = yi0 + hi, yj0
            elif yj0 + hj <= yi0: g0, g1 = yj0 + hj, yi0
            else: continue
            if g1 - g0 > 14: continue
            # ช่องว่างระหว่างสองท่อนต้องมีเส้นพิมพ์ "เส้นเดียว" และสองท่อนแตะเส้นนั้นจากคนละฝั่ง
            hit = [(a0, a1) for a0, a1 in HL if a1 + 6 >= g0 and a0 - 6 <= g1]
            if len(hit) == 1 and g0 >= hit[0][0] - 6 and g1 <= hit[0][1] + 6: par[f(i)] = f(j)
    comp = {}
    for j in big: comp.setdefault(f(j), []).append(j)
    per = [[] for _ in rows]
    for root, js in comp.items():
        a = st[js, 4].astype(float); cy = float((cen[js, 1] * a).sum() / a.sum())
        y0c = int(min(st[j, 1] for j in js)); y1c = int(max(st[j, 1] + st[j, 3] for j in js))
        ov = np.array([max(0, min(y1c, rw['bot'][0]) - max(y0c, rw['top'][1])) for rw in rows])
        d = np.abs(centers - cy)
        if ov.max() > 0: ri = int(np.argmax(ov))
        else:
            ri = int(np.argmin(d))
            if d[ri] > 90: continue
        per[ri].extend(js)
    out = []
    if CLEAN_CROP:
        nol = (ink & ~lm).astype(np.uint8); K = 9
        kd = np.zeros((2 * K + 1, 1), np.uint8); kd[:K + 1] = 1   # มีหมึกด้านบนภายใน K px
        ku = np.zeros((2 * K + 1, 1), np.uint8); ku[K:] = 1       # มีหมึกด้านล่างภายใน K px
        kl = kd.T.copy(); kr = ku.T.copy()
        cross = (cv2.dilate(nol, kd) & cv2.dilate(nol, ku)) | (cv2.dilate(nol, kl) & cv2.dilate(nol, kr))
        keep = ~lm | (cross > 0)
    for ri, js in enumerate(per):
        js = sorted(js, key=lambda j: st[j, 0]); groups = []
        for j in js:
            x0, x1 = st[j, 0], st[j, 0] + st[j, 2]
            if groups and x0 <= groups[-1][1] + gap: groups[-1][1] = max(groups[-1][1], x1); groups[-1][2].append(j)
            else: groups.append([x0, x1, [j]])
        # กลุ่มที่กว้างผิดปกติ (สองตัวติดกันผ่านเส้น) → แยกที่คอลัมน์หมึกน้อยสุดช่วงกลาง
        if len(groups) >= 3:
            wmed = float(np.median([g_[1] - g_[0] for g_ in groups])); ng = []
            for x0, x1, gj in groups:
                if x1 - x0 > 1.9 * wmed:
                    ys = np.concatenate([[st[j, 1], st[j, 1] + st[j, 3]] for j in gj]); m_ = np.isin(lab[ys.min():ys.max(), x0:x1], gj)
                    prof = m_.sum(0).astype(float); a_, b_ = int(0.25 * len(prof)), int(0.75 * len(prof)); cut = x0 + a_ + int(np.argmin(prof[a_:b_]))
                    L1 = [j for j in gj if st[j, 0] + st[j, 2] / 2 < cut]; R1 = [j for j in gj if st[j, 0] + st[j, 2] / 2 >= cut]
                    if L1 and R1: ng += [(x0, cut, L1), (cut, x1, R1)]; continue
                    lab_ = lab  # ชิ้นเดียวยาว: ตัดพิกเซลตามแนว cut
                    ng += [(x0, cut, gj), (cut, x1, gj)]; continue
                ng.append((x0, x1, gj))
            groups = ng
        VX = [(v[0] + v[1]) / 2 for v in rows[ri]['vlines']]; rh = rows[ri]['bot'][1] - rows[ri]['top'][0]
        hs = [max(st[j, 1] + st[j, 3] for j in gj) - min(st[j, 1] for j in gj) for _, _, gj in groups]
        hmed = float(np.median(hs)) if hs else 0
        items = []
        for x0, x1, gj in groups:
            if x1 - x0 < 9 and VX and min(abs((x0 + x1) / 2 - v) for v in VX) < 6: continue   # เศษเส้นตั้ง
            ys = np.concatenate([[st[j, 1], st[j, 1] + st[j, 3]] for j in gj]); y0, y1 = int(ys.min()), int(ys.max())
            sub = np.isin(lab[y0:y1, x0:x1], gj)
            # สูงผิดปกติ (ติดตัวของแถวข้างเคียงมา) → เก็บเฉพาะหน้าต่างสูง ~1.2 เท่าค่ากลางที่หมึกมากสุดและซ้อนกับแถวนี้
            if hmed and y1 - y0 > 1.45 * hmed:
                wh = int(1.2 * hmed); pr = np.concatenate([[0], np.cumsum(sub.sum(1))]); best = None
                for o in range(0, y1 - y0 - wh + 1):
                    ya, yb = y0 + o, y0 + o + wh
                    if min(yb, rows[ri]['bot'][0]) - max(ya, rows[ri]['top'][1]) <= 0: continue
                    v = pr[o + wh] - pr[o]
                    if best is None or v > best[0]: best = (v, o)
                if best is not None:
                    o = best[1]; sub = sub[o:o + wh]; y0, y1 = y0 + o, y0 + o + wh
            if sub.sum() < 300 and (lmd[y0:y1, x0:x1][sub]).mean() > 0.85: continue      # เศษกรอบช่อง (หมึกเกือบทั้งหมดอยู่ชิดเส้น)
            if sub.sum() < min_px: continue
            m = np.zeros(lab.shape, bool); m[y0:y1, x0:x1] = sub
            if y1 - y0 < 14: continue                                   # เศษเส้น (ตัวอักษรสูง ≥ 20 px)
            if not geo and float(np.median(bl[m])) < t * 0.6: continue
            if x1 < rows[ri]['cells'][0][0] - 10 and (geo or float(bl[m].mean()) < t): continue
            if CLEAN_CROP:
                s2 = sub & keep[y0:y1, x0:x1]
                if s2.sum() >= min_px: sub = s2
            if DROP_LEFT and (x0 + x1) / 2 < rows[ri]['cells'][0][0]: continue   # เศษเลขแถวที่พิมพ์
            items.append((norm(sub), (int(x0), y0, int(x1), y1), int(sub.sum()), y1 - y0))
        if DROP_FRAG and len(items) >= 5:   # เศษเส้น/เศษตัวอักษรเล็กผิดปกติ (หมึกน้อยหรือเตี้ยมากเทียบตัวอื่นในแถว)
            am = float(np.median([it[2] for it in items])); hm = float(np.median([it[3] for it in items]))
            items = [it for it in items if not (it[2] < FRAG_A * am or it[3] < FRAG_HR * hm)]
        out.append([(a, b) for a, b, _, _ in items])
    return out, (t, geo)

def ed(a, b):
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(b) + 1): p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] != b[j - 1]))
    return d[-1]
