# ต้นแบบ Phase 1 แบบแอปสแกนเอกสาร (ใช้ทำภาพประกอบขั้นตอนเท่านั้น)
import cv2, numpy as np
W, H = 2480, 3508
CANON = np.float32([[177.5, 175.0], [2306.5, 175.0], [2306.5, 3332.0], [177.5, 3332.0]])  # TL(virtual) TR BR BL

def load(path, max_side=None):
    im = cv2.imread(path)
    return im

def small_of(im, side=1000):
    s = side / max(im.shape[:2]); return cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), s

def edges(small):
    g = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    b = cv2.GaussianBlur(g, (5, 5), 0)
    e = cv2.Canny(b, 40, 120)
    e = cv2.dilate(e, np.ones((3, 3), np.uint8), iterations=2)
    return g, b, e

def order(q):
    q = np.float32(q).reshape(4, 2); s = q.sum(1); d = np.diff(q, axis=1).ravel()
    return np.float32([q[np.argmin(s)], q[np.argmin(d)], q[np.argmax(s)], q[np.argmax(d)]])

def find_quads(e, area_min=0.15):
    h, w = e.shape; cnts, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in cnts:
        hull = cv2.convexHull(c); a = cv2.contourArea(hull)
        if a < area_min * h * w: continue
        ap = cv2.approxPolyDP(hull, 0.02 * cv2.arcLength(hull, True), True)
        if len(ap) == 4:
            q = order(ap); sides = [np.linalg.norm(q[i] - q[(i + 1) % 4]) for i in range(4)]
            ratio = max(sides[0] + sides[2], sides[1] + sides[3]) / min(sides[0] + sides[2], sides[1] + sides[3])
            out.append((a, ratio, q))
    out.sort(key=lambda x: -x[0])
    return out

def pick(quads):
    # สี่เหลี่ยมใหญ่สุดที่สัดส่วนใกล้ A4 (1.414)
    for a, r, q in quads:
        if 1.2 < r < 1.65: return q, r
    return (quads[0][2], quads[0][1]) if quads else (None, None)

def refine(gray_full, q, win=25):
    # ขยับมุมให้แม่นบนภาพเต็ม: หาจุดมุมที่ชัดที่สุดในหน้าต่างรอบมุม
    out = []
    for p in q:
        x, y = int(p[0]), int(p[1]); x0, y0 = max(0, x - win), max(0, y - win)
        roi = np.float32(gray_full[y0:y + win, x0:x + win])
        pts = cv2.goodFeaturesToTrack(roi, 1, 0.01, 5) if roi.size else None
        if pts is not None:
            c = pts[0, 0] + [x0, y0]
            out.append(c if np.linalg.norm(c - p) < win else p)
        else: out.append(p)
    return np.float32(out)

def warp(im, q):
    w_ = np.linalg.norm(q[0] - q[1]); h_ = np.linalg.norm(q[0] - q[3])
    if w_ > h_:   # กระดาษวางแนวนอน → หมุนลำดับมุมให้ด้านยาวเป็นแนวตั้ง
        q = np.float32([q[3], q[0], q[1], q[2]])
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    return cv2.warpPerspective(im, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255)), M

