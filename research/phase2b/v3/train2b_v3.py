# Phase 2B v2: CNN 3 คลาสบน crop บริบท 56×96 (ช่อง + บน/ล่าง 75%) · เทรนในช่อง + ทับเส้น · เลือก epoch ตาม P2B_V2_PROTOCOL.md
import numpy as np, json, sys, time, cv2, torch, torch.nn as nn, torch.nn.functional as Fn
torch.set_num_threads(2); rng = np.random.default_rng(0); torch.manual_seed(0)
W, H = 56, 96; Y0_IN = (int(0.75 / 2.5 * H), int(1.75 / 2.5 * H))          # แถบช่องจริงในภาพ (แนวตั้ง)
d = np.load('ctx_all.npz'); X, Y, Y0, OX, OY = d['X'], d['Y'], d['Y0'], d['OX'], d['OY']
M = json.load(open('/mnt/user-data/uploads/EXAMER/phase2b/cells_meta.json')); OM = json.load(open('over_meta.json'))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'm2b_v2.pt'; EP = int(sys.argv[2]) if len(sys.argv) > 2 else 8
tr = [i for i, m in enumerate(M) if m['split'] == 'train' and Y[i] >= 0]
emp = [i for i in tr if Y[i] == 0]; keep = set(rng.choice(emp, min(6000, len(emp)), replace=False).tolist()); tr = [i for i in tr if Y[i] != 0 or i in keep]
va = [i for i, m in enumerate(M) if m['split'] == 'val' and Y0[i] >= 0]
otr = [j for j, m in enumerate(OM) if m['split'] == 'train']; oemp = [j for j in otr if OY[j] == 0]
okeep = set(rng.choice(oemp, min(1500, len(oemp)), replace=False).tolist()); otr = [j for j in otr if OY[j] == 1 or j in okeep]
ova = [j for j, m in enumerate(OM) if m['split'] == 'val']
chars_in = [i for i in tr if Y[i] == 1 and M[i]['folder'].startswith(('Horizontal', 'Words'))]
chars_ov = [j for j in otr if OY[j] == 1]
KH = cv2.getStructuringElement(cv2.MORPH_RECT, (28, 1)); KV = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 30))
def letter_ink(x, band):
    b = (x < 150).astype(np.uint8); ln = cv2.morphologyEx(b, cv2.MORPH_OPEN, KH) | cv2.morphologyEx(b, cv2.MORPH_OPEN, KV)
    b = b & (1 - ln); b[:, :band[0]] = 0; b[:, band[1]:] = 0; return b
def draw_strike(x, ys, xs):
    x = x.astype(np.float32).copy(); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    n = rng.choice([1, 2, 3], p=[0.35, 0.5, 0.15]); cy = y0 + (y1 - y0) * rng.uniform(0.3, 0.7); gap = rng.uniform(4, 8)
    vals = x[ys, xs]; vals = vals[vals < 170]; ink = float(np.percentile(vals, 30)) if len(vals) else 60.; th = int(rng.integers(1, 4))
    for k in range(n):
        yy = cy + (k - (n - 1) / 2) * gap; sl = np.tan(np.deg2rad(rng.uniform(-8, 8)))
        a = x0 - rng.uniform(2, 8); b = x1 + rng.uniform(2, 8)
        cv2.line(x, (int(a), int(yy - sl * (W / 2 - a))), (int(b), int(yy + sl * (b - W / 2))), ink + rng.uniform(-15, 15), th, cv2.LINE_AA)
    return np.clip(x, 0, 255)
