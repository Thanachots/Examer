# รอบ 3: แยกสีแบบปรับได้เต็มรูป — เรียนสีหมึก/สีเส้นของแต่ละแผ่นใน 3 มิติ (Lab) แล้วตัดสินทีละพิกเซลด้วยความน่าจะเป็น
#   G_global : แบบจำลองสีทั้งแผ่น · G_local : แบบจำลองสีรายแถว (แสง/หมึกต่างกันในแผ่น)
import cv2, numpy as np, sys, os, glob
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(H, '..', '..', 'phase2')); import phase2a_locked as A
src2 = open(os.path.join(H, 'prep_test2.py')).read()
exec(open(os.path.join(H, 'prep_test.py')).read().split('# ---------- train ----------')[0])
def gauss(X):
    mu = X.mean(0); C = np.cov(X.T) + np.eye(3) * 4; Ci = np.linalg.inv(C); return mu, Ci, np.log(np.linalg.det(C))
def ll(X, g):
    mu, Ci, ld = g; d = X - mu; return -0.5 * (np.einsum('ij,jk,ik->i', d, Ci, d) + ld)
def segment(c, rows, ink, lm, bl, t, tab):
    # ส่วนจัดกลุ่ม/ตัดเศษ/แบ่งแถว เหมือนรอบ 2 ทุกอย่าง
    out = {}
    body = src2.split("        ink = ink.copy()")[1].split("        print(")[0]
    loc = dict(ink=ink, rows=rows, lm=lm, bl=bl, t=t, np=np, cv2=cv2, norm=norm, S=S, arr=out, f='x', name='n', os=os)
    exec("ink = ink.copy()\n" + "\n".join(l[8:] for l in body.split("\n")), loc)
    return [out[f'x|n|{ri}'] for ri in range(len(rows))]
arr = {}
for f in sorted(glob.glob(os.path.join(H, 'new_scans', '*.png'))):
    c = cv2.imread(f); g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY); bl = blueness(c); lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).astype(np.float32)
    rows = A.detect(c); lm = linemask(g.shape, rows, 3); dark = g < 170
    tab = np.zeros(g.shape, bool)
    for rw in rows: tab[rw['top'][0] - 50:rw['bot'][1] + 50, rw['cells'][0][0] - 50:rw['cells'][-1][2] + 10] = True
    inkfree = dark & ~lm & tab
    far = dark & lm & ~cv2.dilate(inkfree.astype(np.uint8), np.ones((11, 11))).astype(bool)
    Lv, Iv = bl[far], bl[inkfree]; ts = np.arange(-5, 40); t = int(ts[int(np.argmax([(Iv > x).mean() - (Lv > x).mean() for x in ts]))])
    cand = lm & dark & tab
    variants = {'E_adaptive_1D': inkfree | (cand & (bl > t))}
    gi, gl = gauss(lab[inkfree][::3]), gauss(lab[far][::3])
    m = np.zeros_like(cand); ys, xs = np.nonzero(cand); X = lab[ys, xs]; m[ys, xs] = ll(X, gi) > ll(X, gl)
    variants['G_global_3D'] = inkfree | m
    m2 = np.zeros_like(cand)
    for rw in rows:
        y0, y1 = rw['top'][0] - 50, rw['bot'][1] + 50; band = np.zeros_like(cand); band[y0:y1] = True
        I_, L_ = inkfree & band, far & band
        if I_.sum() < 200 or L_.sum() < 200: continue
        gi2, gl2 = gauss(lab[I_]), gauss(lab[L_]); ys, xs = np.nonzero(cand & band); X = lab[ys, xs]; m2[ys, xs] |= ll(X, gi2) > ll(X, gl2)
    variants['G_local_3D'] = inkfree | m2
    for name, ink in variants.items():
        rws = segment(c, rows, ink, lm, bl, t, tab)
        for ri, a in enumerate(rws): arr[f'{os.path.basename(f)}|{name}|{ri}'] = a
        print(os.path.basename(f), name, 'kept-on-line px', int((ink & cand).sum()), 'of', int(cand.sum()), 'letters', sum(len(a) for a in rws))
np.savez_compressed(os.path.join(H, 'feas_test3.npz'), **arr)