def corner_marks(rect):
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY)
    res = {}
    for name, (x0, y0) in {'TL': (0, 0), 'TR': (W - 420, 0), 'BR': (W - 420, H - 420), 'BL': (0, H - 420)}.items():
        roi = g[y0:y0 + 420, x0:x0 + 420]
        _, b = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        cnts, _ = cv2.findContours(b, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        for c in cnts:
            a = cv2.contourArea(c); x, y, w, h = cv2.boundingRect(c)
            if 6000 < a < 40000 and 0.7 < w / h < 1.4 and a / (w * h) > 0.75:
                if best is None or a > best[0]: best = (a, (x + x0 + w / 2, y + y0 + h / 2), (x + x0, y + y0, w, h))
        if best:
            x, y, w, h = best[2]; inner = g[y + h // 4:y + 3 * h // 4, x + w // 4:x + 3 * w // 4]
            res[name] = dict(c=best[1], box=best[2], white=float((inner > 128).mean()))
    return res

def orient(rect):
    m = corner_marks(rect)
    # มุมที่ไม่มีหมุด = บนซ้าย · หมุดที่มีเลข 2 (ข้างในมีสีขาว) = บนขวา
    rot = 0
    for k in range(4):
        mm = corner_marks(rect) if k else m
        two = max(mm.items(), key=lambda kv: kv[1]['white'])[0] if mm else None
        if two == 'TR' and 'TL' not in mm: return rect, rot, mm
        rect = cv2.rotate(rect, cv2.ROTATE_90_CLOCKWISE); rect = cv2.resize(rect, (W, H)); rot += 90
    return rect, rot, m

def enhance(rect, mode='clear'):
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY)
    bg = cv2.GaussianBlur(g, (0, 0), 45)
    flat = cv2.divide(g, bg, scale=255)
    if mode == 'flat': return flat
    c = cv2.normalize(flat, None, 0, 255, cv2.NORM_MINMAX)
    lut = np.clip((np.arange(256) - 60) * 255 / (235 - 60), 0, 255).astype(np.uint8)
    return cv2.LUT(c, lut)

def qc(rect_clean):
    m = corner_marks(cv2.cvtColor(rect_clean, cv2.COLOR_GRAY2BGR) if rect_clean.ndim == 2 else rect_clean)
    errs = {}
    for k, idx in {'TR': 1, 'BR': 2, 'BL': 3}.items():
        if k in m: errs[k] = float(np.linalg.norm(np.array(m[k]['c']) - CANON[idx]))
    return m, errs

def align(rect_bgr, marks):
    # หลังดัดด้วยขอบกระดาษ เหลือแค่การย่อ/เลื่อนจากขอบพิมพ์ → affine จากหมุด 3 จุดพอ (3 จุดกำหนด affine ได้พอดี)
    src = np.float32([marks['TR']['c'], marks['BR']['c'], marks['BL']['c']])
    A = cv2.getAffineTransform(src, CANON[1:4])
    return cv2.warpAffine(rect_bgr, A, (W, H), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255)), A

def find_bars(clean):
    # ขีดดำบอกแถว: สี่เหลี่ยมดำเล็กในแถบซ้าย/ขวา
    g = clean if clean.ndim == 2 else cv2.cvtColor(clean, cv2.COLOR_BGR2GRAY)
    out = {}
    for side, (x0, x1) in {'L': (40, 260), 'R': (2220, 2440)}.items():
        roi = g[820:3260, x0:x1]
        _, b = cv2.threshold(roi, 110, 255, cv2.THRESH_BINARY_INV)
        n, lab, st, cen = cv2.connectedComponentsWithStats(b)
        pts = [cen[i] + [x0, 820] for i in range(1, n) if 600 < st[i, 4] < 6000 and st[i, 2] > 1.6 * st[i, 3]]
        out[side] = sorted(pts, key=lambda p: p[1])
    return out

def run_one(im):
    """Phase 1 v0: คืนค่าผลทุกขั้น + เหตุผลถ้าล้มเหลว"""
    r = {}
    sm, s = small_of(im); g, b, e = edges(sm); quads = find_quads(e); q, ratio = pick(quads)
    r['n_quads'] = len(quads); r['ratio'] = None if ratio is None else float(ratio)
    r['quad_ok'] = bool(q is not None and 1.2 < ratio < 1.65)
    if q is None: r['fail'] = 'no_quad'; return r, None
    Q = refine(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), q / s); r['corners'] = Q.tolist()
    rect, M = warp(im, Q); rect, rot, m = orient(rect); r['rot'] = int(rot); r['n_marks'] = int(len(m))
    if not all(k in m for k in ('TR', 'BR', 'BL')): r['fail'] = 'marks'; return r, None
    al, A = align(rect, m); r['scale'] = float(np.linalg.norm(A[:, :2], axis=0).mean())
    cl = enhance(al); return r, cl

