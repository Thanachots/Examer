# รอบ 5: (1) มาสก์เส้นวิ่งตามเส้นจริง (2) เกณฑ์ความเข้มปรับรายแผ่น (3) ต่อเส้นตัวอักษรที่ถูกเส้นตัด
import cv2, numpy as np, sys, os
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(H, '..', '..', 'phase2')); import phase2a_locked as A
exec(open(os.path.join(H, 'prep_test.py')).read().split('# ---------- train ----------')[0])
src2 = open(os.path.join(H, 'prep_test2.py')).read()

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

fn = sys.argv[1]; c = cv2.imread(os.path.join(H, 'new_scans4', fn + '.png')); rows = A.detect(c)
arr = {}
for mode in sys.argv[2:]:
    ink, lm, bl, t, tab = build(c, rows, mode)
    body = src2.split("        ink = ink.copy()")[1].split("        print(")[0]
    loc = dict(ink=ink, rows=rows, lm=lm, bl=bl, t=t, np=np, cv2=cv2, norm=norm, S=S, arr=arr, f=fn + '.png', name=mode, os=os)
    exec("ink = ink.copy()\n" + "\n".join(l[8:] for l in body.split("\n")), loc)
    print(fn, mode, 't', t, 'letters', sum(len(arr[k]) for k in arr if f'|{mode}|' in k), flush=True)
    if fn == 'IMG_5419' and mode == sys.argv[-1]:
        out = []
        for ri in (0, 1, 2, 3):
            rw = rows[ri]; y0, y1 = rw['top'][0] - 55, rw['bot'][1] + 55; x0 = rw['cells'][0][0] - 50; x1 = x0 + 1380
            o = c[y0:y1, x0:x1].copy(); o2 = o.copy(); o2[lm[y0:y1, x0:x1]] = (0, 0, 255)
            m = np.where(ink[y0:y1, x0:x1, None], np.array([150, 60, 20], np.uint8), np.uint8(255))
            out += [o2, m]
        cv2.imwrite(os.path.join(H, f'diag5_{mode}.jpg'), cv2.resize(np.vstack(out), None, fx=0.8, fy=0.8), [cv2.IMWRITE_JPEG_QUALITY, 85])
np.savez_compressed(os.path.join(H, f'feas5_{fn}_{"_".join(sys.argv[2:])}.npz'), **arr)
