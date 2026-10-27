# รันการทดลอง Phase 1 บนชุด Dev เท่านั้น (ห้ามรันบน Test จนกว่าจะล็อก v1) · resume ได้
# python run_exp.py <dataset_dir> <out_dir> <limit_s> <EXP> <fn: run_v02|run_v03>
import csv, json, os, sys, time, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import phase1 as p
BASE, OUT, LIMIT, EXP, FN = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5]
REF = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bars_ref.json')))
os.makedirs(os.path.join(OUT, 'thumb'), exist_ok=True)
resf = os.path.join(OUT, 'results.jsonl'); done = set()
if os.path.exists(resf): done = {json.loads(l)['file'] for l in open(resf, encoding='utf-8')}
rows = [r for r in csv.DictReader(open(os.path.join(BASE, 'splits.csv'), encoding='utf-8')) if r['phase1_2A'] == 'dev']
assert all(r['phase1_2A'] == 'dev' for r in rows)
t0 = time.time(); n = 0
with open(resf, 'a', encoding='utf-8') as fo:
    for row in rows:
        f = os.path.basename(row['file'])
        if f in done: continue
        if time.time() - t0 > LIMIT: break
        im = cv2.imread(os.path.join(BASE, row['file'])); t1 = time.time()
        r, cl = getattr(p, FN)(im, REF); r['ms'] = round((time.time() - t1) * 1000); r['file'] = f; r['exp'] = EXP
        if cl is not None: cv2.imwrite(os.path.join(OUT, 'thumb', f), cv2.resize(cl, (310, 438)))
        fo.write(json.dumps(r, ensure_ascii=False) + '\n'); n += 1
print('new', n, 'total', len(done) + n, 'of', len(rows))
