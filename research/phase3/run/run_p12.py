# Phase 3 data: รัน Phase 1 v3 → 2A → 2B (โค้ด/โมเดลที่ล็อก ตรวจ hash) บนชุดที่ระบุ (ตอนนี้ train เท่านั้น)
import os, sys, json, csv, hashlib, importlib.util, time, cv2, numpy as np, torch, pillow_heif
from PIL import Image, ImageOps
pillow_heif.register_heif_opener()
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); SET = sys.argv[1]
assert SET in ('train', 'val'), 'test ต้องได้รับอนุญาตก่อน (val อนุญาต 24 ต.ค. 21:20)'
def chk(path, lock, key):
    h = [l.split('|')[2].strip() for l in open(lock, encoding='utf-8') if l.startswith('| ' + key)][0]
    assert hashlib.sha256(open(path, 'rb').read()).hexdigest() == h, path
def load(name, path):
    s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
chk(f'{R}/phase1/phase1_v3_locked.py', f'{R}/phase1/LOCK_v3.md', 'phase1_v3_locked.py')
chk(f'{R}/phase2/phase2a_locked.py', f'{R}/phase2/LOCK_2A.md', 'phase2a_locked.py')
chk(f'{R}/phase2b/m2b_locked.pt', f'{R}/phase2b/LOCK_2B.md', 'm2b_locked.pt')
P1 = load('p1', f'{R}/phase1/phase1_v3_locked.py'); A = load('A', f'{R}/phase2/phase2a_locked.py')
sys.argv = [sys.argv[0]]; sys.path.insert(0, f'{R}/phase2b')
import types; src = open(f'{R}/phase2b/train2b.py', encoding='utf-8').read(); i0 = src.index('class Net'); i1 = src.index('def prep')
ns = {'nn': torch.nn, 'np': np, 'torch': torch}; exec(src[i0:i1], ns); net = ns['Net'](); net.load_state_dict(torch.load(f'{R}/phase2b/m2b_locked.pt', map_location='cpu')); net.eval()
REF = json.load(open(f'{R}/phase1/bars_ref.json'))
files = [r['file'] for r in csv.DictReader(open(f'{R}/dataset/phase3_edge/split_p3.csv')) if r['set'] == SET]
D = f'{R}/dataset/phase3_edge/{SET}'; O = f'{R}/phase3/data/{SET}'; os.makedirs(O + '/scan', exist_ok=True)
def sq(cr, S=64):
    h, w = cr.shape; m = max(h, w); out = np.full((m, m), 255, np.uint8); out[(m - h) // 2:(m - h) // 2 + h, (m - w) // 2:(m - w) // 2 + w] = cr
    return cv2.resize(out, (S, S), interpolation=cv2.INTER_AREA)
log = []
for f in files:
    t0 = time.time(); im = cv2.cvtColor(np.asarray(ImageOps.exif_transpose(Image.open(f'{D}/{f}')).convert('RGB')), cv2.COLOR_RGB2BGR)
    res, g, col = P1.run_v3(im, REF); rec = dict(file=f, p1_ok=col is not None, qc_max=res.get('qc_max'), path=res.get('path'))
    if col is None: log.append(rec); print(rec, flush=True); continue
    cv2.imwrite(f'{O}/scan/{f[:-5]}.jpg', col, [cv2.IMWRITE_JPEG_QUALITY, 95])
    rows = A.detect(col); gg = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY)
    rec['n_rows'] = len(rows); rec['cells_per_row'] = [len(r['cells']) for r in rows]
    X = []; boxes = []
    for i, r in enumerate(rows):
        for k, c in enumerate(r['cells']):
            X.append(sq(gg[c[1] + A.INSET:c[3] - A.INSET + 1, c[0] + A.INSET:c[2] - A.INSET + 1])); boxes.append((i, k, *[int(v) for v in c]))
    with torch.no_grad(): p = torch.softmax(net(torch.from_numpy((255 - np.asarray(X, np.float32)) / 255.)[:, None]), 1).numpy() if X else np.zeros((0, 3))
    rec['cls_counts'] = np.bincount(p.argmax(1), minlength=3).tolist() if len(p) else [0, 0, 0]
    rec['rows'] = [dict(top=[int(v) for v in r['top']], bot=[int(v) for v in r['bot']], vlines=[[int(a) for a in v] for v in r['vlines']]) for r in rows]
    rec['cells'] = [dict(row=b[0], col=b[1], box=b[2:], p=[round(float(x), 4) for x in pp]) for b, pp in zip(boxes, p)]
    rec['sec'] = round(time.time() - t0, 1); log.append(rec)
    print(f, rec['p1_ok'], round(rec['qc_max'] or -1, 2), rec['n_rows'], rec['cells_per_row'][:3], rec['cls_counts'], rec['sec'], flush=True)
json.dump(log, open(f'{O}/p12.json', 'w'))