# ---------------- v0.2 (ผลจากการทดลองบน Dev) ----------------
EDGE_PARAMS = [(40, 120, 2), (60, 180, 1), (90, 220, 1)]

def candidates(small):
    """E02: หาสี่เหลี่ยมหลายชุดค่า ตัดตัวที่มุมชนขอบภาพ (มักรวมแสงสะท้อนบนโต๊ะ)"""
    h, w = small.shape[:2]; g = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    out = []
    for lo, hi, it in EDGE_PARAMS:
        e = cv2.dilate(cv2.Canny(g, lo, hi), np.ones((3, 3), np.uint8), iterations=it)
        for a, r, q in find_quads(e):
            touch = (q[:, 0] < 3).any() or (q[:, 1] < 3).any() or (q[:, 0] > w - 4).any() or (q[:, 1] > h - 4).any()
            if 1.2 < r < 1.65 and not touch: out.append((a, r, q, (lo, hi, it)))
    out.sort(key=lambda x: -x[0])
    return out

def fit_marks_bars(cl, m, bars, ref):
    """E01: homography จากหมุด 3 จุด + ขีดดำแถวคู่ (20 จุด) · แถวคี่เก็บไว้ตรวจ"""
    L, R = np.array(bars['L']), np.array(bars['R']); RL, RR = np.array(ref['L']), np.array(ref['R'])
    src = np.vstack([[m[k]['c'] for k in ('TR', 'BR', 'BL')], L[::2], R[::2]]).astype(np.float32)
    dst = np.vstack([CANON[1:4], RL[::2], RR[::2]]).astype(np.float32)
    Hm, _ = cv2.findHomography(src, dst, 0)
    out = cv2.warpPerspective(cl, Hm, (W, H), flags=cv2.INTER_LINEAR, borderValue=255)
    test = np.vstack([L[1::2], R[1::2]]).astype(np.float32).reshape(-1, 1, 2)
    err = np.linalg.norm(cv2.perspectiveTransform(test, Hm).reshape(-1, 2) - np.vstack([RL[1::2], RR[1::2]]), axis=1)
    return out, err

def run_v02(im, ref):
    r = {}; sm, s = small_of(im); gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    cands = candidates(sm); r['n_cand'] = len(cands)
    for i, (a, ratio, q, prm) in enumerate(cands[:4]):
        Q = refine(gray, q / s); rect, M = warp(im, Q); rect, rot, m = orient(rect)
        if all(k in m for k in ('TR', 'BR', 'BL')):
            r.update(cand=i, ratio=float(ratio), edge=list(prm), rot=int(rot), corners=Q.tolist())
            al, A = align(rect, m); r['scale'] = float(np.linalg.norm(A[:, :2], axis=0).mean())
            cl = enhance(al); b = find_bars(cl); r['n_bars'] = [len(b['L']), len(b['R'])]
            if len(b['L']) == 20 and len(b['R']) == 20:
                m2 = corner_marks(cv2.cvtColor(cl, cv2.COLOR_GRAY2BGR))
                if all(k in m2 for k in ('TR', 'BR', 'BL')):
                    cl, err = fit_marks_bars(cl, m2, b, ref); r['qc_mean'], r['qc_max'] = float(err.mean()), float(err.max())
            return r, cl
    r['fail'] = 'no_valid_quad' if not cands else 'marks'
    return r, None

# ---------------- v0.3 (P1-E03) ----------------
FIT_OK = 8.0  # px: ค่าคลาดของจุดที่ใช้ fit (แถวคู่) ที่ยอมรับ candidate

