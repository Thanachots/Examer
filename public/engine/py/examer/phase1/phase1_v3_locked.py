# Phase 1 v3 — สร้างต่อจาก v2 (phase1_v1.py / phase1_v2_locked.py ไม่แก้)
# ต้นเหตุ v2 ไม่ผ่านบนรูปชุดใหม่ (Edge ถ่ายใกล้ กระดาษล้นขอบภาพ):
#   ทางขอบกระดาษหาขอบไม่เจอ → ใช้ทางหมุด → ขั้นหาคอลัมน์ขีดดำ ไปจับ "ก้อนลายมือ+เส้นตาราง" (กว้าง 360–460 · สูง 92–99 · ทึบ 0.09)
#   ที่จุดกลางบังเอิญตกแนวเดียวกับคอลัมน์ขีด → เลือกเส้นผิด → จัดหน้าผิดทั้งแผ่น
# แก้ (เฉพาะทางหมุด):
#   (1) ก้อนที่นับเป็นขีดดำ ต้องรูปทรงเหมือนขีด: ทึบ ≥ 0.6 · กว้าง 30–130 · สูง 10–50 · กว้าง/สูง 1.6–4.5
#       (ขีดจริงในกรอบ affine: กว้าง 55–60 · สูง 22 · ทึบ 0.9 · เผื่อ perspective ×0.5–2)
#       และใช้เกณฑ์ความเข้มเทียบพื้นกระดาษเฉพาะที่ (ขีดใต้แสงสะท้อนกระจกจางเป็นเทา ทึบแค่ ~0.5 ถ้าใช้เกณฑ์ตายตัว)
#   (2) เลือกคอลัมน์ด้วย "จำนวนจุดบนเส้น − ระยะห่างจากตำแหน่งแม่แบบ" (ซ้าย x≈132 · ขวา x≈2350) แทนจำนวนจุดอย่างเดียว
import os, importlib.util, cv2, numpy as np
_H = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('p2v3', os.path.join(_H, 'phase1_v2_locked.py'))
p2 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(p2)
v1 = p2.v1; W, H, PAD = v1.W, v1.H, v1.PAD

BAR_SHAPE = dict(w=(30, 130), h=(10, 50), ar=(1.6, 4.5), fill=0.6)
COL_X = {'L': 132.5, 'R': 2350.5}
COL_PEN = 1 / 40.0       # หัก 1 จุด ต่อทุก 40 px ที่ห่างจากตำแหน่งแม่แบบ
BAR_REL = 0.72           # ขีด = เข้มกว่า 72% ของพื้นกระดาษรอบๆ

def bar_blobs_pad(gp):
    pts = []
    for x0, x1 in ((0, PAD + 700), (PAD + 1780, W + 2 * PAD)):
        roi = gp[PAD + 300 - PAD // 2:PAD + H + PAD // 2, x0:x1]
        # เกณฑ์เทียบพื้นกระดาษเฉพาะที่ (ไม่ใช่ค่าตายตัว 110): ขีดที่แสงสะท้อนกดจนเป็นเทายังทึบเต็มแท่ง
        sm = cv2.resize(roi, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
        bg = cv2.resize(cv2.medianBlur(cv2.dilate(sm, np.ones((5, 5), np.uint8)), 21), (roi.shape[1], roi.shape[0]), interpolation=cv2.INTER_LINEAR)
        bm = ((roi.astype(np.float32) < BAR_REL * bg.astype(np.float32)) & (roi < 200)).astype(np.uint8) * 255
        n, lab, st, cen = cv2.connectedComponentsWithStats(bm)
        for i in range(1, n):
            w, h, a = st[i, 2], st[i, 3], st[i, 4]
            if (BAR_SHAPE['w'][0] <= w <= BAR_SHAPE['w'][1] and BAR_SHAPE['h'][0] <= h <= BAR_SHAPE['h'][1]
                    and BAR_SHAPE['ar'][0] <= w / h <= BAR_SHAPE['ar'][1] and a >= BAR_SHAPE['fill'] * w * h):
                pts.append(cen[i] + [x0 - PAD, 300 - PAD // 2])
    return np.float32(pts).reshape(-1, 2)

def columns(P, tol=18):
    out = {}
    for side, sel in (('L', P[:, 0] < W / 2), ('R', P[:, 0] >= W / 2)):
        Q = P[sel]; best, bs = np.zeros(0, int), -1e9
        for i in range(len(Q)):
            for j in range(i + 1, len(Q)):
                d = Q[j] - Q[i]; nd = np.linalg.norm(d)
                if nd < 50 or abs(d[0]) > 0.35 * abs(d[1]): continue
                nrm = np.float32([-d[1], d[0]]) / nd; inl = np.where(np.abs((Q - Q[i]) @ nrm) < tol)[0]
                score = len(inl) - COL_PEN * abs(float(np.median(Q[inl, 0])) - COL_X[side])
                if score > bs: best, bs = inl, score
        pts = Q[best]; out[side] = pts[np.argsort(pts[:, 1])] if len(pts) else pts
    return out

# ใส่ทับในโมดูล v1 ที่ v3 โหลดเอง (ไฟล์ v1/v2 บนดิสก์ไม่ถูกแก้)
v1.bar_blobs_pad = bar_blobs_pad
v1.columns = columns
run_v3 = p2.run_v2          # ขั้นอื่นทั้งหมดเหมือน v2 (หาขอบ → ทางหมุด(แก้แล้ว) → ล็อกตำแหน่งด้วยขีดที่เห็นครบ → QC → ภาพสีลบเงา)
deshadow_color = p2.deshadow_color
