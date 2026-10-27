# ดึงตัวอักษรจาก Train 30 แผ่น (หน้าสแกน + แถวจาก run_p12) → npz
import json, sys, os, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); import p3lib as L
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); SET = sys.argv[1]; assert SET in ('train', 'val'); GEO = len(sys.argv) > 2 and sys.argv[2] == 'geo'
D = f'{R}/phase3/data/{SET}'; log = json.load(open(f'{D}/p12.json'))
X, Y, SH, RI, K, BOX, OK = [], [], [], [], [], [], []
stat = {}
for rec in log:
    c = cv2.imread(f'{D}/scan/{rec["file"][:-5]}.jpg')
    rows = [dict(top=r['top'], bot=r['bot'], vlines=r['vlines'], cells=[]) for r in rec['rows']]
    for cl in rec['cells']: rows[cl['row']]['cells'].append(cl['box'])
    per, t = L.letters(c, rows, force_geo=GEO)
    for ri, items in enumerate(per):
        exp = L.expected(ri); ok = len(items) == len(exp)
        stat.setdefault(L.side(ri), [0, 0]); stat[L.side(ri)][0] += ok; stat[L.side(ri)][1] += 1
        for k, (im, b) in enumerate(items):
            X.append(im); Y.append(ord(exp[k]) - 65 if ok else -1); SH.append(rec['file']); RI.append(ri); K.append(k); BOX.append(b); OK.append(ok)
    print(rec['file'], 't', t, [len(i) for i in per], flush=True)
np.savez_compressed(f'{D}/letters_geo.npz' if GEO else f'{D}/letters.npz', X=np.stack(X), Y=np.array(Y), SH=np.array(SH), RI=np.array(RI), K=np.array(K), BOX=np.array(BOX), OK=np.array(OK))
print('rows with exactly 13:', {k: f'{a}/{b}' for k, (a, b) in stat.items()}, 'letters', len(X))
