# รัน Phase 1 v0 บนชุด Dev เท่านั้น (ห้ามรันบน Test จนกว่าจะล็อก v1)
import csv, json, os, sys, time, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); import phase1 as p
BASE = sys.argv[1]; OUT = sys.argv[2]; LIMIT = float(sys.argv[3]); EXP = sys.argv[4] if len(sys.argv) > 4 else 'P1-E00'
REF = json.load(open(os.path.join(os.path.dirname(__file__), 'bars_ref.json')))
os.makedirs(os.path.join(OUT, 'thumb'), exist_ok=True)
resf = os.path.join(OUT, 'results.jsonl'); done = set()
if os.path.exists(resf): done = {json.loads(l)['file'] for l in open(resf, encoding='utf-8')}
rows = [r for r in csv.DictReader(open(os.path.join(BASE, 'splits.csv'), encoding='utf-8')) if r['phase1_2A'] == 'dev']
t0 = time.time(); n = 0
with open(resf, 'a', encoding='utf-8') as fo:
    for row in rows:
        if row['file'] in done: continue
        if time.time() - t0 > LIMIT: break
        im = cv2.imread(os.path.join(BASE, row['file'])); t1 = time.time()
        r, cl = p.run_one(im); r['ms'] = round((time.time() - t1) * 1000); r['file'] = row['file']; r['exp'] = EXP
        if cl is not None:
            b = p.find_bars(cl); r['n_bars'] = [int(len(b['L'])), int(len(b['R']))]
            if len(b['L']) == 20 and len(b['R']) == 20:
                e = np.linalg.norm(np.vstack([b['L'], b['R']]) - np.vstack([REF['L'], REF['R']]), axis=1)
                r['bar_mean'], r['bar_max'] = float(e.mean()), float(e.max())
            th = cv2.resize(cl, (310, 438)); cv2.imwrite(os.path.join(OUT, 'thumb', os.path.basename(row['file'])), th)
        fo.write(json.dumps(r, ensure_ascii=False) + '\n'); n += 1
print('new', n, 'total', len(done) + n, 'of', len(rows))
