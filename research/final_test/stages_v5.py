import sys, json, time, importlib.util, numpy as np, cv2, onnxruntime as ort
from PIL import Image, ImageOps, ImageDraw, ImageFont
import pillow_heif; pillow_heif.register_heif_opener()
R = 'app/py'
def load(n, p):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
P1 = load('p1', f'{R}/phase1/phase1_v3_locked.py'); A = load('A', f'{R}/phase2/phase2a_locked.py')
sys.path.insert(0, f'{R}/phase3/run'); import p3lib_v5 as L, system as S, strikefix_v2 as SF
REF = json.load(open(f'{R}/phase1/bars_ref.json'))
SESS = {k: ort.InferenceSession(f'app/{k}.onnx') for k in ('m2b', 'm3')}
def cnn(k, X, s):
    lo = SESS[k].run(None, {'x': np.asarray(X, np.float32).reshape(-1, 1, s, s)})[0]; e = np.exp(lo - lo.max(1, keepdims=True)); return e / e.sum(1, keepdims=True)
def sq(cr, s=64):
    h, w = cr.shape; m = max(h, w); out = np.full((m, m), 255, np.uint8); out[(m - h) // 2:(m - h) // 2 + h, (m - w) // 2:(m - w) // 2 + w] = cr
    return cv2.resize(out, (s, s), interpolation=cv2.INTER_AREA)
src, od = sys.argv[1], sys.argv[2]; T = {}
def save(name, img, w=1400): s = w / img.shape[1]; cv2.imwrite(f'{od}/{name}', cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 88])
t = time.time(); im = cv2.cvtColor(np.asarray(ImageOps.exif_transpose(Image.open(src)).convert('RGB')), cv2.COLOR_RGB2BGR); T['decode'] = time.time() - t
save('0_original.jpg', im)
t = time.time(); res, g, col = P1.run_v3(im, REF); T['phase1'] = time.time() - t
print('input', im.shape[1], 'x', im.shape[0], '| Phase1 path', res.get('path'), 'qc_max', round(res.get('qc_max') or -1, 2), 'qc_mean', round(res.get('qc_mean') or -1, 2))
save('1_phase1_scan.jpg', col, 1600)
t = time.time(); rows = A.detect(col); gg = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY); X, B = [], []
for i, r in enumerate(rows):
    for k, c in enumerate(r['cells']): X.append(sq(gg[c[1] + A.INSET:c[3] - A.INSET + 1, c[0] + A.INSET:c[2] - A.INSET + 1])); B.append((i, k))
T['phase2a'] = time.time() - t
v = col.copy()
for r in rows:
    for c in r['cells']: cv2.rectangle(v, (int(c[0]), int(c[1])), (int(c[2]), int(c[3])), (200, 60, 30), 3)
save('2A_cells.jpg', v, 1600); print('Phase2A rows', len(rows), 'cells/row', [len(r['cells']) for r in rows])
t = time.time(); p2 = cnn('m2b', (255 - np.asarray(X, np.float32)) / 255., 64); T['phase2b'] = time.time() - t
cls = [[int(np.argmax(p2[n])) for n, b in enumerate(B) if b[0] == i] for i in range(len(rows))]; cls = SF.fix(col, [dict(top=r['top'], bot=r['bot'], vlines=r['vlines'], cells=list(r['cells'])) for r in rows], cls)
v = col.copy(); ov = v.copy()
for i, r in enumerate(rows):
    for k, c in enumerate(r['cells']):
        p1_, p2_ = (int(c[0]), int(c[1])), (int(c[2]), int(c[3]))
        if cls[i][k] == 1: cv2.rectangle(ov, p1_, p2_, (220, 120, 40), -1)
        elif cls[i][k] == 2: cv2.rectangle(ov, p1_, p2_, (120, 120, 120), -1); cv2.line(v, p1_, p2_, (90, 90, 90), 4); cv2.line(v, (p2_[0], p1_[1]), (p1_[0], p2_[1]), (90, 90, 90), 4)
v = cv2.addWeighted(ov, 0.25, v, 0.75, 0); save('2B_cell_types.jpg', v, 1600)
print('strike cells (row,col):', [(i+1,k+1) for i in range(len(cls)) for k in range(len(cls[i])) if cls[i][k]==2]); f = sum(cls, []); print('Phase2B blank', f.count(0), 'letter', f.count(1), 'strike', f.count(2))
t = time.time(); rows2 = [dict(top=r['top'], bot=r['bot'], vlines=r['vlines'], cells=list(r['cells'])) for r in rows]; per, tt = L.letters(col, rows2); T['phase3_seg'] = time.time() - t
t = time.time(); flat = [im_ for items in per for (im_, b) in items]; p3 = cnn('m3', np.asarray(flat, np.float32) / 255., 48); T['phase3_cnn'] = time.time() - t
k = 0; Lr, Pr, Cr = [], [], []
for items in per:
    Lr.append([[int(v_) for v_ in b] for _, b in items]); Pr.append([chr(65 + int(p3[k + j].argmax())) for j in range(len(items))]); Cr.append([float(p3[k + j].max()) for j in range(len(items))]); k += len(items)
ans, fl = S.assign([r['cells'] for r in rows], cls, Lr, Pr, Cr)
v = col.copy()
for ri, row in enumerate(Lr):
    for j, b in enumerate(row):
        c = (60, 160, 30) if Cr[ri][j] >= 0.8 else (0, 140, 255)
        cv2.rectangle(v, (b[0] - 3, b[1] - 3), (b[2] + 3, b[3] + 3), c, 3); cv2.putText(v, Pr[ri][j], (b[0], b[1] - 8), cv2.FONT_HERSHEY_SIMPLEX, 1.1, c, 3)
save('3_letters.jpg', v, 1600)
# ตัวอักษรที่ตัดได้ (48x48) ต่อแถว
tiles = []
for ri, items in enumerate(per):
    row = np.full((56, 56 * 16), 255, np.uint8)
    for j, (im_, b) in enumerate(items[:16]): row[4:52, j * 56 + 4:j * 56 + 52] = im_
    tiles.append(row)
sheet = cv2.cvtColor(np.vstack(tiles), cv2.COLOR_GRAY2BGR); cv2.imwrite(f'{od}/3_crops_48px.png', sheet)
print('pen', tt, '| times', {k_: round(v_, 1) for k_, v_ in T.items()})
q = 0
for i, a in enumerate(ans):
    s = ''.join(x for x in a if x not in ('', '-')); q += s.count('?'); print('%2d %-14s %s' % (i + 1, s, ''.join(Pr[i])))
print('flagged', q)
