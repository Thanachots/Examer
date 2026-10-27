# Phase 2B: CNN 3 คลาส (0 ว่าง · 1 ตัวอักษร · 2 ขีดฆ่า) บน crop 64×64 จาก Phase 2A ที่ล็อก
# ข้อมูลเทรน: ช่องจริงจากแผ่น train (Horizontal/Words = ตัวอักษร/ว่าง · Edge = ว่าง + ป้ายเทียมรอบ 2)
#            + ขีดฆ่าสังเคราะห์: วาดเส้นเกือบแนวนอน 1–3 เส้นทับตัวอักษรจริง (แนวคิดเดียวกับ Heil et al. 2021 ที่สังเคราะห์ strikethrough)
# เลือก epoch ด้วยชุด val (ตรวจด้วยตา) · ไม่แตะชุด test
import numpy as np, json, sys, time, torch, torch.nn as nn, torch.nn.functional as Fn
torch.set_num_threads(2); rng = np.random.default_rng(0); torch.manual_seed(0)
D = np.load('/mnt/user-data/uploads/EXAMER/phase2b/cells.npz')['X']; M = json.load(open('/mnt/user-data/uploads/EXAMER/phase2b/cells_meta.json')); Y = np.load('Y.npy')
PSEUDO = sys.argv[1] if len(sys.argv) > 1 else None; OUT = sys.argv[2] if len(sys.argv) > 2 else 'm2b.pt'; EP = int(sys.argv[3]) if len(sys.argv) > 3 else 12
tr = [i for i, m in enumerate(M) if m['split'] == 'train' and Y[i] >= 0]
if PSEUDO:
    P = json.load(open(PSEUDO)); Y = Y.copy()
    for i, y in P.items(): Y[int(i)] = y
    tr = sorted(set(tr) | {int(i) for i in P})
emp = [i for i in tr if Y[i] == 0]; keep = set(rng.choice(emp, min(6000, len(emp)), replace=False).tolist())
tr = [i for i in tr if Y[i] != 0 or i in keep]          # ช่องว่างง่ายมาก · สุ่มเก็บ 6000
va = [i for i, m in enumerate(M) if m['split'] == 'val' and Y[i] >= 0]
chars = [i for i in tr if Y[i] == 1 and M[i]['folder'].startswith(('Horizontal', 'Words'))]
def synth_strike(x):
    x = x.astype(np.float32).copy(); ys, xs = np.where(x < 150)
    if len(ys) < 20: return None
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    n = rng.choice([1, 2, 3], p=[0.45, 0.45, 0.10]); cy = y0 + (y1 - y0) * rng.uniform(0.3, 0.7); gap = rng.uniform(4, 9)
    ink = float(np.percentile(x[x < 150], 30)); th = int(rng.integers(2, 5))
    for k in range(n):
        yy = cy + (k - (n - 1) / 2) * gap; sl = np.tan(np.deg2rad(rng.uniform(-10, 10)))
        a = x0 - rng.uniform(2, 12); b = x1 + rng.uniform(2, 12)
        p1 = (int(a), int(yy - sl * (32 - a))); p2 = (int(b), int(yy + sl * (b - 32)))
        import cv2; cv2.line(x, p1, p2, ink + rng.uniform(-15, 15), th, cv2.LINE_AA)
    return np.clip(x, 0, 255)
class Net(nn.Module):
    def __init__(s):
        super().__init__()
        def blk(a, b): return nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(), nn.Conv2d(b, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(), nn.MaxPool2d(2))
        s.f = nn.Sequential(blk(1, 24), blk(24, 48), blk(48, 96), blk(96, 96)); s.h = nn.Sequential(nn.Dropout(0.3), nn.Linear(96, 3))
    def forward(s, x): return s.h(s.f(x).mean((2, 3)))
def prep(X): return torch.from_numpy((255 - np.asarray(X, np.float32)) / 255.)[:, None]
def aug(x):
    import cv2
    a = rng.uniform(-6, 6); sc = rng.uniform(0.9, 1.1); tx, ty = rng.uniform(-4, 4, 2)
    Mt = cv2.getRotationMatrix2D((32, 32), a, sc); Mt[:, 2] += (tx, ty)
    x = cv2.warpAffine(x.astype(np.float32), Mt, (64, 64), borderValue=float(np.median(x)))
    return np.clip(x * rng.uniform(0.85, 1.1) + rng.uniform(-10, 10), 0, 255)
def batch_gen(bs=128):
    idx = rng.permutation(tr); n_syn = len(idx) // 12
    syn = rng.choice(chars, n_syn)
    items = [(i, None) for i in idx] + [(i, 'S') for i in syn]; items = [items[j] for j in rng.permutation(len(items))]
    for s in range(0, len(items), bs):
        X, T = [], []
        for i, t in items[s:s + bs]:
            if t == 'S':
                x = synth_strike(D[i]);
                if x is None: continue
                X.append(aug(x)); T.append(2)
            else: X.append(aug(D[i])); T.append(int(Y[i]))
        yield prep(X), torch.tensor(T)
def predict(net, ids, bs=512):
    net.eval(); out = []
    with torch.no_grad():
        for s in range(0, len(ids), bs): out.append(Fn.softmax(net(prep(D[ids[s:s + bs]])), 1).numpy())
    return np.vstack(out)
def macro(yt, yp):
    f = []
    for c in range(3):
        tp = ((yp == c) & (yt == c)).sum(); fp = ((yp == c) & (yt != c)).sum(); fn = ((yp != c) & (yt == c)).sum()
        f.append(2 * tp / (2 * tp + fp + fn) if tp else 0.)
    return f
if __name__ == '__main__':
    net = Net(); opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    steps = EP * (len(tr) * 7 // 6 // 128 + 1); sch = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps)
    w = torch.tensor([1., 1., 2.]); best = (-1, None); t0 = time.time(); yv = Y[va]
    for ep in range(EP):
        net.train(); L = 0; n = 0
        for xb, yb in batch_gen():
            loss = Fn.cross_entropy(net(xb), yb, weight=w); opt.zero_grad(); loss.backward(); opt.step(); sch.step(); L += loss.item(); n += 1
        pv = predict(net, va).argmax(1); f = macro(yv, pv); acc = (pv == yv).mean()
        print(f'ep {ep} loss {L/n:.4f} val acc {acc:.4f} F1 empty/char/strike {f[0]:.4f}/{f[1]:.4f}/{f[2]:.4f} macro {np.mean(f):.4f} {time.time()-t0:.0f}s', flush=True)
        if np.mean(f) > best[0]: best = (np.mean(f), ep); torch.save(net.state_dict(), OUT)
    print('best', best)
