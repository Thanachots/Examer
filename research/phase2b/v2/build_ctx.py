# รวม ctx crops: ในช่อง (จากเครื่อง) + ทับเส้น (cache) · ป้าย
import numpy as np, json, pickle, glob, os, cv2
M = json.load(open('/mnt/user-data/uploads/EXAMER/phase2b/cells_meta.json')); Y = np.load('Y.npy')
X = np.concatenate([np.load(f'/mnt/user-data/uploads/EXAMER/phase2b/ctx_v2/ctx96_{k}.npz')['X'] for k in range(6)]); assert len(X) == len(M)
P = json.load(open('pseudo_r0.json')); Yp = Y.copy()
for i, y in P.items(): Yp[int(i)] = y
W, H = 56, 96
def ctx(g, c):
    x0, y0, x1, y1 = c; w, h = x1 - x0, y1 - y0
    a, b = int(x0 - 0.1 * w), int(x1 + 0.1 * w); cc, d = int(y0 - 0.75 * h), int(y1 + 0.75 * h)
    cr = np.full((d - cc, b - a), 255, np.uint8); sa, sb, sc, sd = max(a, 0), min(b, g.shape[1]), max(cc, 0), min(d, g.shape[0])
    cr[sc - cc:sd - cc, sa - a:sb - a] = g[sc:sd, sa:sb]; return cv2.resize(cr, (W, H), interpolation=cv2.INTER_AREA)
VAL = {f'IMG_{x}' for x in range(9692, 9702)}; HOLD = {'IMG_5417', 'IMG_8029'}
OX, OY, OM = [], [], []
for f in sorted(glob.glob('../web/diag/cache/*.pkl')):
    n = os.path.basename(f).split('.')[0]
    if n in HOLD: continue
    d = pickle.load(open(f, 'rb')); g = cv2.cvtColor(d['col'], cv2.COLOR_BGR2GRAY); sp = 'val' if n in VAL else 'train'
    for ri, r in enumerate(d['rows']):
        for k, c in enumerate(r['cells']):
            c = [int(v) for v in c]; inner = g[c[1] + 4:c[3] - 3, c[0] + 4:c[2] - 3]
            OX.append(ctx(g, c)); OY.append(0 if (inner < 150).mean() < 0.004 else 1); OM.append(dict(file=n, split=sp, row=ri, col=k, kind='over'))
np.savez_compressed('ctx_all.npz', X=X, Y=Yp, Y0=Y, OX=np.stack(OX), OY=np.array(OY))
json.dump(OM, open('over_meta.json', 'w'))
print(X.shape, len(OX), np.bincount(OY))
