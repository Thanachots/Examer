# วัดตำแหน่ง "กึ่งกลางเส้น" ของตารางที่พิมพ์จริง จากกระดาษเปล่า Dev 50 แผ่น (ไม่ใช้ detector ของ 2A)
# วิธี: โปรไฟล์ความเข้มเฉลี่ย (ภาพเทา) รอบตำแหน่งแม่แบบ ±25 px → จุดต่ำสุด (เส้นเข้มสุด) = กึ่งกลางเส้น
import csv, json, os, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..')
G = json.load(open(os.path.join(HERE, 'p2a_gt_template.json')))
rows = [r for r in csv.DictReader(open(os.path.join(ROOT, 'dataset', 'splits_v2.csv'), encoding='utf-8')) if r['p2a'] == 'dev' and 'เปล่า' in r['folder']]
W = 25; out = []
def cmin(p, base):
    p = cv2.GaussianBlur(p.reshape(1, -1).astype(np.float32), (1, 5), 0).ravel() if False else np.convolve(p, np.ones(3) / 3, 'same')
    i = int(np.argmin(p[1:-1])) + 1
    return base + i
for r in rows:
    g = cv2.imdecode(np.fromfile(os.path.join(ROOT, 'scans_v3', r['folder'], os.path.basename(r['file'])), np.uint8), 0).astype(np.float32)
    S = []
    for gr in G:
        tc = (gr['top'][0] + gr['top'][1]) / 2; bc = (gr['bot'][0] + gr['bot'][1]) / 2
        ya, yb = int(tc) - W, int(tc) + W; t = cmin(g[ya:yb, 300:2200].mean(1), ya)
        ya, yb = int(bc) - W, int(bc) + W; b = cmin(g[ya:yb, 300:2200].mean(1), ya)
        V = []
        for v in gr['vlines']:
            vc = int((v[0] + v[1]) / 2); xa = vc - W
            V.append(cmin(g[t + 12:b - 12, xa:vc + W].mean(0), xa))
        S.append(dict(t=t, b=b, v=V))
    out.append(dict(file=r['file'], m=S))
json.dump(out, open(os.path.join(HERE, 'p2a_measure_dev.json'), 'w'))
T = np.array([[s['t'] for s in o['m']] for o in out]); B = np.array([[s['b'] for s in o['m']] for o in out]); V = np.array([[s['v'] for s in o['m']] for o in out])
print('sheets', len(out))
print('top median', np.median(T, 0).tolist()); print('top IQR max', float((np.percentile(T, 75, 0) - np.percentile(T, 25, 0)).max()))
print('bot median', np.median(B, 0).tolist())
print('v row0 median', np.median(V[:, 0], 0).tolist()); print('v row19 median', np.median(V[:, 19], 0).tolist())
print('v IQR max', float((np.percentile(V, 75, 0) - np.percentile(V, 25, 0)).max()))
