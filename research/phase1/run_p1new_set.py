# วัดผลจริง Phase 1 v3 บนชุด A (resume ได้) · python run_p1new.py <วินาที>
import csv, json, os, sys, time, hashlib, importlib.util, cv2, numpy as np, pillow_heif
from PIL import Image, ImageOps
pillow_heif.register_heif_opener()
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'dataset', 'phase1_new'); SET = sys.argv[2] if len(sys.argv) > 2 else 'A'; OUT = os.path.join(H, 'real_v3' + SET); os.makedirs(OUT + '/scan', exist_ok=True); os.makedirs(OUT + '/thumb', exist_ok=True)
H3 = [l.split('|')[2].strip() for l in open(os.path.join(H, 'LOCK_v3.md'), encoding='utf-8') if l.startswith('| phase1_v3_locked.py')][0]
assert hashlib.sha256(open(os.path.join(H, 'phase1_v3_locked.py'), 'rb').read()).hexdigest() == H3
assert hashlib.sha256(open(os.path.join(D, 'split_p1new.csv'), 'rb').read()).hexdigest().startswith('692ee1549f598ec9')
spec = importlib.util.spec_from_file_location('p3', os.path.join(H, 'phase1_v3_locked.py')); p3 = importlib.util.module_from_spec(spec); spec.loader.exec_module(p3)
REF = json.load(open(os.path.join(H, 'bars_ref.json')))
A = [r['file'] for r in csv.DictReader(open(os.path.join(D, 'split_p1new.csv'), encoding='utf-8')) if r['set'] == SET]
logf = os.path.join(OUT, 'results.jsonl'); done = set()
if os.path.exists(logf): done = {json.loads(l)['file'] for l in open(logf, encoding='utf-8')}
LIMIT = float(sys.argv[1]); t0 = time.time()
with open(logf, 'a', encoding='utf-8') as fo:
    for f in A:
        if f in done: continue
        if time.time() - t0 > LIMIT: break
        jp = os.path.join(D, 'jpg', f[:-5] + '.jpg')
        if not os.path.exists(jp):
            ImageOps.exif_transpose(Image.open(os.path.join(D, 'raw_heic', f))).convert('RGB').save(jp, quality=92)
        im = cv2.imread(jp); t1 = time.time(); res, g, c = p3.run_v3(im, REF); dt = time.time() - t1
        rec = dict(file=f, sec=round(dt, 2), ok=c is not None, path=res.get('path'), n_bars=res.get('n_bars'), qc_max=res.get('qc_max'), qc_mean=res.get('qc_mean'), rot=res.get('rot'), corners=res.get('corners'))
        if c is not None:
            cv2.imwrite(os.path.join(OUT, 'scan', f[:-5] + '.jpg'), c, [cv2.IMWRITE_JPEG_QUALITY, 92])
            cv2.imwrite(os.path.join(OUT, 'thumb', f[:-5] + '.jpg'), cv2.resize(c, (496, 702)), [cv2.IMWRITE_JPEG_QUALITY, 80])
        fo.write(json.dumps(rec, ensure_ascii=False, default=float) + '\n'); fo.flush()
print('done', len(done) + sum(1 for _ in open(logf, encoding='utf-8')) - len(done), 'of', len(A))
