import json, sys, math, statistics as st
def wil(k, n, z=1.96):
    if not n: return (0, 0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return (round(100 * (c - h), 2), round(100 * (c + h), 2))
R = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8')]
for name, S in (('ทั้งหมด', R), ('กระดาษเปล่า', [r for r in R if r['blank']]), ('ลายมือ', [r for r in R if not r['blank']])):
    if not S: continue
    gr = sum(r['gt_rows'] for r in S); rf = sum(r['rows_found'] for r in S); rc = sum(r['row_count_ok'] for r in S); pg = sum(r['page_ok'] for r in S)
    cl = sum(r.get('crop_clean', 0) for r in S); ct = sum(r.get('crop_total', 0) for r in S)
    m = lambda k: st.mean(r[k] for r in S)
    fl = sum(len(r.get('flag_rows', [])) for r in S)
    print(f"{name}: แผ่น {len(S)} | แถวเจอ {rf}/{gr} ({100*rf/gr:.2f}%) CI{wil(rf,gr)} | นับช่องถูก {rc}/{gr} ({100*rc/gr:.2f}%) CI{wil(rc,gr)} | หน้าถูก {pg}/{len(S)} CI{wil(pg,len(S))}")
    print(f"   GT รายแผ่น: F1@0.6 {m('sheet_f1_0.6'):.4f} @0.7 {m('sheet_f1_0.7'):.4f} @0.8 {m('sheet_f1_0.8'):.4f} @0.9 {m('sheet_f1_0.9'):.4f} | WAvg {m('sheet_wavg_f1'):.4f} | แถวตั้งธง {fl}/{gr}")
    print(f"   ตารางพิมพ์คงที่ (รวมคลาด Phase 1): F1@0.6 {m('f1_0.6'):.4f} @0.9 {m('f1_0.9'):.4f} | WAvg {m('wavg_f1'):.4f}" + (f" | crop สะอาด {cl}/{ct} ({100*cl/ct:.2f}%) CI{wil(cl,ct)}" if ct else ''))
bad = [(r['file'].split('/')[-1], r['rows_found'], [c for c in r['counts'] if c != 20]) for r in R if not r['page_ok']]
print('หน้าไม่ถูก:', len(bad), bad[:30])
print('แผ่นที่มีแถวตั้งธง:', [(r['file'].split('/')[-1], r['flag_rows']) for r in R if r.get('flag_rows')])
print('เวลา ms ค่ากลาง', st.median(r['ms'] for r in R))
