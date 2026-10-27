# วัดผลจริง 20 แผ่น (เขียนก่อนรัน · 26 ต.ค. 2569) · python eval_final20.py out.json
# ตัวหลัก = p3v5_b2v2 (Phase 1 v4 + 2A + 2B v3 + Phase 3 v5) · ตัวเทียบ = p3v1_b2v1 (ระบบ v1)
# แถว 1–10 (ในช่อง): ต่อช่อง เทียบคำตอบระบบกับเฉลย (ตัวอักษร หรือ '-' ขีดฆ่า) · 2B: recall ขีดฆ่า · ขีดฆ่าหลอก
#   CAR ระบบ = 1 − Σ edit(ตัวอักษรที่ระบบตอบ (ไม่รวม ''/'-'; '?' = ผิด), เฉลยตัดขีดฆ่า) / Σ ตัวเฉลย
# แถว 11–20 (ทับเส้น): CAR อ่าน (Phase 3 ล้วน) และ CAR ระบบ · Nice เทียบรายแถว · Korn เทียบทั้งก้อน 10 แถว (ตัวคร่อมแถวกำกวม)
#   ขีดฆ่าหลอก = ช่องที่ 2B ทายขีดฆ่าในแถว 11–20 (ไม่มีขีดจริง)
# CI 95% = bootstrap รายแผ่น 10,000 รอบ (seed 0) · รายงาน Nice (คนใหม่ = ตัวเลขหลัก) และ Korn (เคยเขียน Train) แยกกัน
import json, sys, numpy as np, gt_final20 as G
def ed(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        p = d[:]; d[0] = i
        for j, y in enumerate(b, 1): d[j] = min(p[j] + 1, d[j - 1] + 1, p[j - 1] + (x != y))
    return d[-1]
O = json.load(open(sys.argv[1])); SYS = {'หลัก (v4+2B v3+P3 v5)': ('p3v5_b2v2', 'b2v2', 'p3v5'), 'ระบบ v1': ('p3v1_b2v1', 'b2v1', 'p3v1')}
def sheet(n, key, bkey, pkey):
    g = G.GT[n]; R = O[n]; s = dict()
    if R.get('fail'): return None
    ans, cls, pr = R[key], R[bkey], R[pkey]['pred']
    # ในช่อง
    cell_ok = st_tp = st_n = st_fp = n_cell = e_sys = n_ch = 0
    for ri in range(10):
        t = g['cells'][ri]
        for k in range(20):
            n_cell += 1; a = ans[ri][k] if k < len(ans[ri]) else ''; c = cls[ri][k] if k < len(cls[ri]) else 0
            cell_ok += (a == ('-' if t[k] == '*' else t[k]))
            if t[k] == '*': st_n += 1; st_tp += (c == 2)
            elif c == 2: st_fp += 1
        sy = ''.join(x for x in ans[ri] if x not in ('', '-')); tt = t.replace('*', ''); e_sys += ed(sy, tt); n_ch += len(tt)
    s.update(cell_ok=cell_ok, n_cell=n_cell, st_tp=st_tp, st_n=st_n, st_fp_in=st_fp, e_in=e_sys, n_in=n_ch)
    # ทับเส้น
    rd = [''.join(pr[ri]) for ri in range(10, 20)]; sy = [''.join(x for x in ans[ri] if x not in ('', '-')) for ri in range(10, 20)]
    if isinstance(g['over'], list):
        e_r = sum(ed(a, b) for a, b in zip(rd, g['over'])); e_s = sum(ed(a, b) for a, b in zip(sy, g['over'])); n_o = sum(map(len, g['over']))
        row_ok = sum(a == b for a, b in zip(rd, g['over']))
    else:
        e_r = ed(''.join(rd), g['over']); e_s = ed(''.join(sy), g['over']); n_o = len(g['over']); row_ok = None
    s.update(e_rd_over=e_r, e_sys_over=e_s, n_over=n_o, row_ok_over=row_ok, st_fp_over=sum(c == 2 for ri in range(10, 20) for c in cls[ri]),
             q=sum(x == '?' for r in ans for x in r), rows20=R['nrows'] == 20 and all(c == 20 for c in R['ncells']), qc=R.get('qc_v4'))
    return s
def boot(vals_num, vals_den, B=10000):
    r = np.random.default_rng(0); a = np.array(vals_num, float); b = np.array(vals_den, float); i = r.integers(0, len(a), (B, len(a)))
    v = 1 - a[i].sum(1) / b[i].sum(1); return round(100 * np.percentile(v, 2.5), 2), round(100 * np.percentile(v, 97.5), 2)
OUT = {}
for nm, (key, bkey, pkey) in SYS.items():
    for who in ('Nice', 'Korn'):
        S = {n: sheet(n, key, bkey, pkey) for n in G.GT if G.GT[n]['who'] == who}; L = [v for v in S.values() if v]
        f = lambda k: sum(v[k] for v in L)
        r = dict(sheets=len(L), fail=sum(v is None for v in S.values()), grid20=sum(v['rows20'] for v in L),
                 cell_acc=round(100 * f('cell_ok') / f('n_cell'), 2), strike_recall=f'{f("st_tp")}/{f("st_n")}', false_strike_in=f('st_fp_in'),
                 CAR_sys_in=round(100 * (1 - f('e_in') / f('n_in')), 2), CAR_sys_in_ci=boot([v['e_in'] for v in L], [v['n_in'] for v in L]),
                 CAR_read_over=round(100 * (1 - f('e_rd_over') / f('n_over')), 2), CAR_read_over_ci=boot([v['e_rd_over'] for v in L], [v['n_over'] for v in L]),
                 CAR_sys_over=round(100 * (1 - f('e_sys_over') / f('n_over')), 2), CAR_sys_over_ci=boot([v['e_sys_over'] for v in L], [v['n_over'] for v in L]),
                 CAR_sys_all=round(100 * (1 - (f('e_in') + f('e_sys_over')) / (f('n_in') + f('n_over'))), 2),
                 CAR_sys_all_ci=boot([v['e_in'] + v['e_sys_over'] for v in L], [v['n_in'] + v['n_over'] for v in L]),
                 false_strike_over=f('st_fp_over'), flagged_q=f('q'), per_sheet={n: v for n, v in S.items()})
        OUT[f'{nm} | {who}'] = r
        print(nm, who, json.dumps({k: v for k, v in r.items() if k != 'per_sheet'}, ensure_ascii=False))
json.dump(OUT, open(sys.argv[1].replace('.json', '_eval.json'), 'w'), ensure_ascii=False, indent=1)
