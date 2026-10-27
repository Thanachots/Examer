# Phase 1 v2 (ล็อก) · รันชุดใหม่ครั้งเดียว · ตรวจ hash ก่อน · เก็บผลรายแผ่น + ภาพสีเต็ม
import json, os, sys, time, glob, hashlib, importlib.util, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); DS = os.path.join(HERE, '..', 'dataset')
LOCK = {'phase1_v2_locked.py': None, 'phase1_v1.py': '0d5e19e8f7b8132824c4b4c9adf5252e014f99fdc0115aad895e9546fd537bc0',
        'bars_ref.json': 'f5a6b240d67bb002a913fe7d6affa8a6138523738c952c874b0643a33ba2fc6f'}
LOCK['phase1_v2_locked.py'] = [l.split('|')[2].strip() for l in open(os.path.join(HERE, 'LOCK_v2.md'), encoding='utf-8') if l.startswith('| phase1_v2_locked.py')][0]
for f, h in LOCK.items():
    assert hashlib.sha256(open(os.path.join(HERE, f), 'rb').read()).hexdigest() == h, f'{f} ถูกแก้หลังล็อก'
spec = importlib.util.spec_from_file_location('p2', os.path.join(HERE, 'phase1_v2_locked.py')); p2 = importlib.util.module_from_spec(spec); spec.loader.exec_module(p2)
REF = json.load(open(os.path.join(HERE, 'bars_ref.json')))
OUT = os.path.join(HERE, 'newtest_v2'); os.makedirs(os.path.join(OUT, 'scan'), exist_ok=True); os.makedirs(os.path.join(OUT, 'thumb'), exist_ok=True)
files = sorted(p for p in glob.glob(os.path.join(DS, 'jpg_new', '*', '*.jpg')) if '(1)' not in p)
resf = os.path.join(OUT, 'results.jsonl'); done = set()
if os.path.exists(resf): done = {json.loads(l)['file'] for l in open(resf, encoding='utf-8')}
LIMIT = float(sys.argv[1]); t0 = time.time(); n = 0
with open(resf, 'a', encoding='utf-8') as fo:
    for p in files:
        rel = os.path.relpath(p, DS).replace('\\', '/')
        if rel in done: continue
        if time.time() - t0 > LIMIT: break
        im = cv2.imread(p); t1 = time.time()
        try: r, g, c = p2.run_v2(im, REF)
        except Exception as e: r, g, c = {'fail': 'exc:' + repr(e)[:80]}, None, None
        r.update(file=rel, folder=rel.split('/')[1], ms=round((time.time() - t1) * 1000), w=im.shape[1], h=im.shape[0])
        if c is not None:
            name = r['folder'] + '__' + os.path.basename(p)
            cv2.imencode('.jpg', c, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tofile(os.path.join(OUT, 'scan', name))
            cv2.imencode('.jpg', cv2.resize(c, (310, 438)))[1].tofile(os.path.join(OUT, 'thumb', name))
        fo.write(json.dumps(r, ensure_ascii=False) + '\n'); n += 1
print('new', n, 'total', len(done) + n, 'of', len(files))
