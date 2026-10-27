# วัดผล Phase 1 เทียบ label ที่คลิกมือ (ชุด Dev เท่านั้น จนกว่าจะล็อก v1)
# python label_eval.py <dataset_dir> <labels.json> <out.json> [fn=run_v03]
import json, os, sys, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import phase1 as p
BASE, LAB, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; FN = sys.argv[4] if len(sys.argv) > 4 else 'run_v03'
REF = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bars_ref.json')))
labs = json.load(open(LAB, encoding='utf-8'))['labels']
DIR = {'0': '0.กระดาษเปล่า'}
OUTC = np.float32([[0, 0], [p.W, 0], [p.W, p.H], [0, p.H]])

def iou(a, b):
    a, b = np.float32(a), np.float32(b)
    inter, _ = cv2.intersectConvexConvex(cv2.convexHull(a), cv2.convexHull(b))
    return float(inter / (cv2.contourArea(a) + cv2.contourArea(b) - inter))

res = []
for f, L in labs.items():
    if L.get('flag') or len(L['pts']) < 7: res.append(dict(file=f, skip='flag' if L.get('flag') else 'incomplete')); continue
    im = cv2.imread(os.path.join(BASE, 'jpg', '0.กระดาษเปล่า', f)); r, cl = getattr(p, FN)(im, REF)
    o = dict(file=f)
    if cl is None: o['fail'] = r.get('fail'); res.append(o); continue
    P = np.float32([L['pts'][k] for k in ('P_TL', 'P_TR', 'P_BR', 'P_BL')])
    Q = np.float32(r['corners']); T = np.array(r['H_total'])
    # (1) หากระดาษเจอ: IoU สี่เหลี่ยมที่หาได้ vs label · ค่าคลาดมุม (จับคู่มุมที่ใกล้สุด) หน่วย px รูปต้นฉบับ
    o['iou'] = iou(Q, P)
    o['corner_err'] = [float(np.min(np.linalg.norm(Q - c, axis=1))) for c in P]
    # (2) ทิศ: มุมบนซ้ายของฟอร์ม (label) ต้องไปตกที่มุมบนซ้ายของภาพผลลัพธ์
    tl = cv2.perspectiveTransform(P[:1].reshape(-1, 1, 2), T).reshape(2)
    o['orient_ok'] = bool(int(np.argmin(np.linalg.norm(OUTC - tl, axis=1))) == 0)
    # (3) ตำแหน่งหมุดหลังทั้งระบบ: แปลงจุดหมุดที่ label ด้วย H_total แล้วเทียบตำแหน่ง template · หน่วย px ที่ 300 dpi
    M = np.float32([L['pts'][k] for k in ('M_TR', 'M_BR', 'M_BL')]).reshape(-1, 1, 2)
    o['mark_err'] = np.linalg.norm(cv2.perspectiveTransform(M, T).reshape(-1, 2) - p.CANON[1:4], axis=1).tolist()
    o['qc_max'] = r.get('qc_max'); res.append(o)

ok = [o for o in res if 'iou' in o]
summ = dict(n_label=len(labs), n_eval=len(ok), n_skip=sum('skip' in o for o in res), n_fail=sum('fail' in o for o in res))
if ok:
    I = np.array([o['iou'] for o in ok]); C = np.array([o['corner_err'] for o in ok]); E = np.array([o['mark_err'] for o in ok])
    summ.update(iou_median=float(np.median(I)), iou_min=float(I.min()), found_iou90=float((I >= 0.90).mean()), found_iou95=float((I >= 0.95).mean()),
                corner_err_median=float(np.median(C)), corner_err_p95=float(np.percentile(C, 95)),
                orient_acc=float(np.mean([o['orient_ok'] for o in ok])),
                mark_err_median=float(np.median(E)), mark_err_max=float(E.max()), sheets_mark_le8=float((E.max(1) <= 8).mean()))
json.dump(dict(summary=summ, per_sheet=res), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(summ, ensure_ascii=False, indent=1))
