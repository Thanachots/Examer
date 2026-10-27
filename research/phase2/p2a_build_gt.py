# GT แบบ "ตารางที่พิมพ์จริง" = ค่ากลาง (median) ของกึ่งกลางเส้นที่วัดจากกระดาษเปล่า Dev 50 แผ่น
# ช่อง = ภายในเส้น: (เส้นตั้ง k + H, เส้นบน + H, เส้นตั้ง k+1 − H, เส้นล่าง − H) · H = 3 px (ครึ่งความหนาเส้น)
import json, os, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); H = 3
M = json.load(open(os.path.join(HERE, 'p2a_measure_dev.json')))
T = np.median([[s['t'] for s in o['m']] for o in M], 0); B = np.median([[s['b'] for s in o['m']] for o in M], 0)
V = np.median([[s['v'] for s in o['m']] for o in M], 0)
G = []
for i in range(20):
    t, b = float(T[i]), float(B[i]); v = [float(x) for x in V[i]]
    G.append(dict(tc=t, bc=b, vc=v, top=[int(round(t)), int(round(t))], bot=[int(round(b)), int(round(b))],
                  cells=[[int(round(v[k] + H)), int(round(t + H)), int(round(v[k + 1] - H)), int(round(b - H))] for k in range(20)]))
json.dump(G, open(os.path.join(HERE, 'p2a_gt_printed.json'), 'w'))
print(G[0]['cells'][:2], G[19]['cells'][-1])