def fit_err(cl, m, bars, ref):
    """ค่าคลาดของจุดที่ใช้ fit เอง (หมุด 3 + แถวคู่ 20) — ใช้เลือก candidate, ไม่แตะแถวคี่"""
    L, R = np.array(bars['L']), np.array(bars['R']); RL, RR = np.array(ref['L']), np.array(ref['R'])
    src = np.vstack([[m[k]['c'] for k in ('TR', 'BR', 'BL')], L[::2], R[::2]]).astype(np.float32)
    dst = np.vstack([CANON[1:4], RL[::2], RR[::2]]).astype(np.float32)
    Hm, _ = cv2.findHomography(src, dst, 0)
    e = np.linalg.norm(cv2.perspectiveTransform(src.reshape(-1, 1, 2), Hm).reshape(-1, 2) - dst, axis=1)
    # ก่อน fit: ระยะจุดแถวคู่จากตำแหน่ง template (บอกว่า candidate ผิดรูปแค่ไหน)
    pre = np.linalg.norm(src[3:] - dst[3:], axis=1)
    return float(e.max()), float(pre.max())

def run_v03(im, ref, k=4):
    """E03: ลอง candidate สูงสุด k ตัว · เลือกตัวแรกที่ หมุดครบ + ขีด 20/20 + ค่าคลาดก่อน fit ≤ FIT_OK·4
       ถ้าไม่มีตัวไหนผ่าน → เลือกตัวที่ค่าคลาดก่อน fit ต่ำสุด · QC แถวคี่คำนวณหลังเลือกแล้วเท่านั้น"""
    r = {}; sm, s = small_of(im); gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    cands = candidates(sm); r['n_cand'] = len(cands); tried = []; best = None; Ms = {}
    for i, (a, ratio, q, prm) in enumerate(cands[:k]):
        Q = refine(gray, q / s); rect, M = warp(im, Q); rect, rot, m = orient(rect)
        t = dict(cand=i, ratio=float(ratio), edge=list(prm)); Ms[i] = M
        if not all(kk in m for kk in ('TR', 'BR', 'BL')): t['why'] = 'marks'; tried.append(t); continue
        al, A = align(rect, m); cl = enhance(al); b = find_bars(cl); t['n_bars'] = [len(b['L']), len(b['R'])]
        m2 = corner_marks(cv2.cvtColor(cl, cv2.COLOR_GRAY2BGR))
        if len(b['L']) != 20 or len(b['R']) != 20 or not all(kk in m2 for kk in ('TR', 'BR', 'BL')):
            t['why'] = 'bars'; tried.append(t)
            if best is None: best = (1e9, i, rot, Q, A, cl, None, None)
            continue
        fe, pre = fit_err(cl, m2, b, ref); t['fit_max'], t['pre_max'] = fe, pre; tried.append(t)
        if best is None or best[0] == 1e9 or pre < best[0]: best = (pre, i, rot, Q, A, cl, m2, b)
        if pre <= FIT_OK * 4: break
    r['tried'] = tried
    if best is None: r['fail'] = 'no_valid_quad' if not cands else 'marks'; return r, None
    pre, i, rot, Q, A, cl, m2, b = best
    r.update(cand=i, rot=int(rot), corners=Q.tolist(), scale=float(np.linalg.norm(A[:, :2], axis=0).mean()),
             n_bars=[len(b['L']), len(b['R'])] if b else tried[i]['n_bars'])
    T = rot_mat(rot) @ Ms[i]; T = np.vstack([A, [0, 0, 1]]) @ T
    if m2 is not None:
        cl, err = fit_marks_bars(cl, m2, b, ref); r['qc_mean'], r['qc_max'] = float(err.mean()), float(err.max())
        T = fit_H(m2, b, ref) @ T
    r['H_total'] = (T / T[2, 2]).tolist()   # พิกัดรูปต้นฉบับ → พิกัดหน้าสแกนสุดท้าย 2480×3508
    return r, cl

