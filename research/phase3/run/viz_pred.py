# ภาพผลอ่านบนแผ่น: กรอบเขียว = ถูก · แดง = ผิด (ตัวที่ทาย) · ส้ม = แถวที่แยกตัวอักษรได้ไม่ครบ/เกิน 13
import sys, os, numpy as np, cv2, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import p3train as P
SET, SH, MODEL, OUT = sys.argv[1:5]
t = np.load(f'{P.R}/phase3/data/{SET}/letters.npz'); net = P.Net(); net.load_state_dict(torch.load(MODEL, map_location='cpu'))
import json
T = json.load(open(f'{P.R}/phase3/data/{SET}/truth_override.json')); T.pop('_note')
m = t['SH'] == SH; idx = np.nonzero(m)[0]; p, conf = P.predb(net, t['X'][idx])
c = cv2.imread(f'{P.R}/phase3/data/{SET}/scan/{SH[:-5]}.jpg'); o = c.copy(); ok = n = 0
for ri in range(20):
    ii = [k for k in range(len(idx)) if t['RI'][idx[k]] == ri]; ii.sort(key=lambda k: t['K'][idx[k]]); e = T.get(f'{SH}|{ri}', P.L.expected(ri))
    for pos, k in enumerate(ii):
        b = t['BOX'][idx[k]]; ch = chr(65 + p[k])
        if len(ii) == len(e): col = (40, 170, 40) if ch == e[pos] else (40, 40, 230); ok += ch == e[pos]; n += 1
        else: col = (0, 140, 255)
        cv2.rectangle(o, (b[0] - 3, b[1] - 3), (b[2] + 3, b[3] + 3), col, 3)
        cv2.putText(o, ch, (b[0], b[1] - 8), cv2.FONT_HERSHEY_SIMPLEX, 1.1, col, 3)
y0 = 780; crop = o[y0:3300, 150:1650]
cv2.putText(crop, f'{SH[:-5]}  green=correct  red=wrong  orange=segmentation error', (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)
cv2.imwrite(OUT, cv2.resize(crop, None, fx=0.6, fy=0.6), [cv2.IMWRITE_JPEG_QUALITY, 88]); print(SH, ok, n)
