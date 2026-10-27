# ประเมินระบบรวมบนชุดที่ระบุ (val): คำตอบรายช่อง → ต่อเป็นสตริงรายแถว (ข้ามว่าง/ขีดฆ่า) เทียบตัวที่เขียนจริง
import sys, os, json, numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import p3train as P, system as S
SET, MODEL = sys.argv[1], sys.argv[2]
t = np.load(f'{P.R}/phase3/data/{SET}/letters.npz'); log = json.load(open(f'{P.R}/phase3/data/{SET}/p12.json'))
T = json.load(open(f'{P.R}/phase3/data/{SET}/truth_override.json')); T.pop('_note')
net = P.Net(); net.load_state_dict(torch.load(MODEL, map_location='cpu')); p, c = P.predb(net, t['X'])
tot = dict(chars=0, ed=0, auto=0, auto_ok=0, flag=0, rows=0, row_ok=0, strike=0)
for rec in log:
    sh = rec['file']; cells = [[] for _ in rec['rows']]; cls = [[] for _ in rec['rows']]
    for cl in rec['cells']: cells[cl['row']].append(cl['box']); cls[cl['row']].append(int(np.argmax(cl['p'])))
    L_, Pp, Cc = [], [], []
    for ri in range(len(rec['rows'])):
        ii = sorted(np.nonzero((t['SH'] == sh) & (t['RI'] == ri))[0], key=lambda i: t['K'][i])
        L_.append([t['BOX'][i] for i in ii]); Pp.append([chr(65 + p[i]) for i in ii]); Cc.append([float(c[i]) for i in ii])
    A, F = S.assign(cells, cls, L_, Pp, Cc)
    for ri, ans in enumerate(A):
        e = T.get(f'{sh}|{ri}', P.L.expected(ri)); s = ''.join(a for a in ans if a not in ('', '-'))
        tot['strike'] += ans.count('-'); tot['chars'] += len(e); tot['rows'] += 1
        d = P.L.ed(s.replace('?', '#'), e); tot['ed'] += d
        nf = s.count('?'); tot['flag'] += nf
        # ตัวที่ระบบตอบเอง: ถ้าจำนวนตรง เทียบรายตำแหน่ง
        if len(s) == len(e):
            for a, b in zip(s, e):
                if a != '?': tot['auto'] += 1; tot['auto_ok'] += a == b
        tot['row_ok'] += (s == e)
print(SET, json.dumps(tot), f"CAR(นับ ? เป็นผิด) {1 - tot['ed'] / tot['chars']:.4f} · ส่งครู {tot['flag'] / tot['chars']:.3f} · ถูก(ที่ตอบเอง) {tot['auto_ok'] / max(1, tot['auto']):.4f} · แถวถูกครบ {tot['row_ok'] / tot['rows']:.3f}")
