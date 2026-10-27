# Phase 3 CNN 26 คลาส (A–Z) บนภาพหมึก 48×48 + เสริมข้อมูลจำลองเส้นทับ (จาก exp feas.py)
# ข้อมูลเทรน: Horizontal Train (splits_v2, feas_train.npz) + ตัวอักษรจากแผ่นทับเส้นชุด train (แถวที่แยกได้ 13 ตัวพอดี)
# ประเมินระหว่างพัฒนา: แบ่งตามกลุ่มคนเขียนภายใน train (A = IMG_80xx 2 คน · B = IMG_97xx 1 คน) — ไม่แตะ val/test
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F, cv2, sys, json, os, time
sys.path.insert(0, os.path.dirname(__file__)); import p3lib as L
torch.manual_seed(0); np.random.seed(0); torch.set_num_threads(2)
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
class Net(nn.Module):
    def __init__(s):
        super().__init__()
        def blk(i, o): return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.Conv2d(o, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.MaxPool2d(2))
        s.f = nn.Sequential(blk(1, 32), blk(32, 64), blk(64, 128)); s.h = nn.Sequential(nn.Flatten(), nn.Dropout(0.3), nn.Linear(128 * 6 * 6, 256), nn.ReLU(), nn.Dropout(0.3), nn.Linear(256, 26))
    def forward(s, x): return s.h(s.f(x))

