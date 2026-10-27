# Phase 2A · รันบนชุด dev หรือ test · test ต้องใช้ไฟล์ที่ล็อก (ตรวจ hash) · resume ได้
# python run_p2a.py <dev|test> <limit_s>
# วัด 2 แบบ: (ก) เทียบตารางที่พิมพ์จริง (ตำแหน่งคงที่ · รวมความคลาดของ Phase 1)
#            (ข) เทียบ GT รายแผ่น (ฟิตแม่แบบเข้ากับเส้นในแผ่นนั้น · p2a_gt_sheet.py) → แถวที่ไม่ตรงกัน (IoU < 0.9) ถูกตั้งธงให้ตรวจด้วยตา
import csv, json, os, sys, time, hashlib, importlib.util, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..'); sys.path.insert(0, HERE)
SPLIT, LIMIT = sys.argv[1], float(sys.argv[2])
modfile = 'phase2a.py'
if SPLIT == 'test':
    modfile = 'phase2a_locked.py'
    h = [l.split('|')[2].strip() for l in open(os.path.join(HERE, 'LOCK_2A.md'), encoding='utf-8') if l.startswith('| phase2a_locked.py')][0]
    assert hashlib.sha256(open(os.path.join(HERE, modfile), 'rb').read()).hexdigest() == h, 'phase2a ถูกแก้หลังล็อก'
spec = importlib.util.spec_from_file_location('A', os.path.join(HERE, modfile)); A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)
import p2a_gt_sheet as S
GP = json.load(open(os.path.join(HERE, 'p2a_gt_printed.json')))
rows = [r for r in csv.DictReader(open(os.path.join(ROOT, 'dataset', 'splits_v2.csv'), encoding='utf-8')) if r['p2a'] == SPLIT]
OUT = os.path.join(HERE, 'p2a_' + SPLIT); os.makedirs(OUT, exist_ok=True); resf = os.path.join(OUT, 'results.jsonl'); done = set()
if os.path.exists(resf): done = {json.loads(l)['file'] for l in open(resf, encoding='utf-8')}
t0 = time.time(); n = 0
with open(resf, 'a', encoding='utf-8') as fo:
    for r in rows:
        if r['file'] in done: continue
        if time.time() - t0 > LIMIT: break
        sp = os.path.join(ROOT, 'scans_v3', r['folder'], os.path.basename(r['file']))
        im = cv2.imdecode(np.fromfile(sp, np.uint8), 1); t1 = time.time()
        det = A.detect(im); ms = round((time.time() - t1) * 1000); blank = 'เปล่า' in r['folder']
        R = A.evaluate(det, GP, im, blank=blank); R.pop('crop_dark', None)
        GS = S.gt_sheet(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), GP); Rs = A.evaluate(det, GS)
        for k in ('f1_0.6', 'f1_0.7', 'f1_0.8', 'f1_0.9', 'wavg_f1'): R['sheet_' + k] = Rs[k]
        flag = []
        for i, gr in enumerate(GS):
            j = min(range(len(det)), key=lambda j: abs(det[j]['top'][0] - gr['top'][0])) if det else None
            if j is None or len(det[j]['cells']) != 20 or min(A.iou(c, g) for c, g in zip(det[j]['cells'], gr['cells'])) < 0.9: flag.append(i)
        R.update(flag_rows=flag, det=[dict(top=d['top'], bot=d['bot'], cells=d['cells']) for d in det], gts=GS)
        R.update(file=r['file'], folder=r['folder'], blank=blank, ms=ms)
        fo.write(json.dumps(R, ensure_ascii=False) + '\n'); n += 1
print('new', n, 'total', len(done) + n, 'of', len(rows))
