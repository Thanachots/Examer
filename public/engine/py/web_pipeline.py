# EXAMER ในเบราว์เซอร์ (Pyodide) — ผลเหมือน model/examer/pipeline.py ทุกอย่าง แต่เรียก CNN ผ่าน onnxruntime-web (JS)
# ใช้ฟังก์ชันเดิมจาก pipeline.py (Phase 1 / 2A / Phase 3 v5 / ใส่ช่อง) · เฉพาะส่วนที่รัน CNN เขียนใหม่เป็น async
import sys, types, json, time
import numpy as np, cv2
sys.modules.setdefault('onnxruntime', types.SimpleNamespace(InferenceSession=lambda *a, **k: None))   # pipeline.py import ได้ (ไม่ได้ใช้)
sys.path.insert(0, '/py'); from examer import pipeline as P
import js
from pyodide.ffi import to_js

def _prog(step, msg):
    try: js.postMessage(to_js({'type': 'progress', 'step': step, 'msg': msg}, dict_converter=js.Object.fromEntries))
    except Exception: pass

async def _cnn(name, X, h, w):
    if not len(X): return np.zeros((0, 3 if name == 'm2b_v3' else 26), np.float32)
    out = await js.ortRun(name, to_js(np.asarray(X, np.float32).ravel()), len(X), h, w)
    return P._softmax(np.asarray(out.to_py(), np.float32).reshape(len(X), -1))

async def classify_cells(col, rows):
    g = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY); X = np.asarray([P._ctx(g, c) for r in rows for c in r['cells']], np.float32)
    p = await _cnn('m2b_v3', (255 - X) / 255., 96, 56); out, k = [], 0
    for r in rows: out.append([int(v) for v in p[k:k + len(r['cells'])].argmax(1)]); k += len(r['cells'])
    return out

async def read_letters(col, rows):
    per, _ = P.L5.letters(col, [dict(r) for r in rows]); flat = [im for items in per for (im, b) in items]
    p = await _cnn('m3_az', np.asarray(flat, np.float32) / 255., 48, 48); k = 0; B, Pr, Cf = [], [], []
    for items in per:
        n = len(items); B.append([[int(v) for v in b] for _, b in items])
        Pr.append([chr(65 + int(p[k + j].argmax())) for j in range(n)]); Cf.append([float(p[k + j].max()) for j in range(n)]); k += n
    return B, Pr, Cf

async def combine_v3(col, rows, cls2b, boxes, pred, conf):
    # ตรรกะเดียวกับ pipeline.combine_v3 (ต่างแค่ _read48 เป็น await)
    g = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY); ink = (g < 170) & ~P._linemask(g.shape, rows, 2); out = []
    for ri, rw in enumerate(rows):
        sc = P._in_cell_score(rw, boxes[ri])
        if sc < P.INROW_T:
            seq = [p if c >= P.TAU else '?' for p, c in zip(pred[ri], conf[ri])]
            out.append(dict(row=ri + 1, mode='line', score=round(sc, 3), letters=seq, boxes=boxes[ri], conf=[round(c, 3) for c in conf[ri]])); continue
        cells = rw['cells']; hit = [[] for _ in cells]
        for b, p, c in zip(boxes[ri], pred[ri], conf[ri]): hit[P._cell_of(cells, (b[0] + b[2]) / 2)].append((p, c))
        ans, cf = [], []
        for k, cb in enumerate(cells):
            c2, h = cls2b[ri][k], hit[k]
            if c2 == 2: ans.append('-'); cf.append(None); continue
            if len(h) == 1:
                p, c = h[0]
                if c2 == 0 and c < P.TAU: ans.append(''); cf.append(None); continue
                ans.append(p if c >= P.TAU else '?'); cf.append(round(c, 3)); continue
            if len(h) > 1: ans.append('?'); cf.append(round(max(x[1] for x in h), 3)); continue
            if c2 == 0: ans.append(''); cf.append(None); continue
            im = P._cell_crop(ink, cb)
            if im is None: ans.append(''); cf.append(None); continue
            pr = (await _cnn('m3_az', np.asarray([im], np.float32) / 255., 48, 48))[0]
            ans.append(chr(65 + int(pr.argmax())) if pr.max() >= P.TAU else '?'); cf.append(round(float(pr.max()), 3))
        out.append(dict(row=ri + 1, mode='cell', score=round(sc, 3), cells=ans, conf=cf, boxes=[list(map(int, c)) for c in cells]))
    return out

async def read_sheet(path):
    """ไฟล์รูป (jpg/png/heic) → dict ผลอ่าน รูปแบบเดียวกับ model/README.md"""
    t0 = time.time(); R = dict(ok=False); _prog(1, 'Phase 1 · สแกน ตรง ตั้ง ลบเงา')
    res, _, col = P.P1.run_v4(P.load_image(path), P.REF)
    qc = res.get('qc_max'); R['phase1'] = dict(path=res.get('path'), qc_px=None if qc is None else round(float(qc), 2))
    if col is None: R['error'] = 'Phase 1: หาแผ่นกระดาษไม่เจอ (ลองถ่ายใหม่ให้เห็นหมุดดำ 3 มุม)'; return R
    _prog(2, 'Phase 2A · หาตาราง'); rows = P.A.detect(col)
    rows = [dict(top=r['top'], bot=r['bot'], vlines=r['vlines'], cells=[[int(v) for v in c] for c in r['cells']]) for r in rows]
    R['phase2a'] = dict(rows=len(rows), cells_per_row=[len(r['cells']) for r in rows])
    if len(rows) != 20 or any(len(r['cells']) != 20 for r in rows): R['error'] = 'Phase 2A: หาตาราง 20×20 ไม่ครบ'; return R
    _prog(3, 'Phase 2B · ว่าง / ตัวอักษร / ขีดฆ่า'); cls = await classify_cells(col, rows)
    _prog(4, 'Phase 3 · อ่าน A–Z'); B, Pr, Cf = await read_letters(col, rows)
    R['rows'] = await combine_v3(col, rows, cls, B, Pr, Cf); R['phase2b'] = [[P.CLS[v] for v in r] for r in cls]
    R['needs_review'] = sum(x == '?' for r in R['rows'] for x in (r.get('cells') or r.get('letters')))
    R['ok'] = True; R['qc_warning'] = bool(qc is not None and qc > 8); R['seconds'] = round(time.time() - t0, 1)
    ok, buf = cv2.imencode('.jpg', cv2.resize(col, (1240, 1754)), [cv2.IMWRITE_JPEG_QUALITY, 80]); R['scan_jpg'] = bytes(buf)   # ภาพหน้าสแกนย่อ (ไว้แสดงบนจอ) · 620×877 → 1240×1754 ให้ครูเห็นลายมือชัดตอนแก้ (ไม่มีผลกับการอ่าน) [claude/gelatin · 2026-10-28]
    return R
