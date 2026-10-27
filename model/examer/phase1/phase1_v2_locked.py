# Phase 1 v2 — สร้างต่อจาก v1 (phase1_v1.py ไม่แก้)
# เปลี่ยน 2 อย่าง:
#  (1) ขั้นล็อกตำแหน่ง + QC: ใช้เฉพาะ "ขีดดำที่เห็นครบทั้งแท่ง" (ขนาดใกล้แม่แบบ 59×22 px)
#      ขีดที่โดนแสงสะท้อนบังบางส่วน จุดกลางจะเลื่อน → ไม่ใช้ fit และไม่ใช้วัด QC (นับเป็นหาไม่เจอ)
#  (2) ภาพผลเป็น "ภาพสี" + ลบเงา: ประมาณแสงพื้นหลังแต่ละช่องสีจากเฉพาะพื้นกระดาษ แล้วหารออก
# ขั้นหาขอบ / หาหมุด / หมุนทิศ = เหมือน v1 ทุกอย่าง (เรียก run_v04 ของ v1)
import os, importlib.util, cv2, numpy as np
_spec = importlib.util.spec_from_file_location('p1v1', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'phase1_v1.py'))
v1 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(v1)
W, H, CANON = v1.W, v1.H, v1.CANON

BAR_W, BAR_H = (53, 66), (18, 27)      # ขนาดขีดดำที่เห็นครบ (Dev: กว้าง 58–61 · สูง 20–23 px ที่ 1–99%)
MIN_PTS = 15                           # ต้องเหลือขีดที่ใช้ได้อย่างน้อย 15 จุด ทั้งแถวคู่ (fit) และแถวคี่ (QC)

BAR_THR = 185                          # บนภาพลบเงา (พื้นกระดาษ ≈ 248): ขีดดำ = เข้มกว่า 185 · ทนแสงสะท้อนที่กดขีดให้จางเป็นสีเทา

def flat_gray(scan_bgr):
    """ภาพเทาที่ลบเงาแล้ว (พื้นกระดาษสว่างเท่ากันทั้งแผ่น) ใช้หาขีดดำ"""
    return cv2.cvtColor(deshadow_color(scan_bgr), cv2.COLOR_BGR2GRAY)

def full_bars(g):
    """จุดกลางของขีดดำที่ 'เห็นครบทั้งแท่ง' ในแถบซ้าย/ขวา (พิกัดหน้าสแกน) · g = flat_gray"""
    pts = []
    for x0, x1 in ((0, 700), (1780, 2480)):
        roi = g[300:3508, x0:x1]; _, bm = cv2.threshold(roi, BAR_THR, 255, cv2.THRESH_BINARY_INV)
        n, lab, st, cen = cv2.connectedComponentsWithStats(bm)
        for i in range(1, n):
            w, h, a = st[i, 2], st[i, 3], st[i, 4]
            if BAR_W[0] <= w <= BAR_W[1] and BAR_H[0] <= h <= BAR_H[1] and a > 0.5 * w * h:
                pts.append(cen[i] + [x0, 300])
    return np.float32(pts).reshape(-1, 2)

def refit(gray_scan, ref, tol=30):
    """fit ด้วยหมุด 3 + ขีดแถวคู่ที่เห็นครบ · QC = ขีดแถวคี่ที่เห็นครบ (ไม่ได้ใช้ fit)"""
    m = v1.corner_marks(cv2.cvtColor(gray_scan, cv2.COLOR_GRAY2BGR))
    if not all(k in m for k in ('TR', 'BR', 'BL')): return None, None, {'why': 'marks'}
    L, R = np.array(ref['L'], np.float32), np.array(ref['R'], np.float32)
    EV, OD = np.vstack([L[::2], R[::2]]), np.vstack([L[1::2], R[1::2]]); P = full_bars(gray_scan)
    pe, po = v1.match(P, EV, tol), v1.match(P, OD, tol)
    info = {'n_fit': len(pe), 'n_qc': len(po)}
    if len(pe) < MIN_PTS or len(po) < MIN_PTS: info['why'] = 'few_full_bars'; return None, None, info
    src = np.vstack([[m[k]['c'] for k in ('TR', 'BR', 'BL')], P[[j for _, j in pe]]]).astype(np.float32)
    dst = np.vstack([CANON[1:4], EV[[i for i, _ in pe]]]).astype(np.float32)
    Hm, _ = cv2.findHomography(src, dst, 0)
    err = np.linalg.norm(cv2.perspectiveTransform(P[[j for _, j in po]].reshape(-1, 1, 2), Hm).reshape(-1, 2) - OD[[i for i, _ in po]], axis=1)
    return Hm, err, info

