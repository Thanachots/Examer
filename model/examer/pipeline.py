# EXAMER — อ่านกระดาษคำตอบ Template 2 (รูปถ่าย → คำตอบ 20 แถว × 20 ช่อง)
#
#   Phase 1 v4   รูปถ่าย → หน้าสแกนสี 2480×3508 (ตรง ตั้ง ลบเงา แก้กระดาษโค้ง)      phase1/phase1_v4_locked.py
#   Phase 2A     หาตาราง 20 แถว × 20 ช่อง จากเส้นพิมพ์                             phase2/phase2a_locked.py
#   Phase 2B v3  แต่ละช่อง → ว่าง / ตัวอักษร / ขีดฆ่า (CNN)                        models/m2b_v3.onnx
#   Phase 3 v5   แยกหมึกจากเส้น + อ่าน A–Z (CNN)                                 phase3/run/p3lib_v5.py · models/m3_az.onnx
#   ระบบรวม v2   แถวเขียนในช่อง → อ่านทีละช่อง · แถวเขียนทับเส้น → ลำดับตัวอักษรของแถว
#
# ไฟล์ *_locked.py / p3lib_v5.py / โมเดล = ตัวเดียวกับที่ใช้วัดผลในรายงาน (sha256 ใน MODEL_CARD.md) · อย่าแก้
import os, json, time, importlib.util
import numpy as np, cv2, onnxruntime as ort

_D = os.path.dirname(os.path.abspath(__file__))
def _load(name, rel):
    s = importlib.util.spec_from_file_location(name, os.path.join(_D, rel)); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m

P1 = _load('examer_p1', 'phase1/phase1_v4_locked.py')
A = _load('examer_p2a', 'phase2/phase2a_locked.py')
L5 = _load('examer_p3', 'phase3/run/p3lib_v5.py')
REF = json.load(open(os.path.join(_D, 'phase1/bars_ref.json')))
_S2B = ort.InferenceSession(os.path.join(_D, 'models/m2b_v3.onnx'), providers=['CPUExecutionProvider'])
_S3 = ort.InferenceSession(os.path.join(_D, 'models/m3_az.onnx'), providers=['CPUExecutionProvider'])

TAU = 0.8          # ความมั่นใจต่ำกว่านี้ → '?' ส่งครูตรวจ
INROW_T = 0.8      # สัดส่วนตัวอักษรที่อยู่ในช่องเดียว ≥ ค่านี้ = แถวเขียนในช่อง
CLS = ('empty', 'char', 'strike')

def _softmax(z): e = np.exp(z - z.max(1, keepdims=True)); return e / e.sum(1, keepdims=True)

# ---------- รูป ----------
def load_image(path):
    """อ่าน jpg / png / heic (iPhone) · หมุนตาม EXIF · คืนภาพ BGR"""
    from PIL import Image, ImageOps
    try:
        import pillow_heif; pillow_heif.register_heif_opener()
    except ImportError:
        pass
    return cv2.cvtColor(np.asarray(ImageOps.exif_transpose(Image.open(path)).convert('RGB')), cv2.COLOR_RGB2BGR)

# ---------- 2B v3: ภาพบริบท (ช่อง + ซ้าย/ขวา 10% + บน/ล่าง 75%) → 56×96 ----------
def _ctx(g, c, W=56, H=96):
    x0, y0, x1, y1 = c; w, h = x1 - x0, y1 - y0
    a, b = int(x0 - 0.1 * w), int(x1 + 0.1 * w); cc, d = int(y0 - 0.75 * h), int(y1 + 0.75 * h)
    cr = np.full((d - cc, b - a), 255, np.uint8); sa, sb, sc, sd = max(a, 0), min(b, g.shape[1]), max(cc, 0), min(d, g.shape[0])
    cr[sc - cc:sd - cc, sa - a:sb - a] = g[sc:sd, sa:sb]; return cv2.resize(cr, (W, H), interpolation=cv2.INTER_AREA)

def classify_cells(col, rows):
    g = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY); X = np.asarray([_ctx(g, c) for r in rows for c in r['cells']], np.float32)
    P = _softmax(_S2B.run(None, {'x': ((255 - X) / 255.)[:, None]})[0]); out, k = [], 0
    for r in rows: out.append([int(v) for v in P[k:k + len(r['cells'])].argmax(1)]); k += len(r['cells'])
    return out

# ---------- Phase 3 อ่าน A–Z ----------
def _read48(imgs):
    if not len(imgs): return np.zeros((0, 26), np.float32)
    return _softmax(_S3.run(None, {'x': (np.asarray(imgs, np.float32) / 255.)[:, None]})[0])

