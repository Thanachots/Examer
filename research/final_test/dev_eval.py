# ประเมินชุดพัฒนา (Train 30 + Valid 10 + 5417 + 8029) ทั้งระบบ · python dev_eval.py <p3lib.py> <label> [strikefix]
import sys, os, json, pickle, glob, string, importlib.util, numpy as np, onnxruntime as ort
sys.path.insert(0, 'app/py/phase3/run'); import system as S
def load(n, p):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
L = load('p3v', sys.argv[1]); label = sys.argv[2]; SF = len(sys.argv) > 3 and sys.argv[3] == 'strikefix'
if SF: SFM = load('sfix', 'diag/strikefix.py')
S3 = ort.InferenceSession(os.environ.get('M3', 'app/m3.onnx'))
VO = json.load(open('../p3/phase3/data/val/truth_override.json')); VO.pop('_note')
U = string.ascii_uppercase
def truth(name, ri):
    if name.startswith(('IMG_8029', 'IMG_5416')): return ''.join(U[(ri * 20 + i) % 26] for i in range(20))
    if name.startswith('IMG_5417') and ri in (1, 3): return 'OPQRSTUVWXYZN'
    if name.startswith('IMG_9722') and ri == 6: return 'ABCDEFGHIJKL'
    if name.startswith('IMG_9722') and ri == 7: return 'MNOPQRSTUVWXYZ'
    k = f'{name}|{ri}'
    if k in VO: return VO[k]
    return 'ABCDEFGHIJKLM' if ri % 2 == 0 else 'NOPQRSTUVWXYZ'
def ed(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        p = d[:]; d[0] = i
        for j, y in enumerate(b, 1): d[j] = min(p[j] + 1, d[j - 1] + 1, p[j - 1] + (x != y))
    return d[-1]
def grp(n):
    if os.environ.get('CACHE'): return n.split('.')[0]
    if n.startswith(('IMG_5417', 'IMG_8029')): return n.split('.')[0]
    return 'val' if n[:8] in {f'IMG_{x}' for x in range(9692, 9702)} else 'train'
res = {}; per_sheet = {}; ROWS = {}
CD = os.environ.get('CACHE', 'diag/cache')
for f in sorted(glob.glob(CD + '/*.pkl')):
    name = os.path.basename(f)[:-4]; d = pickle.load(open(f, 'rb')); col, rows, lo = d['col'], d['rows'], d['p2']
    p2c = lo.argmax(1); k = 0; cls = []
    for r in rows: cls.append([int(v) for v in p2c[k:k + len(r['cells'])]]); k += len(r['cells'])
    per, tt = L.letters(col, [dict(r) for r in rows])
    if SF: cls = SFM.fix(col, rows, cls)
    flat = [im for items in per for (im, b) in items]
    lo3 = S3.run(None, {'x': (np.asarray(flat, np.float32) / 255.).reshape(-1, 1, 48, 48)})[0]; e = np.exp(lo3 - lo3.max(1, keepdims=True)); p3 = e / e.sum(1, keepdims=True)
    k = 0; Lr, Pr, Cr = [], [], []
    for items in per:
        Lr.append([[int(v) for v in b] for _, b in items]); Pr.append([chr(65 + int(p3[k + j].argmax())) for j in range(len(items))]); Cr.append([float(p3[k + j].max()) for j in range(len(items))]); k += len(items)
    ans, fl = S.assign([r['cells'] for r in rows], cls, Lr, Pr, Cr)
    g = grp(name); R = res.setdefault(g, dict(ch=0, e_read=0, e_sys=0, q=0, wrong_auto=0, strikes=0, sheets=0)); R['sheets'] += 1
    es = 0
    for ri in range(len(rows)):
        t = truth(name, ri); rd = ''.join(Pr[ri]); sy = ''.join(x for x in ans[ri] if x not in ('', '-'))
        ROWS.setdefault(name, []).append([t, rd, sy])
        R['ch'] += len(t); R['e_read'] += ed(rd, t); e2 = ed(sy, t); R['e_sys'] += e2; es += e2; R['q'] += sy.count('?')
        R['wrong_auto'] += ed(sy.replace('?', ''), t) - (len(t) - len(sy.replace('?', ''))) if len(sy.replace('?', '')) <= len(t) else 0
    R['strikes'] += sum(c == 2 for r in cls for c in r)
    per_sheet[name] = es
out = {g: dict(sheets=R['sheets'], CAR_read=round(100 * (1 - R['e_read'] / R['ch']), 2), CAR_sys=round(100 * (1 - R['e_sys'] / R['ch']), 2), flagged=R['q'], strikes=R['strikes']) for g, R in res.items()}
print(label, json.dumps(out, ensure_ascii=False))
json.dump(dict(summary=out, per_sheet=per_sheet, rows=ROWS), open(f'diag/dev_{label}.json', 'w'))
