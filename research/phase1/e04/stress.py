# P1-E04a: ชุดทดสอบความทน (stress set) สร้างจากชุด Dev เท่านั้น
# หลักการ: ตัดกระดาษจากรูป Dev ด้วยกรอบที่ระบบหาได้ (IoU กับ label มือ 0.995) → วางบนพื้นหลัง/มุม/แสงใหม่
#          ความจริง (GT) = การแปลง รูปใหม่ → หน้าสแกน ที่รู้แน่นอนจากตอนสร้าง
# ตัวชี้วัด: ค่าคลาดลงทะเบียน (registration) = ตำแหน่งหมุด 3 + ขีดดำ 40 จุด หลังสแกน เทียบ GT (px ที่ 300 dpi)
import cv2, numpy as np, json, os, sys, glob

W, H = 2480, 3508
FIT = True   # v1 ของ generator: กระดาษต้องอยู่ในเฟรมทั้งแผ่น (ยกเว้น cut_corner)
FW, FH = 2100, 2970            # ขนาดกระดาษแบนชั่วคราว (≈ A4 ที่ 254 dpi)

def flat_paper(im, Q):
    Hq = cv2.getPerspectiveTransform(np.float32(Q), np.float32([[0, 0], [FW, 0], [FW, FH], [0, FH]]))
    return cv2.warpPerspective(im, Hq, (FW, FH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE), Hq

def background(kind, w, h, rng):
    if kind == 'white':                      # โต๊ะขาว/เทาอ่อน = ตัดกับกระดาษน้อยสุด
        base = rng.uniform(185, 225); bg = np.full((h, w, 3), base, np.float32) + rng.normal(0, 4, (h, w, 1))
        bg += np.linspace(-15, 15, w)[None, :, None] * rng.choice([-1, 1])
    elif kind == 'dark':
        bg = np.full((h, w, 3), rng.uniform(25, 70), np.float32) + rng.normal(0, 6, (h, w, 1))
    elif kind == 'cloth':
        col = rng.uniform(40, 160, 3); n = cv2.resize(rng.normal(0, 1, (h // 8, w // 8)).astype(np.float32), (w, h))
        bg = col[None, None, :] + 18 * n[..., None]
    else:                                    # pattern: ลายรก (เส้น/สี่เหลี่ยม คล้ายของบนโต๊ะ)
        bg = np.full((h, w, 3), rng.uniform(90, 170), np.float32)
        for _ in range(60):
            c = rng.uniform(0, 255, 3).tolist(); x, y = int(rng.uniform(0, w)), int(rng.uniform(0, h))
            if rng.random() < .5: cv2.line(bg, (x, y), (int(x + rng.normal(0, 600)), int(y + rng.normal(0, 600))), c, int(rng.uniform(3, 25)))
            else: cv2.rectangle(bg, (x, y), (int(x + rng.uniform(50, 500)), int(y + rng.uniform(50, 500))), c, -1)
        bg += rng.normal(0, 8, (h, w, 1))
    return np.clip(bg, 0, 255).astype(np.uint8)

def pose(w, h, rng, scale=(0.70, 0.88), rot=(-8, 8), tilt=0.03, cut=0):
    """คืนมุม 4 มุมของกระดาษในรูปใหม่ (ลำดับ ฟอร์ม TL,TR,BR,BL)"""
    s = rng.uniform(*scale) * h / FH; a = np.deg2rad(rng.uniform(*rot))
    P = np.float32([[-FW / 2, -FH / 2], [FW / 2, -FH / 2], [FW / 2, FH / 2], [-FW / 2, FH / 2]]) * s
    P = P @ np.float32([[np.cos(a), np.sin(a)], [-np.sin(a), np.cos(a)]])
    P += rng.normal(0, tilt * FH * s, (4, 2)).astype(np.float32)          # มุมกล้องเอียง (perspective)
    bw, bh = P[:, 0].max() - P[:, 0].min(), P[:, 1].max() - P[:, 1].min()
    P += np.float32([w / 2, h / 2]) - P.mean(0)
    if not cut and FIT:                                                   # ย่อให้ทั้งแผ่นอยู่ในเฟรม (ขอบ 2%) — หมุนเฉียงแล้วไม่ล้นเฟรม
        c0 = P.mean(0); k = min(1.0, (w * 0.49) / np.abs(P[:, 0] - c0[0]).max(), (h * 0.49) / np.abs(P[:, 1] - c0[1]).max())
        P = c0 + (P - c0) * k
    if cut:                                                               # ดันให้มุมหนึ่งหลุดเฟรม
        k = int(rng.integers(4)); d = P[k] - P.mean(0); d /= np.abs(d).max()
        lim = np.float32([w - 1 if d[0] > 0 else 0, h - 1 if d[1] > 0 else 0])
        sh = min((lim[i] - P[k, i]) / d[i] for i in range(2) if abs(d[i]) > 0.3) + cut
        P += d * sh
    return P

def compose(paper, P, bg):
    h, w = bg.shape[:2]; S = cv2.getPerspectiveTransform(np.float32([[0, 0], [FW, 0], [FW, FH], [0, FH]]), np.float32(P))
    wp = cv2.warpPerspective(paper, S, (w, h), flags=cv2.INTER_LINEAR)
    m = cv2.warpPerspective(np.full((FH, FW), 255, np.uint8), S, (w, h), flags=cv2.INTER_LINEAR)
    m = cv2.GaussianBlur(m, (5, 5), 0)[..., None] / 255.0
    sh = cv2.GaussianBlur(cv2.warpPerspective(np.full((FH, FW), 255, np.uint8), S @ np.float32([[1, 0, 12], [0, 1, 18], [0, 0, 1]]), (w, h)), (0, 0), 25)[..., None] / 255.0
    out = bg * (1 - 0.35 * sh * (1 - m)) * (1 - m) + wp * m           # เงาใต้กระดาษเล็กน้อย
    return np.clip(out, 0, 255).astype(np.uint8), S

def photometric(im, rng, gain=1.0, shadow=0.0, blur=0.0, noise=2.0, jpeg=92, glare=0.0):
    f = im.astype(np.float32) * gain; h, w = im.shape[:2]
    if shadow:                                   # เงามือ/เงาตัวคน: ไล่ความมืดเป็นแถบ
        a = rng.uniform(0, np.pi); xx, yy = np.meshgrid(np.arange(w), np.arange(h))
        t = (np.cos(a) * xx + np.sin(a) * yy); t = (t - t.min()) / (t.max() - t.min())
        e = rng.uniform(0.3, 0.7); f *= (1 - shadow * np.clip((t - e) * 6, 0, 1))[..., None]
    if glare:                                    # แสงสะท้อนจ้าเป็นวง
        cx, cy = rng.uniform(0.2, 0.8) * w, rng.uniform(0.2, 0.8) * h; xx, yy = np.meshgrid(np.arange(w), np.arange(h))
        f += glare * 255 * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (0.12 * w) ** 2))[..., None]
    if blur: f = cv2.GaussianBlur(f, (0, 0), blur)
    f += rng.normal(0, noise, f.shape)
    out = np.clip(f, 0, 255).astype(np.uint8)
    ok, b = cv2.imencode('.jpg', out, [cv2.IMWRITE_JPEG_QUALITY, int(jpeg)]); return cv2.imdecode(b, 1)

def occlude(im, P, rng):
    """วัตถุบังขอบกระดาษ (ปากกา/นิ้ว) ที่กลางขอบด้านหนึ่ง ไม่บังหมุด"""
    k = int(rng.integers(4)); a, b = P[k], P[(k + 1) % 4]; c = (a + b) / 2
    n = np.float32([-(b - a)[1], (b - a)[0]]); n /= np.linalg.norm(n)
    p2 = c + n * rng.uniform(-400, 400); col = tuple(float(x) for x in rng.uniform(20, 120, 3))
    cv2.line(im, tuple(int(x) for x in c - n * 300), tuple(int(x) for x in p2 + n * 300), col, int(rng.uniform(60, 140)))
    return im

# เงื่อนไข: เปลี่ยนทีละปัจจัย (ที่เหลืออ่อน) + mix รวมทุกอย่าง
CONDS = {
    'bg_white':  dict(bg='white'),
    'bg_dark':   dict(bg='dark'),
    'bg_cloth':  dict(bg='cloth'),
    'bg_pattern':dict(bg='pattern'),
    'rot_any':   dict(rot=(0, 360)),
    'tilt':      dict(tilt=0.07),
    'small':     dict(scale=(0.42, 0.55)),
    'cut_corner':dict(cut=60),
    'occlude':   dict(occ=True),
    'dim':       dict(gain=0.45, noise=6),
    'shadow':    dict(shadow=0.6),
    'glare':     dict(glare=0.45),
    'blur':      dict(blur=3.0, jpeg=60),
    'mix':       dict(mix=True),
}

def make(im, Q, Htot, cond, seed):
    rng = np.random.default_rng(seed); c = dict(CONDS[cond])
    if c.pop('mix', False):
        c = dict(bg=rng.choice(['white', 'dark', 'cloth', 'pattern']), rot=(0, 360), tilt=rng.uniform(0.02, 0.06),
                 scale=(0.5, 0.85), gain=rng.uniform(0.55, 1.1), shadow=rng.uniform(0, 0.5), blur=rng.uniform(0, 2),
                 jpeg=rng.uniform(65, 92), occ=rng.random() < .3, cut=60 if rng.random() < .25 else 0, glare=rng.uniform(0, .3))
    land = rng.random() < 0.25; w, h = (4032, 3024) if land else (3024, 4032)
    bgk = c.get('bg', rng.choice(['dark', 'cloth', 'pattern']))
    P = pose(w, h, rng, scale=c.get('scale', (0.70, 0.88)) if not land else (0.6, 0.75), rot=c.get('rot', (-8, 8)),
             tilt=c.get('tilt', 0.03), cut=c.get('cut', 0))
    if im is None: return P, (w, h)
    paper, Hq = flat_paper(im, Q)
    out, S = compose(paper, P, background(bgk, w, h, rng))
    if c.get('occ'): out = occlude(out, P, rng)
    out = photometric(out, rng, gain=c.get('gain', 1.0), shadow=c.get('shadow', 0), blur=c.get('blur', 0),
                      noise=c.get('noise', 2), jpeg=c.get('jpeg', 92), glare=c.get('glare', 0))
    G = np.array(Htot) @ np.linalg.inv(Hq) @ np.linalg.inv(S)          # GT: รูปใหม่ → หน้าสแกน
    return out, G / G[2, 2], dict(bg=str(bgk), land=bool(land))

def reg_err(Hpred, G, pts):
    """แปลงจุดตรวจจากหน้าสแกน GT → รูปใหม่ → หน้าสแกนที่ระบบให้ แล้ววัดระยะ"""
    x = cv2.perspectiveTransform(pts.reshape(-1, 1, 2), np.linalg.inv(G))
    y = cv2.perspectiveTransform(x, np.array(Hpred)).reshape(-1, 2)
    return np.linalg.norm(y - pts.reshape(-1, 2), axis=1)