def renorm(m):
    ys, xs = np.nonzero(m > 40)
    if len(ys) == 0: return m
    c = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; h, w = c.shape; s = max(h, w) + 4
    o = np.zeros((s, s), np.uint8); o[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = c
    return cv2.resize(o, (48, 48), interpolation=cv2.INTER_AREA)

def aug(x, line):
    x = x.copy()
    if line and np.random.rand() < 0.7:
        # จำลองเส้นกรอบทับตัวอักษร แล้วลบไม่สมบูรณ์: ลบแถบ (ตัวอักษรขาด) หรือเหลือเศษเส้น
        for _ in range(np.random.randint(1, 3)):
            vert = np.random.rand() < 0.5; p = np.random.randint(4, 44); t = np.random.randint(2, 6)
            if np.random.rand() < 0.65:
                if vert: x[:, p:p + t] = (x[:, p:p + t] * np.random.uniform(0, 0.3)).astype(np.uint8)
                else: x[p:p + t, :] = (x[p:p + t, :] * np.random.uniform(0, 0.3)).astype(np.uint8)
            else:
                a, b = sorted(np.random.randint(0, 48, 2))
                if vert: x[a:b, p:p + 2] = 255
                else: x[p:p + 2, a:b] = 255
        x = renorm(x)
    M = cv2.getRotationMatrix2D((24, 24), np.random.uniform(-10, 10), np.random.uniform(0.85, 1.1)); M[:, 2] += np.random.uniform(-3, 3, 2)
    x = cv2.warpAffine(x, M, (48, 48))
    k = np.random.randint(0, 3)
    if k == 1: x = cv2.dilate(x, np.ones((2, 2), np.uint8))
    elif k == 2: x = cv2.erode(x, np.ones((2, 2), np.uint8))
    return x

@torch.no_grad()
def pred(net, x):
    net.eval()
    if len(x) == 0: return np.zeros(0, int), np.zeros(0)
    p = F.softmax(net(torch.tensor(x, dtype=torch.float32)[:, None] / 255), 1).numpy(); return p.argmax(1), p.max(1)

def group(sh): return 'A' if sh.startswith('IMG_80') else 'B'
def load():
    h = np.load(f'{R}/phase3/exp_lines/feas_train.npz'); t = np.load(f'{R}/phase3/data/train/letters.npz')
    return h, t
def train_net(X, Y, ep, line=True, log=None):
    net = Net(); opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=ep * (len(X) // 128 + 1)); t0 = time.time()
    for e in range(ep):
        net.train(); idx = np.random.permutation(len(X)); Ls = []
        for i in range(0, len(idx), 128):
            b = idx[i:i + 128]; xb = np.stack([aug(X[j], line) for j in b])
            loss = F.cross_entropy(net(torch.tensor(xb, dtype=torch.float32)[:, None] / 255), torch.tensor(Y[b]))
            opt.zero_grad(); loss.backward(); opt.step(); sch.step(); Ls.append(loss.item())
        print(f'ep{e} loss {np.mean(Ls):.3f} {time.time()-t0:.0f}s', flush=True)
    return net
def predb(net, X, bs=512):
    P, C = [], []
    for i in range(0, len(X), bs): p, c = pred(net, X[i:i + bs]); P.append(p); C.append(c)
    return (np.concatenate(P), np.concatenate(C)) if P else (np.zeros(0, int), np.zeros(0))
def evaluate(net, t, mask, truth=None):
    """CAR (edit distance) / WAR (แถวถูกทั้งแถว) ต่อแถว จากทุก segment ที่ระบบแยกได้ (รวมแถวที่แยกผิด)"""
    SH, RI, X = t['SH'], t['RI'], t['X']; p, conf = predb(net, X[mask]); idx = np.nonzero(mask)[0]
    P = dict(zip(idx, p)); out = {'all': [0, 0, 0, 0]}; rows = {}
    for i in idx: rows.setdefault((SH[i], RI[i]), []).append(i)
    for (sh, ri), ii in rows.items():
        ii = sorted(ii, key=lambda i: t['K'][i]); s = ''.join(chr(65 + P[i]) for i in ii); e = (truth or {}).get(f'{sh}|{int(ri)}', L.expected(int(ri)))
        d = L.ed(s, e)
        for k in ('all', L.side(int(ri))):
            out.setdefault(k, [0, 0, 0, 0]); out[k][0] += d; out[k][1] += len(e); out[k][2] += (s == e); out[k][3] += 1
    return {k: dict(CAR=round(1 - a / b, 4), WAR=round(c / n, 4), chars=b, rows=n) for k, (a, b, c, n) in out.items()}
if __name__ == '__main__':
    mode = sys.argv[1]; ep = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    h, t = load(); g = np.array([group(s) for s in t['SH']]); lab = t['Y'] >= 0
    if mode in ('A', 'B'):   # เทรนบน Horizontal + กลุ่มอื่น · ทดสอบบนกลุ่มนี้
        tr = lab & (g != mode); X = np.concatenate([h['X'], t['X'][tr]]); Y = np.concatenate([h['Y'], t['Y'][tr]])
        net = train_net(X, Y, ep); res = evaluate(net, t, g == mode)
        print('DEV fold', mode, json.dumps(res, ensure_ascii=False)); json.dump(res, open(f'{R}/phase3/data/dev_fold_{mode}.json', 'w'))
    elif mode == 'zeroshot':
        net = Net(); net.load_state_dict(torch.load(sys.argv[3], map_location='cpu'))
        for gg in ('A', 'B'): print('zeroshot', gg, json.dumps(evaluate(net, t, g == gg), ensure_ascii=False))
    elif mode == 'all2':   # + ตัวอักษรจาก train ที่ประมวลผลแบบโหมดรูปทรง (จำลองปากกาเข้ม: ตัวที่เส้นทับถูกลบบางส่วน)
        tg = np.load(f'{R}/phase3/data/train/letters_geo.npz'); lg = tg['Y'] >= 0
        X = np.concatenate([h['X'], t['X'][lab], tg['X'][lg]]); Y = np.concatenate([h['Y'], t['Y'][lab], tg['Y'][lg]])
        net = train_net(X, Y, ep); torch.save(net.state_dict(), f'{R}/phase3/data/m3_all2.pt'); print('saved', len(X))
    elif mode == 'all':
        X = np.concatenate([h['X'], t['X'][lab]]); Y = np.concatenate([h['Y'], t['Y'][lab]])
        net = train_net(X, Y, ep); torch.save(net.state_dict(), f'{R}/phase3/data/m3_all.pt'); print('saved')