def rot_mat(rot):
    # orient(): หมุนตามเข็ม 90° แล้ว resize กลับเป็น W×H ทีละรอบ
    T = np.eye(3)
    for _ in range(rot // 90):
        R = np.array([[0, -1, H - 1], [1, 0, 0], [0, 0, 1]], float)       # (x,y) → (H-1-y, x) บนภาพ W×H → ขนาด H×W
        S = np.diag([W / H, H / W, 1.0])                                    # resize H×W → W×H
        T = S @ R @ T
    return T

def fit_H(m, bars, ref):
    L, R = np.array(bars['L']), np.array(bars['R']); RL, RR = np.array(ref['L']), np.array(ref['R'])
    src = np.vstack([[m[k]['c'] for k in ('TR', 'BR', 'BL')], L[::2], R[::2]]).astype(np.float32)
    dst = np.vstack([CANON[1:4], RL[::2], RR[::2]]).astype(np.float32)
    return cv2.findHomography(src, dst, 0)[0]

# ---------------- v0.4 (P1-E04): ทางสำรองหาจากหมุดโดยตรง ----------------
MK_SIDE = 150.0                       # ด้านหมุดในหน้าสแกน (px)
D_TB = float(CANON[2, 1] - CANON[1, 1])   # ระยะ TR→BR
D_LR = float(CANON[2, 0] - CANON[3, 0])   # ระยะ BL→BR

def dark_squares(gray_s):
    """หาสี่เหลี่ยมทึบสีดำในรูปย่อ: ลบพื้นหลังด้วย closing ใหญ่ (ทนเงา/แสงไม่เท่ากัน)"""
    h, w = gray_s.shape; k = int(max(h, w) * 0.07) | 1
    bg = cv2.morphologyEx(gray_s, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    diff = cv2.subtract(bg, gray_s)
    out = []
    for th in (40, 25, 60):
        mk = (diff > th).astype(np.uint8) * 255
        cnts, _ = cv2.findContours(mk, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            a = cv2.contourArea(c)
            if a < 60 or a > 0.01 * h * w: continue
            (cx, cy), (rw, rh), ang = cv2.minAreaRect(c)
            if rw * rh == 0 or not (0.6 < rw / rh < 1.66): continue
            if a / (rw * rh) < 0.8: continue
            hull = cv2.convexHull(c); x, y, bw, bh = cv2.boundingRect(c)
            roi = gray_s[y:y + bh, x:x + bw]; m2 = np.zeros_like(roi); cv2.drawContours(m2, [c - [x, y]], -1, 255, -1)
            inner = cv2.erode(m2, np.ones((3, 3), np.uint8), iterations=max(1, int(min(rw, rh) * 0.15)))
            vals = roi[inner > 0]; dk = roi[m2 > 0]
            white = float((vals > (np.median(dk) + bg[int(cy), int(cx)]) / 2).mean()) if vals.size else 0.0
            out.append(dict(c=np.float32([cx, cy]), side=float(np.sqrt(a)), white=white))
        if len(out) >= 3: break
    # รวมตัวซ้ำ
    uniq = []
    for o in sorted(out, key=lambda o: -o['side']):
        if all(np.linalg.norm(o['c'] - u['c']) > 0.5 * u['side'] for u in uniq): uniq.append(o)
    return uniq[:40]

def pick_triple(cands):
    """เลือกหมุด TR/BR/BL: มุมฉาก · อัตราส่วนระยะ 1.48 · ไม่กลับด้าน · ขนาดสอดคล้อง · TR มีขาวข้างใน (เลข 2)"""
    best = None; n = len(cands)
    for i in range(n):
        for j in range(n):
            for k in range(n):
                if len({i, j, k}) < 3: continue
                tr, br, bl = cands[i], cands[j], cands[k]
                u, v = tr['c'] - br['c'], bl['c'] - br['c']; nu, nv = np.linalg.norm(u), np.linalg.norm(v)
                if nu < 1 or nv < 1: continue
                cr = u[0] * v[1] - u[1] * v[0]
                if cr >= 0: continue                                  # กระจกเงา → ไม่ใช่
                cos = abs(float(u @ v) / (nu * nv)); ratio = nu / nv
                if cos > 0.45 or not (1.48 / 1.45 < ratio < 1.48 * 1.45): continue
                sides = np.array([tr['side'], br['side'], bl['side']]); exp = nv * MK_SIDE / D_LR
                if sides.max() / sides.min() > 2.2 or not (0.45 < sides.mean() / exp < 2.2): continue
                score = cos + abs(np.log(ratio / 1.48)) + 0.3 * abs(np.log(sides.mean() / exp)) \
                        + 0.5 * (sides.std() / sides.mean()) - 1.0 * (tr['white'] - max(br['white'], bl['white']))
                if best is None or score < best[0]: best = (score, tr, br, bl)
    return best

def warp_T(im, T, gray=False):
    src = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY) if gray else im
    return cv2.warpPerspective(src, T, (W, H), flags=cv2.INTER_LINEAR, borderValue=255 if gray else (255, 255, 255))

def find_bars_wide(clean):
    """ขีดดำ แบบหน้าต่างกว้าง (ใช้ก่อนแก้ perspective)"""
    g = clean; out = {}
    for side, (x0, x1) in {'L': (0, 480), 'R': (2000, 2480)}.items():
        roi = g[650:3400, x0:x1]; _, b = cv2.threshold(roi, 110, 255, cv2.THRESH_BINARY_INV)
        n, lab, st, cen = cv2.connectedComponentsWithStats(b)
        pts = [cen[i] + [x0, 650] for i in range(1, n) if 400 < st[i, 4] < 8000 and st[i, 2] > 1.6 * st[i, 3] and st[i, 2] < 250]
        # เก็บคอลัมน์หลัก: x ใกล้ค่ากลาง
        if pts:
            xm = np.median([q[0] for q in pts]); pts = [q for q in pts if abs(q[0] - xm) < 60]
        out[side] = sorted(pts, key=lambda q: q[1])
    return out

def bar_blobs(g):
    """จุดศูนย์กลางก้อนที่หน้าตาเหมือนขีดดำ ในแถบซ้าย/ขวากว้างๆ (พิกัดหน้าสแกน)"""
    pts = []
    for x0, x1 in ((0, 700), (1780, 2480)):
        roi = g[300:3508, x0:x1]; _, bm = cv2.threshold(roi, 110, 255, cv2.THRESH_BINARY_INV)
        n, lab, st, cen = cv2.connectedComponentsWithStats(bm)
        pts += [cen[i] + [x0, 300] for i in range(1, n) if 300 < st[i, 4] < 9000 and st[i, 2] > 1.4 * st[i, 3] and st[i, 2] < 260]
    return np.float32(pts).reshape(-1, 2)

def match(P, Q, tol):
    """จับคู่จุดอ้างอิง Q กับก้อน P ที่ใกล้สุด ต้องใกล้กว่า tol และไม่กำกวม (ตัวที่ 2 ไกลกว่า 1.5 เท่า)"""
    out = []
    if len(P) == 0: return out
    for qi, q in enumerate(Q):
        d = np.linalg.norm(P - q, axis=1); o = np.argsort(d)
        if d[o[0]] < tol and (len(d) < 2 or d[o[1]] > 1.5 * d[o[0]]): out.append((qi, int(o[0])))
    return out

def grow_fit(m, P, ref, rounds=(900, 1600, 2400, 9999), tol=45):
    """homography จาก หมุด 3 (น้ำหนัก ×4) + ขีดดำแถวคู่ ที่จับคู่ได้ · ขยายรัศมีจากหมุดทีละรอบ"""
    EV = np.vstack([np.array(ref['L'])[::2], np.array(ref['R'])[::2]]).astype(np.float32)
    M = np.float32([m[k]['c'] for k in ('TR', 'BR', 'BL')]); C = CANON[1:4]
    Hc = np.vstack([cv2.getAffineTransform(M, C), [0, 0, 1]]); dmin = np.min(np.linalg.norm(EV[:, None] - C[None], axis=2), axis=1)
    n = 0
    for rad in rounds:
        sel = np.where(dmin < rad)[0]
        pred = cv2.perspectiveTransform(EV[sel].reshape(-1, 1, 2), np.linalg.inv(Hc)).reshape(-1, 2)
        pr = match(P, pred, tol); n = len(pr)
        if n < 2: continue
        src = np.vstack([np.repeat(M, 4, 0), P[[j for _, j in pr]]]); dst = np.vstack([np.repeat(C, 4, 0), EV[sel][[i for i, _ in pr]]])
        Hc, _ = cv2.findHomography(src, dst, 0)
    return Hc, n

def qc_match(cl, m, ref, tol=30):
    """QC แบบจับคู่: fit ด้วยหมุด + แถวคู่ที่หาเจอ · วัดค่าคลาดบนแถวคี่ (ไม่ได้ใช้ fit) · ทนขีดหาย/ก้อนเกิน"""
    L, R = np.array(ref['L'], np.float32), np.array(ref['R'], np.float32)
    EV, OD = np.vstack([L[::2], R[::2]]), np.vstack([L[1::2], R[1::2]]); P = bar_blobs(cl)
    pe, po = match(P, EV, tol), match(P, OD, tol)
    if len(pe) < 15 or len(po) < 15: return None, None, (len(pe), len(po))
    src = np.vstack([[m[k]['c'] for k in ('TR', 'BR', 'BL')], P[[j for _, j in pe]]]).astype(np.float32)
    dst = np.vstack([CANON[1:4], EV[[i for i, _ in pe]]]).astype(np.float32)
    Hm, _ = cv2.findHomography(src, dst, 0)
    err = np.linalg.norm(cv2.perspectiveTransform(P[[j for _, j in po]].reshape(-1, 1, 2), Hm).reshape(-1, 2) - OD[[i for i, _ in po]], axis=1)
    return Hm, err, (len(pe), len(po))

PAD = 700
def bar_blobs_pad(gp):
    """เหมือน bar_blobs แต่บนภาพที่เผื่อขอบ PAD รอบด้าน (ส่วนที่ล้นหน้าตอนยังไม่แก้ perspective ไม่หาย) · คืนพิกัดหน้าสแกน"""
    pts = []
    for x0, x1 in ((0, PAD + 700), (PAD + 1780, W + 2 * PAD)):
        roi = gp[PAD + 300 - PAD // 2:PAD + H + PAD // 2, x0:x1]; _, bm = cv2.threshold(roi, 110, 255, cv2.THRESH_BINARY_INV)
        n, lab, st, cen = cv2.connectedComponentsWithStats(bm)
        pts += [cen[i] + [x0 - PAD, 300 - PAD // 2] for i in range(1, n) if 150 < st[i, 4] < 20000 and st[i, 2] > 1.3 * st[i, 3] and st[i, 2] < 500]
    return np.float32(pts).reshape(-1, 2)

def columns(P, tol=18):
    """หาคอลัมน์ขีดดำแต่ละข้างด้วย RANSAC เส้นตรง (perspective คงความเป็นเส้นตรง) · คืนจุดเรียงตาม y"""
    out = {}
    for side, sel in (('L', P[:, 0] < W / 2), ('R', P[:, 0] >= W / 2)):
        Q = P[sel]; best = np.zeros(0, int)
        for i in range(len(Q)):
            for j in range(i + 1, len(Q)):
                d = Q[j] - Q[i]; nd = np.linalg.norm(d)
                if nd < 50 or abs(d[0]) > 0.35 * abs(d[1]): continue
                nrm = np.float32([-d[1], d[0]]) / nd; inl = np.where(np.abs((Q - Q[i]) @ nrm) < tol)[0]
                if len(inl) > len(best): best = inl
        pts = Q[best]; out[side] = pts[np.argsort(pts[:, 1])] if len(pts) else pts
    return out

def run_markers(im, ref):
    """ทางหมุด: ไม่ใช้ขอบกระดาษ · หมุด 3 จุด → affine → ขีดดำแถวคู่ (ขยายจากหมุด) → homography → QC แถวคี่"""
    r = {'path': 'markers'}; s = 1600 / max(im.shape[:2])
    gs = cv2.cvtColor(cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    cands = dark_squares(gs); r['n_sq'] = len(cands)
    b3 = pick_triple(cands)
    if b3 is None: r['fail'] = 'no_marker_triple'; return r, None
    src = np.float32([b3[1]['c'], b3[2]['c'], b3[3]['c']]) / s
    T = np.vstack([cv2.getAffineTransform(src, CANON[1:4]), [0, 0, 1]])
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    for it in range(2):
        Tp = np.float64([[1, 0, PAD], [0, 1, PAD], [0, 0, 1]]) @ T
        wg = cv2.warpPerspective(g, Tp, (W + 2 * PAD, H + 2 * PAD), flags=cv2.INTER_LINEAR, borderValue=255)
        clp = enhance(cv2.cvtColor(wg, cv2.COLOR_GRAY2BGR)); cl = clp[PAD:PAD + H, PAD:PAD + W]
        m = corner_marks(cv2.cvtColor(cl, cv2.COLOR_GRAY2BGR))
        if not all(k in m for k in ('TR', 'BR', 'BL')):
            if it == 0: m = {k: {'c': CANON[i]} for i, k in ((1, 'TR'), (2, 'BR'), (3, 'BL'))}   # affine ผ่านจุดหมุดพอดีอยู่แล้ว (หมุดอาจบิดจนรูปทรงไม่ผ่านเกณฑ์)
            else: r['fail'] = 'marks_refine'; return r, None
        P = bar_blobs_pad(clp); col = columns(P) if len(P) else {'L': [], 'R': []}
        if len(col['L']) == 20 and len(col['R']) == 20:          # คอลัมน์ครบ → จับคู่ตามลำดับ
            T = fit_H(m, {'L': col['L'], 'R': col['R']}, ref) @ T; r['n_match'] = 20; r['col'] = True
        else:
            Hc, n = grow_fit(m, P, ref); T = Hc @ T; r['n_match'] = n; r['col'] = [len(col['L']), len(col['R'])]
    cl = enhance(cv2.warpPerspective(im, T, (W, H), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255)))
    m = corner_marks(cv2.cvtColor(cl, cv2.COLOR_GRAY2BGR))
    if all(k in m for k in ('TR', 'BR', 'BL')):
        Hm, err, cnt = qc_match(cl, m, ref); r['n_bars'] = list(cnt)
        if Hm is not None:
            T = Hm @ T; cl = cv2.warpPerspective(cl, Hm, (W, H), flags=cv2.INTER_LINEAR, borderValue=255)
            r['qc_mean'], r['qc_max'] = float(err.mean()), float(err.max())
    r['H_total'] = (T / T[2, 2]).tolist()
    return r, cl

def run_v04(im, ref):
    """ขอบกระดาษก่อน (v0.3) · ถ้าล้ม/QC ไม่ผ่าน → ทางหมุด · เลือกผลที่ QC ดีกว่า (QC แถวคี่ไม่ได้ใช้ fit)"""
    try: r1, c1 = run_v03(im, ref)
    except Exception as e: r1, c1 = {'fail': 'exc:' + type(e).__name__}, None
    r1['path'] = 'paper'
    if c1 is not None and r1.get('qc_max') is not None and r1['qc_max'] <= FIT_OK: return r1, c1
    try: r2, c2 = run_markers(im, ref)
    except Exception as e: r2, c2 = {'fail': 'exc:' + type(e).__name__, 'path': 'markers'}, None
    q1 = r1.get('qc_max') if c1 is not None else None; q2 = r2.get('qc_max') if c2 is not None else None
    if q2 is not None and (q1 is None or q2 < q1): r2['paper_fail'] = r1.get('fail', q1); return r2, c2
    if c1 is not None: return r1, c1
    return (r2, c2) if c2 is not None else (dict(r2, paper_fail=r1.get('fail')), None)
