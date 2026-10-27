# เก็บผล v0.3 บนรูป Dev ต้นฉบับ เป็นแหล่งของ stress set
import cv2, json, glob, numpy as np, phase1 as p, os
ref = json.load(open('bars_ref.json')); D = '/mnt/user-data/uploads/EXAMER/dataset/jpg/0.กระดาษเปล่า/'
OUTC = np.float32([[0, 0], [p.W, 0], [p.W, p.H], [0, p.H]]); src = {}
for f in sorted(glob.glob(D + 'IMG_*.jpg')):
    r, cl = p.run_v03(cv2.imread(f), ref); Q = np.float32(r['corners']); T = np.array(r['H_total'])
    m = cv2.perspectiveTransform(Q.reshape(-1, 1, 2), T).reshape(-1, 2)
    order = [int(np.argmin(np.linalg.norm(m - c, axis=1))) for c in OUTC]
    assert len(set(order)) == 4
    src[os.path.basename(f)] = dict(Q=Q[order].tolist(), H=r['H_total'], qc=r.get('qc_max'))
json.dump(src, open('stress_src.json', 'w')); print(len(src), max(v['qc'] for v in src.values()))
