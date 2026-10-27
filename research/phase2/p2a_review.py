# ภาพตรวจด้วยตา: แถวที่ตั้งธง (detector ≠ GT รายแผ่น) · เขียว = detector · แดง = GT รายแผ่น
import json, os, sys, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..'); SPLIT = sys.argv[1]
OUT = os.path.join(HERE, 'p2a_' + SPLIT, 'review'); os.makedirs(OUT, exist_ok=True)
for l in open(os.path.join(HERE, 'p2a_' + SPLIT, 'results.jsonl'), encoding='utf-8'):
    R = json.loads(l)
    if not R['flag_rows']: continue
    im = cv2.imdecode(np.fromfile(os.path.join(ROOT, 'scans_v3', R['folder'], os.path.basename(R['file'])), np.uint8), 1)
    for r in R['gts']:
        for c in r['cells']: cv2.rectangle(im, (c[0], c[1]), (c[2], c[3]), (0, 0, 255), 2)
    for r in R['det']:
        for c in r['cells']: cv2.rectangle(im, (c[0], c[1]), (c[2], c[3]), (0, 170, 0), 2)
    parts = []
    for i in R['flag_rows']:
        y = R['gts'][i]['top'][0]; p = im[max(0, y - 30):y + 120, 200:2300].copy()
        cv2.putText(p, f'row {i}', (5, 25), 0, 0.8, (255, 0, 0), 2); parts.append(p)
    cv2.imencode('.jpg', cv2.resize(np.vstack(parts), None, fx=0.5, fy=0.5))[1].tofile(os.path.join(OUT, os.path.basename(R['file'])))
print(os.listdir(OUT))
