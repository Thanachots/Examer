# Phase 1 v1 · รันชุด Test ครั้งเดียว (resume ได้เฉพาะกรณีรันค้าง) · ตรวจ hash ก่อนรัน
import csv, json, os, sys, time, hashlib, cv2, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = os.path.join(HERE, '..', 'dataset')
LOCK = {'phase1_v1.py': '0d5e19e8f7b8132824c4b4c9adf5252e014f99fdc0115aad895e9546fd537bc0',
        'bars_ref.json': 'f5a6b240d67bb002a913fe7d6affa8a6138523738c952c874b0643a33ba2fc6f'}
for f, h in LOCK.items():
    assert hashlib.sha256(open(os.path.join(HERE, f), 'rb').read()).hexdigest() == h, f'ไฟล์ {f} ถูกแก้หลังล็อก'
spec = importlib.util.spec_from_file_location('p1v1', os.path.join(HERE, 'phase1_v1.py')); p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
REF = json.load(open(os.path.join(HERE, 'bars_ref.json')))
OUT = os.path.join(HERE, 'test_v1'); os.makedirs(os.path.join(OUT, 'thumb'), exist_ok=True)
resf = os.path.join(OUT, 'results.jsonl'); done = set()
if os.path.exists(resf): done = {json.loads(l)['file'] for l in open(resf, encoding='utf-8')}
rows = [r for r in csv.DictReader(open(os.path.join(BASE, 'splits.csv'), encoding='utf-8')) if r['phase1_2A'] == 'test']
LIMIT = float(sys.argv[1]) if len(sys.argv) > 1 else 160; t0 = time.time(); n = 0
with open(resf, 'a', encoding='utf-8') as fo:
    for row in rows:
        if row['file'] in done: continue
        if time.time() - t0 > LIMIT: break
        im = cv2.imread(os.path.join(BASE, row['file'])); t1 = time.time()
        try: r, cl = p.run_v04(im, REF)
        except Exception as e: r, cl = {'fail': 'exc:' + repr(e)[:80]}, None
        r = {k: v for k, v in r.items() if k != 'tried'}
        r.update(file=row['file'], folder=row['folder'], ms=round((time.time() - t1) * 1000), w=im.shape[1], h=im.shape[0])
        if cl is not None:
            th = os.path.join(OUT, 'thumb', row['folder'] + '__' + os.path.basename(row['file']))
            cv2.imencode('.jpg', cv2.resize(cl, (310, 438)))[1].tofile(th)
        fo.write(json.dumps(r, ensure_ascii=False) + '\n'); n += 1
print('new', n, 'total', len(done) + n, 'of', len(rows))
