# 2B v2: โครงสร้าง CNN + ตัดภาพบริบท (ช่อง + ซ้าย/ขวา 10% + บน/ล่าง 75%) → 56×96
import numpy as np, cv2, torch, torch.nn as nn, torch.nn.functional as Fn
W, H = 56, 96
class Net(nn.Module):
    def __init__(s):
        super().__init__()
        def blk(a, b): return nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(), nn.Conv2d(b, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(), nn.MaxPool2d(2))
        s.f = nn.Sequential(blk(1, 24), blk(24, 48), blk(48, 96), blk(96, 96)); s.h = nn.Sequential(nn.Dropout(0.3), nn.Linear(96, 3))
    def forward(s, x): return s.h(s.f(x).mean((2, 3)))
def ctx(g, c):
    x0, y0, x1, y1 = c; w, h = x1 - x0, y1 - y0
    a, b = int(x0 - 0.1 * w), int(x1 + 0.1 * w); cc, d = int(y0 - 0.75 * h), int(y1 + 0.75 * h)
    cr = np.full((d - cc, b - a), 255, np.uint8); sa, sb, sc, sd = max(a, 0), min(b, g.shape[1]), max(cc, 0), min(d, g.shape[0])
    cr[sc - cc:sd - cc, sa - a:sb - a] = g[sc:sd, sa:sb]; return cv2.resize(cr, (W, H), interpolation=cv2.INTER_AREA)
def load(p):
    net = Net(); net.load_state_dict(torch.load(p, map_location='cpu')); net.eval(); return net
def classify(net, col_bgr, rows):
    g = cv2.cvtColor(col_bgr, cv2.COLOR_BGR2GRAY); A = [ctx(g, c) for r in rows for c in r['cells']]
    with torch.no_grad(): P = Fn.softmax(net(torch.from_numpy((255 - np.asarray(A, np.float32)) / 255.)[:, None]), 1).numpy()
    out, k = [], 0
    for r in rows: out.append([int(v) for v in P[k:k + len(r['cells'])].argmax(1)]); k += len(r['cells'])
    return out, P
