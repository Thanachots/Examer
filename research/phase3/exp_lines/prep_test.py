# ทดสอบความเป็นไปได้ (ไม่ใช่ผลรายงาน): สร้างข้อมูล
#  train: ช่อง Horizontal ชุด Train (splits_v2) → ภาพหมึก 48×48 + ป้าย A–Z (เขียนวนต่อเนื่อง)
#  test : 2 แผ่นใหม่ (ทับเส้นทุกตัว) → ตัวอักษรต่อแถว เรียงซ้าย→ขวา ด้วย 4 วิธีลบเส้น
import cv2, numpy as np, csv, os, sys, json, glob
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(H, '..', '..')
sys.path.insert(0, os.path.join(R, 'phase2')); import phase2a_locked as A
S = 48
def blueness(c):
    b, g, r = [c[..., i].astype(np.int16) for i in range(3)]; return b - (r + g) // 2
def linemask(shape, rows, w=1):
    lm = np.zeros(shape, bool)
    for rw in rows:
        x0, x1 = rw['cells'][0][0] - 45, rw['cells'][-1][2] + 8
        for (a, c) in (rw['top'], rw['bot']): lm[a - w:c + 1 + w, x0:x1] = True
        for (a, c) in rw['vlines']: lm[rw['top'][0] - 3:rw['bot'][1] + 4, a - w:c + 1 + w] = True
    return lm
def norm(mask):
    ys, xs = np.nonzero(mask)
    if len(ys) == 0: return None
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8) * 255
    h, w = m.shape; s = max(h, w) + 4; o = np.zeros((s, s), np.uint8)
    o[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = m
    return cv2.resize(o, (S, S), interpolation=cv2.INTER_AREA)
# ---------- train ----------
rows_csv = [r for r in csv.DictReader(open(os.path.join(R, 'dataset', 'splits_v2.csv'), encoding='utf-8-sig')) if r['p23'] == 'train' and r['folder'].startswith('Horizontal')]
X, Y, G = [], [], []
for si, r in enumerate(rows_csv):
    c = cv2.imread(os.path.join(R, 'scans_v3', r['folder'], os.path.basename(r['file']))); g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY)
    rows = A.detect(c); lm = linemask(g.shape, rows, 2); ink = (g < 170) & ~lm
    if len(rows) != 20: continue
    k = 0
    for ri, rw in enumerate(rows):
        for ci, cb in enumerate(rw['cells']):
            x0, y0, x1, y1 = cb
            sub = ink[y0 - 20:y1 + 20, x0 - 20:x1 + 20].astype(np.uint8)
            n, lab, st, cen = cv2.connectedComponentsWithStats(sub, 8)
            keep = np.zeros_like(sub, bool)
            for j in range(1, n):
                cx, cy = cen[j]
                if st[j, 4] >= 12 and 20 <= cx <= sub.shape[1] - 20 and 20 <= cy <= sub.shape[0] - 20: keep |= lab == j
            if keep.sum() < 60: k += 1; continue
            X.append(norm(keep)); Y.append((ri * 20 + ci) % 26); G.append(si); k += 1
np.savez_compressed(os.path.join(H, 'feas_train.npz'), X=np.stack(X), Y=np.array(Y), G=np.array(G))
print('train', len(X), 'sheets', len(set(G)))
# ---------- test ----------
out = {}
for f in sorted(glob.glob(os.path.join(H, 'new_scans', '*.png'))):
    c = cv2.imread(f); g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY); bl = blueness(c)
    rows = A.detect(c); lm = linemask(g.shape, rows, 2); dark = g < 170
    tab = np.zeros(g.shape, bool)
    for rw in rows: tab[rw['top'][0] - 50:rw['bot'][1] + 50, rw['cells'][0][0] - 50:rw['cells'][-1][2] + 10] = True
    inkfree = dark & ~lm & tab
    # เกณฑ์รายแผ่น: เส้นกรอบ = พิกเซลบนมาสก์ที่ห่างหมึก · หมึก = พิกเซลเข้มนอกมาสก์ · เลือก t ที่แยกสองกลุ่มดีที่สุด (Youden)
    far = dark & lm & ~cv2.dilate(inkfree.astype(np.uint8), np.ones((11, 11))).astype(bool)
    Lv, Iv = bl[far], bl[inkfree]
    ts = np.arange(-5, 40); J = [(Iv > t).mean() - (Lv > t).mean() for t in ts]; t_ad = int(ts[int(np.argmax(J))])
    M = {}
    M['A_remove'] = inkfree
    M['C_fixed15'] = inkfree | (lm & dark & (bl > 15))
    M['E_adaptive'] = inkfree | (lm & dark & (bl > t_ad))
    e = M['E_adaptive'].astype(np.uint8)
    cl = cv2.morphologyEx(e, cv2.MORPH_CLOSE, np.ones((11, 1), np.uint8)) | cv2.morphologyEx(e, cv2.MORPH_CLOSE, np.ones((1, 11), np.uint8))
    M['F_adaptive_fill'] = M['E_adaptive'] | (lm & (cl > 0))
    centers = [((rw['top'][0] + rw['bot'][1]) / 2) for rw in rows]
    res = {'t_adaptive': t_ad}
    for name, ink in M.items():
        n, lab, st, cen = cv2.connectedComponentsWithStats((ink & tab).astype(np.uint8), 8)
        per = [[] for _ in rows]
        for j in range(1, n):
            if st[j, 4] < 15: continue
            ri = int(np.argmin([abs(cen[j][1] - cy) for cy in centers])); per[ri].append(j)
        rows_out = []
        for ri, js in enumerate(per):
            js = sorted(js, key=lambda j: st[j, 0]); groups = []
            for j in js:
                x0, x1 = st[j, 0], st[j, 0] + st[j, 2]
                if groups and x0 <= groups[-1][1] + 4: groups[-1][1] = max(groups[-1][1], x1); groups[-1][2].append(j)
                else: groups.append([x0, x1, [j]])
            crops = []
            for x0, x1, gj in groups:
                m = np.isin(lab, gj)
                if m.sum() < 60: continue
                if float(bl[m].mean()) < t_ad * 0.5 and name != 'A_remove' and m.sum() < 400: continue   # เศษสีดำ (เลขแถว/เศษเส้น)
                if x1 < rows[ri]['cells'][0][0] - 10 and float(bl[m].mean()) < t_ad: continue              # เลขแถวที่พิมพ์ไว้
                crops.append(norm(m))
            rows_out.append(np.stack(crops) if crops else np.zeros((0, S, S), np.uint8))
        res[name] = rows_out
    out[os.path.basename(f)] = res
    print(os.path.basename(f), 't_adaptive', t_ad, {k: sum(len(x) for x in v) for k, v in res.items() if k != 't_adaptive'})
arr = {}
for fn, res in out.items():
    for name, rws in res.items():
        if name == 't_adaptive': continue
        for ri, a in enumerate(rws): arr[f'{fn}|{name}|{ri}'] = a
np.savez_compressed(os.path.join(H, 'feas_test.npz'), **arr)