def read_letters(col, rows):
    per, _ = L5.letters(col, [dict(r) for r in rows]); flat = [im for items in per for (im, b) in items]
    p = _read48(flat); k = 0; B, Pr, Cf = [], [], []
    for items in per:
        n = len(items); B.append([[int(v) for v in b] for _, b in items])
        Pr.append([chr(65 + int(p[k + j].argmax())) for j in range(n)]); Cf.append([float(p[k + j].max()) for j in range(n)]); k += n
    return B, Pr, Cf

# ---------- ระบบรวม v2 ----------
def _linemask(shape, rows, w=2):
    lm = np.zeros(shape, bool)
    for rw in rows:
        x0, x1 = rw['cells'][0][0] - 45, rw['cells'][-1][2] + 8
        for (a, c) in (rw['top'], rw['bot']): lm[a - w:c + 1 + w, x0:x1] = True
        for (a, c) in rw['vlines']: lm[rw['top'][0] - 3:rw['bot'][1] + 4, a - w:c + 1 + w] = True
    return lm

def _norm48(mask):
    ys, xs = np.nonzero(mask)
    if len(ys) == 0: return None
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8) * 255
    h, w = m.shape; s = max(h, w) + 4; o = np.zeros((s, s), np.uint8)
    o[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = m
    return cv2.resize(o, (48, 48), interpolation=cv2.INTER_AREA)

def _cell_crop(ink, cb):
    """หมึกในช่อง (วิธีเดียวกับตอนสร้างข้อมูลเทรน CNN): ชิ้นที่จุดกลางอยู่ในช่อง"""
    x0, y0, x1, y1 = cb; sub = ink[y0 - 20:y1 + 20, x0 - 20:x1 + 20].astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(sub, 8); keep = np.zeros_like(sub, bool)
    for j in range(1, n):
        cx, cy = cen[j]
        if st[j, 4] >= 12 and 20 <= cx <= sub.shape[1] - 20 and 20 <= cy <= sub.shape[0] - 20: keep |= lab == j
    return None if keep.sum() < 60 else _norm48(keep)

def _in_cell_score(rw, boxes):
    if not boxes: return 1.0
    t, b = rw['top'][1], rw['bot'][0]; V = [(a + c) / 2 for a, c in rw['vlines']]; ok = 0
    for x0, y0, x1, y1 in boxes:
        yc = (y0 + y1) / 2; inside = t + 8 <= yc <= b - 8 and y0 >= t - 12 and y1 <= b + 12
        ok += inside and not any(x0 + 6 < v < x1 - 6 for v in V)
    return ok / len(boxes)

def combine(col, rows, cls2b, boxes, pred, conf):
    g = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY); ink = (g < 170) & ~_linemask(g.shape, rows, 2); out = []
    for ri, rw in enumerate(rows):
        sc = _in_cell_score(rw, boxes[ri])
        if sc < INROW_T:   # เขียนทับเส้น → ลำดับตัวอักษรของแถว
            seq = [p if c >= TAU else '?' for p, c in zip(pred[ri], conf[ri])]
            out.append(dict(row=ri + 1, mode='line', score=round(sc, 3), letters=seq, boxes=boxes[ri], conf=[round(c, 3) for c in conf[ri]])); continue
        cells, cf = [], []
        for k, cb in enumerate(rw['cells']):
            c = cls2b[ri][k]
            if c == 0: cells.append(''); cf.append(None); continue
            if c == 2: cells.append('-'); cf.append(None); continue
            im = _cell_crop(ink, cb)
            if im is None: cells.append('?'); cf.append(0.0); continue
            p = _read48([im])[0]; cells.append(chr(65 + int(p.argmax())) if p.max() >= TAU else '?'); cf.append(round(float(p.max()), 3))
        out.append(dict(row=ri + 1, mode='cell', score=round(sc, 3), cells=cells, conf=cf, boxes=[list(map(int, c)) for c in rw['cells']]))
    return out


# ---------- ระบบรวม v3 (27 ต.ค.): v5 อ่านทุกแถว · ใส่ช่องตามตำแหน่งจริง ----------
# v2 ตัดหมึกทีละช่องด้วยเกณฑ์คงที่ → ตัวล้นกรอบถูกตัดครึ่ง · เส้นเอียงติดมา · หมึกจางหาย
# v3: ใช้ตัวอักษรที่ Phase 3 v5 แยกได้ (เห็นทั้งตัว) แล้วใส่ช่องที่จุดกลางของตัวอยู่ · ช่องที่ 2B ว่าขีดฆ่า → ทิ้งตัวอักษรในช่องนั้น
def _cell_of(cells, cx):
    for k, c in enumerate(cells):
        if c[0] - 3 <= cx <= c[2] + 3: return k
    return min(range(len(cells)), key=lambda k: abs((cells[k][0] + cells[k][2]) / 2 - cx))

