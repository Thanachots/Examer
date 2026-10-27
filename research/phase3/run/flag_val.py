# ตัวที่ไม่มั่นใจ → ส่งครูตรวจ: รายงาน CAR ของตัวที่ระบบตอบเอง และสัดส่วนที่ต้องตรวจ ที่เกณฑ์ความมั่นใจต่างๆ (val)
import sys, os, json, numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import p3train as P
t = np.load(f'{P.R}/phase3/data/val/letters.npz'); net = P.Net(); net.load_state_dict(torch.load(sys.argv[1], map_location='cpu'))
T = json.load(open(f'{P.R}/phase3/data/val/truth_override.json')); T.pop('_note')
p, conf = P.predb(net, t['X']); rows = {}
for i in range(len(p)): rows.setdefault((str(t['SH'][i]), int(t['RI'][i])), []).append(i)
pairs = []   # (ความมั่นใจ, ถูกไหม) สำหรับแถวที่จำนวนตัวตรงป้าย
for (sh, ri), ii in rows.items():
    ii.sort(key=lambda i: t['K'][i]); e = T.get(f'{sh}|{ri}', P.L.expected(ri))
    if len(ii) != len(e): pairs += [(0.0, False)] * len(ii); continue      # แยกผิด → ไม่มั่นใจเสมอ
    pairs += [(float(conf[i]), chr(65 + p[i]) == e[k]) for k, i in enumerate(ii)]
c = np.array([a for a, _ in pairs]); ok = np.array([b for _, b in pairs])
for tau in (0, 0.5, 0.7, 0.8, 0.9, 0.95):
    a = c >= tau; print(f'tau {tau}: auto {a.mean():.3f} · acc(auto) {ok[a].mean():.4f} · flagged {(~a).sum()} · wrong-but-auto {(a & ~ok).sum()}')
