# v2 · รันบน Dev 50 + ชุด Test เดิม 361 (ตอนนี้เป็น Dev ของ v2) · resume ได้
import csv, json, os, sys, time, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import phase1_v2 as p2
BASE = os.path.join(HERE, '..', 'dataset'); REF = json.load(open(os.path.join(HERE, 'bars_ref.json')))
OUT = os.path.join(HERE, 'v2dev'); os.makedirs(os.path.join(OUT, 'thumb'), exist_ok=True)
resf = os.path.join(OUT, 'results.jsonl'); done = set()
if os.path.exists(resf): done = {json.loads(l)['file'] for l in open(resf, encoding='utf-8')}
rows = list(csv.DictReader(open(os.path.join(BASE, 'splits.csv'), encoding='utf-8')))
LIMIT = float(sys.argv[1]) if len(sys.argv) > 1 else 160; t0 = time.time(); n = 0
def uniform(img):
    """ความสม่ำเสมอของพื้นกระดาษ: แบ่ง 8×11 ช่อง เอาค่ากลางของจุดพื้นกระดาษในแต่ละช่อง → ช่วง (max-min) ของความสว่าง"""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)[200:3300, 300:2180]; h, w = g.shape; v = []
    for i in range(11):
        for j in range(8):
            c = g[i * h // 11:(i + 1) * h // 11, j * w // 8:(j + 1) * w // 8]; v.append(np.percentile(c, 80))
    return float(max(v) - min(v))
with open(resf, 'a', encoding='utf-8') as fo:
    for row in rows:
        if row['file'] in done: continue
        if time.time() - t0 > LIMIT: break
        im = cv2.imread(os.path.join(BASE, row['file'])); t1 = time.time()
        try: r, g, c = p2.run_v2(im, REF)
        except Exception as e: r, g, c = {'fail': 'exc:' + repr(e)[:80]}, None, None
        r.update(file=row['file'], folder=row['folder'], split=row['phase1_2A'], ms=round((time.time() - t1) * 1000))
        if c is not None:
            raw = cv2.warpPerspective(im, np.array(r['H_total']), (2480, 3508), borderValue=(255, 255, 255))
            r['uni_raw'], r['uni_v2'] = uniform(raw), uniform(c)
            cv2.imencode('.jpg', cv2.resize(c, (310, 438)))[1].tofile(os.path.join(OUT, 'thumb', row['folder'] + '__' + os.path.basename(row['file'])))
        fo.write(json.dumps(r, ensure_ascii=False) + '\n'); n += 1
print('new', n, 'total', len(done) + n, 'of', len(rows))
