# สร้างภาพสแกน Phase 1 v3 (ล็อก) ครบทุกแผ่น → ../scans_v3/<โฟลเดอร์>/<ชื่อ>.jpg (สี) · resume ได้
import csv, json, os, sys, time, hashlib, importlib.util, cv2
HERE = os.path.dirname(os.path.abspath(__file__)); DS = os.path.join(HERE, '..', 'dataset'); OUT = os.path.join(HERE, '..', 'scans_v3')
H3 = [l.split('|')[2].strip() for l in open(os.path.join(HERE, 'LOCK_v3.md'), encoding='utf-8') if l.startswith('| phase1_v3_locked.py')][0]
assert hashlib.sha256(open(os.path.join(HERE, 'phase1_v3_locked.py'), 'rb').read()).hexdigest() == H3
spec = importlib.util.spec_from_file_location('p3', os.path.join(HERE, 'phase1_v3_locked.py')); p3 = importlib.util.module_from_spec(spec); spec.loader.exec_module(p3)
REF = json.load(open(os.path.join(HERE, 'bars_ref.json')))
rows = list(csv.DictReader(open(os.path.join(DS, 'splits_v2.csv'), encoding='utf-8')))
logf = os.path.join(OUT, 'scan_log.jsonl'); os.makedirs(OUT, exist_ok=True); done = set()
if os.path.exists(logf): done = {json.loads(l)['file'] for l in open(logf, encoding='utf-8')}
LIMIT = float(sys.argv[1]); t0 = time.time(); n = 0
with open(logf, 'a', encoding='utf-8') as fo:
    for r in rows:
        if r['file'] in done: continue
        if time.time() - t0 > LIMIT: break
        res, g, c = p3.run_v3(cv2.imread(os.path.join(DS, r['file'])), REF)
        dst = os.path.join(OUT, r['folder'], os.path.basename(r['file']))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if c is not None: cv2.imencode('.jpg', c, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tofile(dst)
        fo.write(json.dumps(dict(file=r['file'], scan=os.path.relpath(dst, OUT).replace('\\', '/') if c is not None else None, qc_max=res.get('qc_max'), path=res.get('path')), ensure_ascii=False) + '\n'); n += 1
print('new', n, 'total', len(done) + n, 'of', len(rows))
