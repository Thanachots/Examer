# ขั้น B: 2B (v1 / v2) + Phase 3 (v1 / v5) + รวมคำตอบ · python final_run.py CACHE_DIR OUT.json M2B_V2.pt
import sys, os, json, pickle, glob, importlib.util, numpy as np, cv2, onnxruntime as ort
sys.path.insert(0, 'app/py/phase3/run'); sys.path.insert(0, '../b2')
import system as S, m2b_v2_net as N2
def load(n, p):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
L1 = load('L1', 'app/py/phase3/run/p3lib.py'); L5 = load('L5', 'app/py/phase3/run/p3lib_v5.py'); A = load('A', 'app/py/phase2/phase2a_locked.py')
S2 = ort.InferenceSession('app/m2b.onnx'); S3 = ort.InferenceSession('app/m3.onnx'); NET = N2.load(sys.argv[3])
def sm(lo): e = np.exp(lo - lo.max(1, keepdims=True)); return e / e.sum(1, keepdims=True)
def sq(cr, s=64):
    h, w = cr.shape; m = max(h, w); out = np.full((m, m), 255, np.uint8); out[(m - h) // 2:(m - h) // 2 + h, (m - w) // 2:(m - w) // 2 + w] = cr
    return cv2.resize(out, (s, s), interpolation=cv2.INTER_AREA)
def b2v1(col, rows):
    g = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY); X = [sq(g[c[1] + A.INSET:c[3] - A.INSET + 1, c[0] + A.INSET:c[2] - A.INSET + 1]) for r in rows for c in r['cells']]
    p = S2.run(None, {'x': ((255 - np.asarray(X, np.float32)) / 255.).reshape(-1, 1, 64, 64)})[0].argmax(1); out, k = [], 0
    for r in rows: out.append([int(v) for v in p[k:k + len(r['cells'])]]); k += len(r['cells'])
    return out
def p3(L, col, rows):
    per, tt = L.letters(col, [dict(r) for r in rows]); flat = [im for items in per for (im, b) in items]
    p = sm(S3.run(None, {'x': (np.asarray(flat, np.float32) / 255.).reshape(-1, 1, 48, 48)})[0]); k = 0; Lr, Pr, Cr = [], [], []
    for items in per:
        Lr.append([[int(v) for v in b] for _, b in items]); Pr.append([chr(65 + int(p[k + j].argmax())) for j in range(len(items))]); Cr.append([float(p[k + j].max()) for j in range(len(items))]); k += len(items)
    return Lr, Pr, Cr
OUT = {}
for f in sorted(glob.glob(sys.argv[1] + '/*.pkl')):
    n = os.path.basename(f)[:-4]; d = pickle.load(open(f, 'rb'))
    if d.get('fail'): OUT[n] = dict(fail=True); continue
    col, rows = d['col'], d['rows']; cells = [r['cells'] for r in rows]
    c1 = b2v1(col, rows); c2, _ = N2.classify(NET, col, rows)
    R = dict(path=d['path'], qc_v4=d.get('qc_v4', d.get('qc')), qc_v3=d.get('qc_v3'), nrows=len(rows), ncells=[len(r['cells']) for r in rows], b2v1=c1, b2v2=c2)
    for tag, L in (('p3v1', L1), ('p3v5', L5)):
        Lr, Pr, Cr = p3(L, col, rows); R[tag] = dict(boxes=Lr, pred=Pr, conf=Cr)
        for btag, cls in (('b2v1', c1), ('b2v2', c2)):
            ans, fl = S.assign(cells, cls, Lr, Pr, Cr); R[f'{tag}_{btag}'] = ans
    OUT[n] = R; print(n, 'strikes v1', sum(v == 2 for r in c1 for v in r), 'v2', sum(v == 2 for r in c2 for v in r), flush=True)
json.dump(OUT, open(sys.argv[2], 'w'))