def deshadow_color(bgr, scale=4, sigma=12, white=248):
    """ลบเงา + ปรับสมดุลสีขาว แบบคงสีหมึก:
       1) ย่อ 1/scale · หา 'พื้นกระดาษ' = จุดที่สว่างใกล้ค่าพื้นหลังเฉพาะที่ (ตัดหมึก/หมุด/ขีดดำออก)
       2) ประมาณแสงแต่ละช่องสีจากพื้นกระดาษเท่านั้น (normalized convolution → เติมใต้หมุด/ตัวหนังสือ)
       3) หารภาพสีด้วยแสงที่ประมาณได้ → เงาหาย กระดาษขาวเท่ากันทั้งแผ่น สีหมึกยังอยู่"""
    h, w = bgr.shape[:2]; sm = cv2.resize(bgr, (w // scale, h // scale), interpolation=cv2.INTER_AREA).astype(np.float32)
    g = sm.mean(2)
    loc = cv2.medianBlur(cv2.dilate(g.astype(np.uint8), np.ones((5, 5), np.uint8)), 31).astype(np.float32)
    mask = (g > 0.82 * loc).astype(np.float32)
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8))
    den = cv2.GaussianBlur(mask, (0, 0), sigma) + 1e-3
    bg = np.stack([cv2.GaussianBlur(sm[..., c] * mask, (0, 0), sigma) / den for c in range(3)], 2)
    bg = cv2.resize(bg, (w, h), interpolation=cv2.INTER_CUBIC)
    out = bgr.astype(np.float32) / np.maximum(bg, 1) * white
    return np.clip(out, 0, 255).astype(np.uint8)

def run_v2(im, ref):
    """คืน (ผล, ภาพเทาสำหรับ QC/ขั้นถัดไป, ภาพสีลบเงา)"""
    r, cl = v1.run_v04(im, ref)
    r = {k: v for k, v in r.items() if k != 'tried'}; r['v1_qc_max'] = r.pop('qc_max', None); r.pop('qc_mean', None)
    if cl is None or 'H_total' not in r: return r, None, None
    T = np.array(r['H_total'])
    scan = cv2.warpPerspective(im, T, (W, H), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))
    # รอบหยาบ: ขยายระยะจับคู่เป็น 60 px ใช้ขีดแถวคู่อย่างเดียว (≥ 8 จุด) เพื่อดึงตำแหน่งเข้าใกล้ก่อน
    for tol in (60, 45):
        g = flat_gray(scan); m = v1.corner_marks(cv2.cvtColor(g, cv2.COLOR_GRAY2BGR))
        if not all(k in m for k in ('TR', 'BR', 'BL')): break
        EV = np.vstack([np.array(ref['L'])[::2], np.array(ref['R'])[::2]]).astype(np.float32); P = full_bars(g); pe = v1.match(P, EV, tol)
        if len(pe) < 8: break
        src = np.vstack([[m[k]['c'] for k in ('TR', 'BR', 'BL')], P[[j for _, j in pe]]]).astype(np.float32)
        dst = np.vstack([CANON[1:4], EV[[i for i, _ in pe]]]).astype(np.float32)
        T = cv2.findHomography(src, dst, 0)[0] @ T
        scan = cv2.warpPerspective(im, T, (W, H), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))
    Hm, err, info = refit(flat_gray(scan), ref); r.update(info)
    if Hm is not None:
        T = Hm @ T; r['qc_mean'], r['qc_max'] = float(err.mean()), float(err.max())
        scan = cv2.warpPerspective(im, T, (W, H), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))
    r['H_total'] = (T / T[2, 2]).tolist()
    color = deshadow_color(scan)
    return r, v1.enhance(scan), color
