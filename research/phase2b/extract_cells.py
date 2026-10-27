# ตัดช่องจากหน้าสแกน Phase 1 v3 ด้วย Phase 2A ที่ล็อกแล้ว → crop 64×64 (เทา) + ข้อมูลประกอบ
# เก็บทุกช่องของแผ่นลายมือ (รวมช่องว่าง) · ink = สัดส่วนพิกเซลเข้ม (< 150) ใน crop
import csv, os, sys, json, hashlib, importlib.util, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..'); P2 = os.path.join(ROOT, 'phase2')
h = [l.split('|')[2].strip() for l in open(os.path.join(P2, 'LOCK_2A.md'), encoding='utf-8') if l.startswith('| phase2a_locked.py')][0]
assert hashlib.sha256(open(os.path.join(P2, 'phase2a_locked.py'), 'rb').read()).hexdigest() == h
spec = importlib.util.spec_from_file_location('A', os.path.join(P2, 'phase2a_locked.py')); A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)
S = 64
def sq(cr):
    h, w = cr.shape; m = max(h, w); out = np.full((m, m), 255, np.uint8); out[(m - h) // 2:(m - h) // 2 + h, (m - w) // 2:(m - w) // 2 + w] = cr
    return cv2.resize(out, (S, S), interpolation=cv2.INTER_AREA)
rows = [r for r in csv.DictReader(open(os.path.join(ROOT, 'dataset', 'splits_v2.csv'), encoding='utf-8')) if r['p23'] not in ('', '-')]
X, M = [], []
for r in rows:
    im = cv2.imdecode(np.fromfile(os.path.join(ROOT, 'scans_v3', r['folder'], os.path.basename(r['file'])), np.uint8), 1)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    for i, row in enumerate(A.detect(im)):
        for k, c in enumerate(row['cells']):
            cr = g[c[1] + A.INSET:c[3] - A.INSET + 1, c[0] + A.INSET:c[2] - A.INSET + 1]
            X.append(sq(cr)); M.append(dict(file=os.path.basename(r['file']), folder=r['folder'], split=r['p23'], row=i, col=k, box=c, ink=round(float((cr < 150).mean()), 5)))
np.savez_compressed(os.path.join(HERE, 'cells.npz'), X=np.stack(X))
json.dump(M, open(os.path.join(HERE, 'cells_meta.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(X), sum(m['ink'] >= 0.005 for m in M))
