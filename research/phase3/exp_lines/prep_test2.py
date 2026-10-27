# รอบ 2: แก้การรวมชิ้นส่วนตัวอักษร (ชิ้นที่ถูกเส้นตัดต้องรวมก่อนแบ่งแถว) + ตัดเศษเส้นกรอบ
import cv2, numpy as np, sys, os, glob
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(H, '..', '..', 'phase2')); import phase2a_locked as A
exec(open(os.path.join(H, 'prep_test.py')).read().split('# ---------- train ----------')[0])
arr = {}
for f in sorted(glob.glob(os.path.join(H, 'new_scans', '*.png'))):
    c = cv2.imread(f); g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY); bl = blueness(c)
    rows = A.detect(c); lm = linemask(g.shape, rows, 3); dark = g < 170
    tab = np.zeros(g.shape, bool)
    for rw in rows: tab[rw['top'][0] - 50:rw['bot'][1] + 50, rw['cells'][0][0] - 50:rw['cells'][-1][2] + 10] = True
    inkfree = dark & ~lm & tab
    far = dark & lm & ~cv2.dilate(inkfree.astype(np.uint8), np.ones((11, 11))).astype(bool)
    Lv, Iv = bl[far], bl[inkfree]; ts = np.arange(-5, 40); t = int(ts[int(np.argmax([(Iv > x).mean() - (Lv > x).mean() for x in ts]))])
    for name, ink in (('A_remove', inkfree), ('E_adaptive', inkfree | (lm & dark & (bl > t) & tab))):
        ink = ink.copy()
        # ตัดเศษรูปเส้น (บางยาว) ที่อยู่บนมาสก์เส้น
        n, lab, st, cen = cv2.connectedComponentsWithStats(ink.astype(np.uint8), 8)
        for j in range(1, n):
            x, y, w, h, a = st[j]
            if (h <= 7 and w >= 20) or (w <= 7 and h >= 35) or a < 10:
                if lm[lab == j].mean() > 0.5 or a < 10: ink[lab == j] = False
        # มาสก์สำหรับจัดกลุ่ม: เชื่อมชิ้นที่ถูกเส้นตัด (ปิดช่องเฉพาะแนวตั้งฉากกับเส้น)
        e = ink.astype(np.uint8)
        hb = np.zeros_like(lm); vb = np.zeros_like(lm)
        for rw in rows:
            x0, x1 = rw['cells'][0][0] - 45, rw['cells'][-1][2] + 8
            for (a, cc) in (rw['top'], rw['bot']): hb[a - 6:cc + 7, x0:x1] = True
            for (a, cc) in rw['vlines']: vb[rw['top'][0]:rw['bot'][1], a - 6:cc + 7] = True
        grp = ink | (hb & (cv2.morphologyEx(e, cv2.MORPH_CLOSE, np.ones((17, 1), np.uint8)) > 0)) | (vb & (cv2.morphologyEx(e, cv2.MORPH_CLOSE, np.ones((1, 17), np.uint8)) > 0))
        n, lab, st, cen = cv2.connectedComponentsWithStats(grp.astype(np.uint8), 8)
        centers = [((rw['top'][0] + rw['bot'][1]) / 2) for rw in rows]; per = [[] for _ in rows]
        for j in range(1, n):
            m = (lab == j) & ink
            if m.sum() < 80: continue
            ri = int(np.argmin([abs(cen[j][1] - cy) for cy in centers]))
            if st[j, 0] + st[j, 2] < rows[ri]['cells'][0][0] + 5 and bl[m].mean() < max(t, 3): continue   # เลขแถว (สีดำ)
            per[ri].append((st[j, 0], st[j, 0] + st[j, 2], j))
        for ri, gs in enumerate(per):
            gs.sort(); merged = []
            for x0, x1, j in gs:
                if merged and min(x1, merged[-1][1]) - max(x0, merged[-1][0]) > 0.5 * min(x1 - x0, merged[-1][1] - merged[-1][0]):
                    merged[-1][1] = max(merged[-1][1], x1); merged[-1][2].append(j)
                else: merged.append([x0, x1, [j]])
            crops = [norm(np.isin(lab, js) & ink) for _, _, js in merged]
            arr[f'{os.path.basename(f)}|{name}|{ri}'] = np.stack(crops) if crops else np.zeros((0, S, S), np.uint8)
        print(os.path.basename(f), name, 't', t, 'letters', sum(len(arr[k]) for k in arr if k.startswith(os.path.basename(f) + '|' + name)))
np.savez_compressed(os.path.join(H, 'feas_test2.npz'), **arr)