def synth(x, over):
    if over: b = letter_ink(x, (10, 46))
    else: b = letter_ink(x, (6, 50)); b[:Y0_IN[0]] = 0; b[Y0_IN[1]:] = 0
    b = cv2.dilate(b, np.ones((5, 3), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(b, 8)
    cand = [k for k in range(1, n) if st[k, 4] >= 40 and 0.22 * H < cen[k][1] < 0.78 * H]
    if not cand: return None
    k = min(cand, key=lambda k: abs(cen[k][0] - W / 2) + 0.5 * abs(cen[k][1] - H / 2) - 0.02 * st[k, 4])
    ys, xs = np.where(lab == k)
    if ys.max() - ys.min() < 12: return None
    return draw_strike(x, ys, xs)
class Net(nn.Module):
    def __init__(s):
        super().__init__()
        def blk(a, b): return nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(), nn.Conv2d(b, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(), nn.MaxPool2d(2))
        s.f = nn.Sequential(blk(1, 24), blk(24, 48), blk(48, 96), blk(96, 96)); s.h = nn.Sequential(nn.Dropout(0.3), nn.Linear(96, 3))
    def forward(s, x): return s.h(s.f(x).mean((2, 3)))
def prep(A): return torch.from_numpy((255 - np.asarray(A, np.float32)) / 255.)[:, None]
def aug(x):
    a = rng.uniform(-5, 5); sc = rng.uniform(0.92, 1.08); tx, ty = rng.uniform(-3, 3), rng.uniform(-4, 4)
    Mt = cv2.getRotationMatrix2D((W / 2, H / 2), a, sc); Mt[:, 2] += (tx, ty)
    x = cv2.warpAffine(x.astype(np.float32), Mt, (W, H), borderValue=float(np.median(x)))
    return np.clip(x * rng.uniform(0.85, 1.1) + rng.uniform(-10, 10), 0, 255)
def batch_gen(bs=128):
    items = [('i', i) for i in tr] + [('o', j) for j in otr] + [('si', i) for i in rng.choice(chars_in, len(tr) // 14)]
    items = [items[k] for k in rng.permutation(len(items))]
    for s in range(0, len(items), bs):
        A, T = [], []
        for t, i in items[s:s + bs]:
            if t == 'i': A.append(aug(X[i])); T.append(int(Y[i]))
            elif t == 'o': A.append(aug(OX[i])); T.append(int(OY[i]))
            else:
                x = synth(X[i] if t == 'si' else OX[i], t == 'so')
                if x is None: continue
                A.append(aug(x)); T.append(2)
        yield prep(A), torch.tensor(T)
def predict(net, A, bs=512):
    net.eval(); out = []
    with torch.no_grad():
        for s in range(0, len(A), bs): out.append(Fn.softmax(net(prep(A[s:s + bs])), 1).numpy())
    return np.vstack(out)
def f1s(yt, yp):
    f = []
    for c in range(3):
        tp = ((yp == c) & (yt == c)).sum(); fp = ((yp == c) & (yt != c)).sum(); fn = ((yp != c) & (yt == c)).sum(); f.append(2 * tp / (2 * tp + fp + fn) if tp else 0.)
    return f
if __name__ == '__main__':
    # ขีดฆ่าสังเคราะห์บนทับเส้น Val (คงที่ · ใช้ดูเฉย ๆ ไม่ใช้เลือก)
    rs = np.random.default_rng(7); ovs = []
    for j in [j for j in ova if OY[j] == 1][:600]:
        x = synth(OX[j], True)
        if x is not None: ovs.append(x)
    ovs = np.stack(ovs)
    net = Net(); opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    nb = (len(tr) + len(otr) + len(tr) // 14) // 128 + 1
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=EP * nb); w = torch.tensor([1., 1., 2.]); t0 = time.time(); yv = Y0[va]; LOG = []
    for ep in range(EP):
        net.train(); L = n = 0
        for xb, yb in batch_gen():
            loss = Fn.cross_entropy(net(xb), yb, weight=w); opt.zero_grad(); loss.backward(); opt.step(); sch.step(); L += loss.item(); n += 1
        pv = predict(net, X[va]).argmax(1); f = f1s(yv, pv); rec = ((pv == 2) & (yv == 2)).sum() / (yv == 2).sum()
        po = predict(net, OX[ova]).argmax(1); fs = int((po == 2).sum()); ps = predict(net, ovs).argmax(1); srec = float((ps == 2).mean())
        r = dict(ep=ep, loss=round(L / n, 4), in_acc=round(float((pv == yv).mean()), 5), in_f1=[round(float(v), 4) for v in f], in_macro=round(float(np.mean(f)), 5), in_strike_rec=round(float(rec), 4),
                 over_false_strike=fs, over_n=len(ova), over_synth_strike_rec=round(srec, 4), sec=round(time.time() - t0))
        print(json.dumps(r), flush=True); LOG.append(r); torch.save(net.state_dict(), f'{OUT[:-3]}_ep{ep}.pt')
    ok = [r for r in LOG if r['in_strike_rec'] >= 0.99]
    best = min(ok, key=lambda r: (r['over_false_strike'], -r['in_macro'])) if ok else None
    print('BEST', json.dumps(best)); json.dump(dict(log=LOG, best=best), open(f'{OUT[:-3]}_log.json', 'w'))
