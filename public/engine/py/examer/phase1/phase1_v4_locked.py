# Phase 1 v4 — สร้างต่อจาก v3 (phase1_v3_locked.py ไม่แก้)
# ต้นเหตุที่พบ 25 ต.ค. 2569: รูปที่ QC สูง (7–9 px) ความคลาดของขีดดำไม่สุ่ม แต่โค้งเป็นพาราโบลาตามแนวตั้ง
#   (ซ้าย/ขวาโป่งคนละทาง ~6 px · ฟิตโค้งแล้วเหลือ 0.6–2 px) = กระดาษไม่เรียบ (โค้ง) · homography เดียวทั้งแผ่นทำได้แค่ระนาบ
# แก้: หลัง v3 · ใช้ขีดดำแถวคู่ (ที่เห็นครบ) ฟิตความคลาด dx, dy เป็นพหุนามกำลังสองตาม y แยกฝั่งซ้าย/ขวา
#   → สนามการเลื่อนตามแนวนอนแบบเส้นตรงระหว่างคอลัมน์ซ้าย–ขวา → remap ภาพสี
#   QC วัดด้วยขีดแถวคี่ (ไม่ได้ใช้ฟิต) เหมือน v2/v3 · ใช้ผลที่แก้แล้วเฉพาะเมื่อ QC ดีขึ้น
import os, importlib.util, cv2, numpy as np
_H = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location('p1v3_for_v4', os.path.join(_H, 'phase1_v3_locked.py'))
v3 = importlib.util.module_from_spec(_s); _s.loader.exec_module(v3)
p2 = v3.p2; v1 = v3.v1; W, H = v3.W, v3.H
MIN_EVEN = 6      # ต้องมีขีดแถวคู่ต่อฝั่งอย่างน้อยเท่านี้จึงฟิตโค้ง
def _fit(pts):
    """pts: [(y_ref, dx, dy)] → ฟังก์ชัน y→(dx,dy) (กำลังสอง หรือเส้นตรงถ้าจุดน้อย)"""
    a = np.array(pts, float); y = (a[:, 0] - H / 2) / 1000; deg = 2 if len(a) >= MIN_EVEN else 1
    cx = np.polyfit(y, a[:, 1], deg); cy = np.polyfit(y, a[:, 2], deg)
    return lambda yy: (np.polyval(cx, (yy - H / 2) / 1000), np.polyval(cy, (yy - H / 2) / 1000))
def _qc(col, OD):
    P = p2.full_bars(p2.flat_gray(col)); po = v1.match(P, OD, 30)
    if len(po) < p2.MIN_PTS: return None, len(po)
    err = np.linalg.norm(P[[j for _, j in po]] - OD[[i for i, _ in po]], axis=1); return float(err.max()), len(po)
def run_v4(im, ref):
    res, g, col = v3.run_v3(im, ref)
    if col is None: return res, g, col
    L, R = np.array(ref['L'], np.float32), np.array(ref['R'], np.float32)
    OD = np.vstack([L[1::2], R[1::2]]); P = p2.full_bars(p2.flat_gray(col))
    side = {}
    for nm, Q in (('L', L[::2]), ('R', R[::2])):
        m = v1.match(P, Q, 30); side[nm] = [(Q[i][1], *(P[j] - Q[i])) for i, j in m]
    res['v4'] = dict(nL=len(side['L']), nR=len(side['R']), qc_v3=res.get('qc_max'))
    if len(side['L']) < 4 or len(side['R']) < 4: res['v4']['used'] = False; return res, g, col
    fL, fR = _fit(side['L']), _fit(side['R'])
    xL, xR = float(L[:, 0].mean()), float(R[:, 0].mean())
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ys = np.arange(H, dtype=np.float32); dxL, dyL = fL(ys); dxR, dyR = fR(ys)
    t = np.clip((xx - xL) / (xR - xL), -0.2, 1.2)
    dx = (1 - t) * dxL[:, None] + t * dxR[:, None]; dy = (1 - t) * dyL[:, None] + t * dyR[:, None]
    # ดัดจากรูปต้นฉบับครั้งเดียว (ไม่ resample ภาพสแกนซ้ำ → ไม่เบลอเพิ่ม): จุด (x,y) ในหน้าสแกน ← รูปถ่ายที่ T⁻¹(x+dx, y+dy)
    Ti = np.linalg.inv(np.array(res['H_total'], np.float64))
    X = xx + dx; Y = yy + dy; Z = Ti[2, 0] * X + Ti[2, 1] * Y + Ti[2, 2]
    mx = ((Ti[0, 0] * X + Ti[0, 1] * Y + Ti[0, 2]) / Z).astype(np.float32); my = ((Ti[1, 0] * X + Ti[1, 1] * Y + Ti[1, 2]) / Z).astype(np.float32)
    scan2 = cv2.remap(im, mx, my, cv2.INTER_LINEAR, borderValue=(255, 255, 255)); col2 = p2.deshadow_color(scan2)
    q1, n1 = _qc(col, OD); q2, n2 = _qc(col2, OD)
    res['v4'].update(qc_before=q1, qc_after=q2, n_qc=n2)
    if q2 is not None and (q1 is None or q2 < q1):
        res['v4']['used'] = True; res['qc_max'] = q2; return res, g, col2
    res['v4']['used'] = False; return res, g, col
