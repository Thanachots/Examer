# วัดผล Phase 3 บนชุดที่ระบุ ครั้งเดียว: CAR/WAR + แยกชนิดทับเส้น + 95% CI (Wilson) + baseline + ระบบรวมรายช่อง
import sys, os, json, math, numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import p3train as P, system as S
SET = sys.argv[1]; R = P.R
def wilson(k, n, z=1.96):
    if n == 0: return (0, 0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(c - h, 4), round(c + h, 4))
t = np.load(f'{R}/phase3/data/{SET}/letters.npz'); T = json.load(open(f'{R}/phase3/data/{SET}/truth_override.json')); T.pop('_note')
log = json.load(open(f'{R}/phase3/data/{SET}/p12.json')); out = {}
for name, mp in (('model', f'{R}/phase3/data/m3_all2.pt'), ('baseline', f'{R}/phase3/data/m_baseline.pt')):
    net = P.Net(); net.load_state_dict(torch.load(mp, map_location='cpu')); p, c = P.predb(net, t['X'])
    rows = {}
    for i in range(len(p)): rows.setdefault((str(t['SH'][i]), int(t['RI'][i])), []).append(i)
    agg = {}; corr = []
    for (sh, ri), ii in rows.items():
        ii.sort(key=lambda i: t['K'][i]); e = T.get(f'{sh}|{ri}', P.L.expected(ri)); s = ''.join(chr(65 + p[i]) for i in ii)
        d = P.L.ed(s, e)
        for k in ('all', P.L.side(ri)):
            a = agg.setdefault(k, [0, 0, 0, 0]); a[0] += d; a[1] += len(e); a[2] += (s == e); a[3] += 1
        if len(s) == len(e): corr += [int(x == y) for x, y in zip(s, e)]
        else: corr += [0] * len(e)
    res = {}
    for k, (d, n, ok, nr) in agg.items():
        car = 1 - d / n; res[k] = dict(CAR=round(car, 4), CAR_CI=wilson(round(car * n), n), WAR=round(ok / nr, 4), WAR_CI=wilson(ok, nr), chars=n, rows=nr)
    out[name] = res; out[name + '_perpos'] = corr
    if name == 'model':
        tot = dict(chars=0, auto=0, auto_ok=0, flag=0)
        for rec in log:
            sh = rec['file']; cells = [[] for _ in rec['rows']]; cls = [[] for _ in rec['rows']]
            for cl in rec['cells']: cells[cl['row']].append(cl['box']); cls[cl['row']].append(int(np.argmax(cl['p'])))
            L_, Pp, Cc = [], [], []
            for ri in range(len(rec['rows'])):
                ii = sorted(np.nonzero((t['SH'] == sh) & (t['RI'] == ri))[0], key=lambda i: t['K'][i])
                L_.append([t['BOX'][i] for i in ii]); Pp.append([chr(65 + p[i]) for i in ii]); Cc.append([float(c[i]) for i in ii])
            A, F = S.assign(cells, cls, L_, Pp, Cc)
            for ri, ans in enumerate(A):
                e = T.get(f'{sh}|{ri}', P.L.expected(ri)); s = ''.join(a for a in ans if a not in ('', '-')); tot['chars'] += len(e); tot['flag'] += s.count('?')
                if len(s) == len(e):
                    for a, b in zip(s, e):
                        if a != '?': tot['auto'] += 1; tot['auto_ok'] += a == b
        tot['auto_acc'] = round(tot['auto_ok'] / tot['auto'], 4); tot['auto_acc_CI'] = wilson(tot['auto_ok'], tot['auto']); tot['flag_rate'] = round(tot['flag'] / tot['chars'], 4)
        out['system'] = tot
a, b = np.array(out['model_perpos']), np.array(out['baseline_perpos']); n01 = int(((a == 1) & (b == 0)).sum()); n10 = int(((a == 0) & (b == 1)).sum())
from scipy.stats import binomtest
out['mcnemar'] = dict(model_only=n01, baseline_only=n10, p=float(binomtest(min(n01, n10), n01 + n10, 0.5).pvalue) if n01 + n10 else 1.0)
del out['model_perpos'], out['baseline_perpos']
json.dump(out, open(f'{R}/phase3/data/{SET}_result.json', 'w'), indent=1, ensure_ascii=False); print(json.dumps(out, ensure_ascii=False, indent=1))
