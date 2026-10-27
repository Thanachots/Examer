# แม่แบบสิ่งที่พิมพ์ (เลขแถว ฯลฯ) จากหน้าสแกนชุด train เท่านั้น: พิกเซลที่เข้มใน ≥ 80% ของแผ่น = ของที่พิมพ์ (ลายมือแต่ละแผ่นต่างตำแหน่งกัน จึงไม่ผ่านเกณฑ์)
import glob, cv2, numpy as np, os
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
fs = sorted(glob.glob(f'{R}/phase3/data/train/scan/*.jpg')); acc = None
for f in fs:
    g = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2GRAY); paper = np.median(g[800:3300, 250:2250])
    d = (g < paper - 60).astype(np.float32); acc = d if acc is None else acc + d
P = (acc / len(fs)) >= 0.8
np.savez_compressed(f'{R}/phase3/data/print_template.npz', P=P); print(len(fs), P.sum())
