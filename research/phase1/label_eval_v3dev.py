# วัด Phase 1 v1 บน Test 150 เทียบ label มือ · ใช้ผลที่เก็บไว้ใน v3dev_b/results.jsonl (ไม่รันโค้ดซ้ำ)
# python label_eval_test.py labels_test150.json
import json, sys, math, numpy as np, cv2
W, H = 2480, 3508; CANON = np.float32([[2306.5, 175.0], [2306.5, 3332.0], [177.5, 3332.0]])
OUTC = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
# มุมกระดาษจริงในพิกัดหน้าสแกน: ค่ากลางจาก label Dev 20 (ส่วนเบี่ยงเบน 3–5 px) · กำหนดก่อนเห็น label Test
PAPER = np.float32([[-81.2, -114.7], [2541.7, -101.7], [2539.6, 3577.0], [-61.8, 3577.2]])
R = {json.loads(l)['file']: json.loads(l) for l in open('v3dev_b/results.jsonl', encoding='utf-8')}
labs = json.load(open(sys.argv[1], encoding='utf-8'))['labels']
def iou(a, b):
    a, b = np.float32(a), np.float32(b); inter, _ = cv2.intersectConvexConvex(cv2.convexHull(a), cv2.convexHull(b))
    return float(inter / (cv2.contourArea(a) + cv2.contourArea(b) - inter))
def wilson(k, n, z=1.96):
    if n == 0: return (0, 0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(100 * (c - h), 1), round(100 * (c + h), 1))
rows = []
for f, L in labs.items():
    r = R[f]; o = dict(file=f, folder=r['folder'], qc_pass=r.get('qc_max') is not None and r['qc_max'] <= 8, path=r.get('path'))
    if L.get('flag') or len(L['pts']) < 7: o['skip'] = True; rows.append(o); continue
    P = np.float32([L['pts'][k] for k in ('P_TL', 'P_TR', 'P_BR', 'P_BL')])
    # ตรวจ label: หมุดต้องอยู่ใกล้มุมของมัน
    o['label_ok'] = all(np.linalg.norm(np.array(L['pts']['M_' + k]) - np.array(L['pts']['P_' + k])) < 0.15 * np.linalg.norm(P[0] - P[2]) for k in ('TR', 'BR', 'BL'))
    if 'H_total' not in r: o['no_output'] = True; rows.append(o); continue
    T = np.array(r['H_total']); Ti = np.linalg.inv(T)
    # กรอบกระดาษที่ระบบให้ = มุมกระดาษในหน้าสแกน (PAPER) ย้อนกลับไปรูปต้นฉบับ (ใช้ได้ทั้งทางขอบและทางหมุด)
    Q = cv2.perspectiveTransform(PAPER.reshape(-1, 1, 2), Ti).reshape(-1, 2)
    o['iou_page'] = iou(Q, P)
    if 'corners' in r and r.get('path') == 'paper': o['iou_quad'] = iou(np.float32(r['corners']), P)
    tl = cv2.perspectiveTransform(P[:1].reshape(-1, 1, 2), T).reshape(2); o['orient_ok'] = bool(np.argmin(np.linalg.norm(OUTC - tl, axis=1)) == 0)
    M = np.float32([L['pts'][k] for k in ('M_TR', 'M_BR', 'M_BL')]).reshape(-1, 1, 2)
    o['mark_err'] = np.linalg.norm(cv2.perspectiveTransform(M, T).reshape(-1, 2) - CANON, axis=1).tolist()
    rows.append(o)
ok = [o for o in rows if 'mark_err' in o]
def summ(S, name):
    n = len(S)
    if not n: return {}
    I = np.array([o['iou_page'] for o in S]); E = np.array([o['mark_err'] for o in S]); k95 = int((I >= 0.95).sum()); ko = int(sum(o['orient_ok'] for o in S))
    kq = int(sum(o['qc_pass'] for o in S)); kbr = int((E[:, 1:].max(1) <= 8).sum())
    silent = sum(o['qc_pass'] and (E[o_i, 1:].max() > 8 or not o['orient_ok']) for o_i, o in enumerate(S))
    return {'ชุด': name, 'n': n, 'IoU≥0.95': f'{k95}/{n} CI{wilson(k95, n)}', 'IoU กลาง': round(float(np.median(I)), 4), 'IoU ต่ำสุด': round(float(I.min()), 4),
            'ทิศถูก': f'{ko}/{n} CI{wilson(ko, n)}', 'QC ผ่าน': f'{kq}/{n} CI{wilson(kq, n)}', 'หมุด BR/BL ≤ 8 px': f'{kbr}/{n}',
            'หมุด กลาง BL/BR/TR': [round(float(np.median(E[:, i])), 1) for i in (2, 1, 0)], 'QC ผ่านแต่ label บอกผิด (พังเงียบ)': int(silent)}
out = dict(summary=[summ(ok, 'ทั้งหมด'), summ([o for o in ok if 'เปล่า' in o['folder']], 'เปล่า/กระจก'), summ([o for o in ok if 'เปล่า' not in o['folder']], 'ลายมือ')],
           label_suspect=[o['file'] for o in ok if not o['label_ok']], skipped=[o['file'] for o in rows if o.get('skip')], per_sheet=rows)
json.dump(out, open('eval_test150_v3dev.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for s in out['summary']: print(json.dumps(s, ensure_ascii=False))
print('label น่าสงสัย:', out['label_suspect'], '· ข้าม:', out['skipped'])
