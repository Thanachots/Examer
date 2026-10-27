import numpy as np, cv2, collections, sys
SET, OUT = sys.argv[1], sys.argv[2]; sel = sys.argv[3:]
t = np.load(f'phase3/data/{SET}/letters.npz'); D = f'phase3/data/{SET}/'
c0 = collections.Counter(zip(t['SH'], t['RI'])); bad = [k for k, v in sorted(c0.items()) if v != 13]
if sel: bad = [(f'IMG_{s.split(":")[0]}.HEIC', int(s.split(':')[1])) for s in sel]
out = []
for sh, ri in bad[:7]:
    c = cv2.imread(D + 'scan/' + sh[:-5] + '.jpg'); m = (t['SH'] == sh) & (t['RI'] == ri); B = t['BOX'][m]
    y0 = max(0, B[:, 1].min() - 25); y1 = B[:, 3].max() + 25; x0 = max(0, B[:, 0].min() - 15); x1 = B[:, 2].max() + 15
    o = c[y0:y1, x0:x1].copy()
    for b in B: cv2.rectangle(o, (b[0] - x0, b[1] - y0), (b[2] - x0, b[3] - y0), (0, 0, 255), 2)
    o = cv2.resize(o, (1400, int(o.shape[0] * 1400 / o.shape[1]))); cv2.putText(o, f'{sh[4:8]} r{ri+1} n={len(B)}', (5, 25), 0, 0.8, (0, 128, 0), 2); out.append(o)
cv2.imwrite(OUT, np.vstack(out))
