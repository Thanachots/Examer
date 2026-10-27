# ขั้น A (รูปใหม่): Phase 1 v4 (ล็อก) + Phase 1 v3 (ตัวเทียบ) → 2A → เก็บ pickle · python final_cache.py OUTD photos...
import sys, os, json, pickle, time, importlib.util, numpy as np, cv2
from PIL import Image, ImageOps
import pillow_heif; pillow_heif.register_heif_opener()
R = 'app/py'
def load(n, p):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
P4 = load('p4', f'{R}/phase1/phase1_v4_locked.py'); A = load('A', f'{R}/phase2/phase2a_locked.py'); REF = json.load(open(f'{R}/phase1/bars_ref.json'))
OUTD = sys.argv[1]; os.makedirs(OUTD, exist_ok=True)
for path in sys.argv[2:]:
    name = os.path.splitext(os.path.basename(path))[0]; out = f'{OUTD}/{name}.pkl'
    if os.path.exists(out): continue
    t = time.time(); im = cv2.cvtColor(np.asarray(ImageOps.exif_transpose(Image.open(path)).convert('RGB')), cv2.COLOR_RGB2BGR)
    res, g, col = P4.run_v4(im, REF)
    if col is None: pickle.dump(dict(fail=True, res={k: v for k, v in res.items() if isinstance(v, (int, float, str, type(None)))}), open(out, 'wb')); print(name, 'FAIL'); continue
    rows = A.detect(col); rows2 = [dict(top=r['top'], bot=r['bot'], vlines=r['vlines'], cells=[[int(v) for v in c] for c in r['cells']]) for r in rows]
    v4 = res.get('v4') or {}
    pickle.dump(dict(col=col, rows=rows2, path=res.get('path'), qc_v4=res.get('qc_max'), qc_v3=v4.get('qc_v3'), used=v4.get('used'), sec=round(time.time() - t, 1)), open(out, 'wb'))
    print(name, res.get('path'), 'rows', len(rows), 'cells', [len(r['cells']) for r in rows][:3], 'qc', round(res.get('qc_max') or -1, 2), flush=True)
