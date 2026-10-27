# v3 · รันทุกภาพที่เคยเห็นแล้ว (Dev 50 + Test เดิม 361 + ชุดใหม่ 118) · resume ได้
import csv, json, os, sys, time, glob, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import phase1_v3 as p3
DS = os.path.join(HERE, '..', 'dataset'); REF = json.load(open(os.path.join(HERE, 'bars_ref.json')))
OUT = os.path.join(HERE, sys.argv[2] if len(sys.argv) > 2 else 'v3dev'); os.makedirs(os.path.join(OUT, 'thumb'), exist_ok=True)
items = [(r['file'], r['folder'], r['phase1_2A']) for r in csv.DictReader(open(os.path.join(DS, 'splits.csv'), encoding='utf-8'))]
items += [(os.path.relpath(p, DS).replace('\\', '/'), p.replace('\\', '/').split('/')[-2], 'new') for p in sorted(glob.glob(os.path.join(DS, 'jpg_new', '*', '*.jpg'))) if '(1)' not in p]
resf = os.path.join(OUT, 'results.jsonl'); done = set()
if os.path.exists(resf): done = {json.loads(l)['file'] for l in open(resf, encoding='utf-8')}
LIMIT = float(sys.argv[1]); t0 = time.time(); n = 0
with open(resf, 'a', encoding='utf-8') as fo:
    for rel, folder, split in items:
        if rel in done: continue
        if time.time() - t0 > LIMIT: break
        im = cv2.imread(os.path.join(DS, rel)); t1 = time.time()
        try: r, g, c = p3.run_v3(im, REF)
        except Exception as e: r, g, c = {'fail': 'exc:' + repr(e)[:80]}, None, None
        r.update(file=rel, folder=folder, split=split, ms=round((time.time() - t1) * 1000))
        if c is not None: cv2.imencode('.jpg', cv2.resize(c, (310, 438)))[1].tofile(os.path.join(OUT, 'thumb', folder + '__' + os.path.basename(rel)))
        fo.write(json.dumps(r, ensure_ascii=False) + '\n'); n += 1
print('new', n, 'total', len(done) + n, 'of', len(items))