def combine_v3(col, rows, cls2b, boxes, pred, conf):
    g = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY); ink = (g < 170) & ~_linemask(g.shape, rows, 2); out = []
    for ri, rw in enumerate(rows):
        sc = _in_cell_score(rw, boxes[ri])
        if sc < INROW_T:   # เขียนทับเส้นทั้งแถว → ลำดับตัวอักษรของแถว (เหมือน v2)
            seq = [p if c >= TAU else '?' for p, c in zip(pred[ri], conf[ri])]
            out.append(dict(row=ri + 1, mode='line', score=round(sc, 3), letters=seq, boxes=boxes[ri], conf=[round(c, 3) for c in conf[ri]])); continue
        cells = rw['cells']; hit = [[] for _ in cells]
        for b, p, c in zip(boxes[ri], pred[ri], conf[ri]): hit[_cell_of(cells, (b[0] + b[2]) / 2)].append((p, c, (b[2] - b[0]) * (b[3] - b[1])))
        ans, cf = [], []
        for k, cb in enumerate(cells):
            c2, h = cls2b[ri][k], hit[k]
            if c2 == 2: ans.append('-'); cf.append(None); continue          # ขีดฆ่า: ทิ้งทุกชิ้นในช่องนี้
            if len(h) == 1:
                p, c, _ = h[0]
                if c2 == 0 and c < TAU: ans.append(''); cf.append(None); continue   # 2B ว่าง + ไม่มั่นใจ → เศษ
                ans.append(p if c >= TAU else '?'); cf.append(round(c, 3)); continue
            if len(h) > 1: ans.append('?'); cf.append(round(max(x[1] for x in h), 3)); continue
            if c2 == 0: ans.append(''); cf.append(None); continue
            im = _cell_crop(ink, cb)                                      # 2B ว่ามีหมึก แต่ v5 ไม่พบตัวอักษร
            if im is None: ans.append(''); cf.append(None); continue      # จุด/เศษเล็ก → ว่าง
            pr = _read48([im])[0]; ans.append(chr(65 + int(pr.argmax())) if pr.max() >= TAU else '?'); cf.append(round(float(pr.max()), 3))
        out.append(dict(row=ri + 1, mode='cell', score=round(sc, 3), cells=ans, conf=cf, boxes=[list(map(int, c)) for c in cells]))
    return out

# ---------- ทั้งระบบ ----------
def read_sheet(img_bgr, keep_scan=False):
    """รูป BGR → dict ผลอ่าน (ดูรูปแบบใน README.md)"""
    t0 = time.time(); R = dict(ok=False)
    res, _, col = P1.run_v4(img_bgr, REF)
    qc = res.get('qc_max'); R.update(phase1=dict(path=res.get('path'), qc_px=None if qc is None else round(float(qc), 2)))
    if col is None: R['error'] = 'Phase 1: หาแผ่นกระดาษไม่เจอ (ลองถ่ายใหม่ให้เห็นหมุดดำ 3 มุม)'; return R
    rows = A.detect(col); rows = [dict(top=r['top'], bot=r['bot'], vlines=r['vlines'], cells=[[int(v) for v in c] for c in r['cells']]) for r in rows]
    R['phase2a'] = dict(rows=len(rows), cells_per_row=[len(r['cells']) for r in rows])
    if len(rows) != 20 or any(len(r['cells']) != 20 for r in rows): R['error'] = 'Phase 2A: หาตาราง 20×20 ไม่ครบ'; R['scan'] = col if keep_scan else None; return R
    cls = classify_cells(col, rows); B, Pr, Cf = read_letters(col, rows)
    R['rows'] = combine_v3(col, rows, cls, B, Pr, Cf)
    R['phase2b'] = [[CLS[v] for v in r] for r in cls]
    R['needs_review'] = sum(x == '?' for r in R['rows'] for x in (r.get('cells') or r.get('letters')))
    R['ok'] = True; R['qc_warning'] = bool(qc is not None and qc > 8); R['seconds'] = round(time.time() - t0, 1)
    if keep_scan: R['scan'] = col
    return R
