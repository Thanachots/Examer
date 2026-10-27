# ทดลอง (Dev/Train เท่านั้น): ตัวอักษรทับเส้นกรอบ — เทียบ A ลบเส้นเฉย ๆ · B ลบ + inpaint (Telea, ตามที่ Gemini เสนอ) · C แยกสี · D แยกสี + เติมรอยขาด
import cv2, numpy as np, sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'phase2'))
import phase2a_locked as P
OUT = os.path.dirname(__file__)
SHEETS = sys.argv[1:]

def blueness(img):  # B - (R+G)/2 ใช้ int
    b, g, r = [img[..., i].astype(np.int16) for i in range(3)]
    return b - (r + g) // 2

stats = {'line': [], 'ink': [], 'ink_on_line': [], 'bg': []}
panels = []
for path in SHEETS:
    im = cv2.imread(path); gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY); bl = blueness(im)
    rows = P.detect(im)
    H, W = gray.shape
    lm = np.zeros((H, W), np.uint8)                      # มาสก์เส้นกรอบ (จากตำแหน่งที่ 2A หาได้)
    for r in rows:
        x0, x1 = r['cells'][0][0] - 8, r['cells'][-1][2] + 8
        for (a, c) in (r['top'], r['bot']): lm[a - 1:c + 2, x0:x1] = 1
        for (a, c) in r['vlines']: lm[r['top'][0]:r['bot'][1] + 1, a - 1:c + 2] = 1
    dark = gray < 190
    blue = (bl > 25) & (gray < 215)
    # สถิติสี
    stats['line'] += list(bl[(lm == 1) & dark & ~cv2.dilate(blue.astype(np.uint8), np.ones((9, 9))).astype(bool)][::50])
    stats['ink'] += list(bl[(lm == 0) & blue][::20])
    stats['ink_on_line'] += list(bl[(lm == 1) & cv2.dilate((blue & (lm == 0)).astype(np.uint8), np.ones((3, 3))).astype(bool) & dark][::5])
    stats['bg'] += list(bl[gray > 235][::500])
    # หาช่องที่หมึกน้ำเงินทับเส้นมากที่สุด
    cand = []
    for ri, r in enumerate(rows):
        for ci, c in enumerate(r['cells']):
            y0, y1, x0, x1 = c[1] - 30, c[3] + 30, c[0] - 30, c[2] + 30
            n = int(((lm[y0:y1, x0:x1] == 1) & blue[y0:y1, x0:x1]).sum())
            cand.append((n, ri, ci, (y0, y1, x0, x1)))
    cand.sort(reverse=True)
    for n, ri, ci, (y0, y1, x0, x1) in cand[:4]:
        win = im[y0:y1, x0:x1].copy(); m = lm[y0:y1, x0:x1]; g = gray[y0:y1, x0:x1]; b = bl[y0:y1, x0:x1]
        A = win.copy(); A[m == 1] = 255
        B = cv2.inpaint(win, (m * 255).astype(np.uint8), 3, cv2.INPAINT_TELEA)
        keep = (b > 25) & (g < 215)
        C = win.copy(); C[(m == 1) & ~keep] = 255
        ink = ((g < 200) & (m == 0)) | ((m == 1) & keep)
        # D: เติมรอยขาดเฉพาะในแถบเส้น (ปิดช่องว่างยาว ≤ ความหนาเส้น+2)
        cl = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 1), np.uint8)) | cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((1, 9), np.uint8))
        Dm = ink | ((m == 1) & (cl > 0))
        D = np.full_like(win, 255); D[Dm] = (150, 60, 20)
        def lab(x, t):
            x = cv2.resize(x, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_NEAREST); x = cv2.copyMakeBorder(x, 22, 2, 2, 2, cv2.BORDER_CONSTANT, value=(255, 255, 255))
            cv2.putText(x, t, (3, 17), 0, 0.5, (0, 0, 200), 1); return x
        mk = np.dstack([m * 255] * 3).astype(np.uint8)
        panels.append(np.hstack([lab(win, f'{os.path.basename(path)[:8]} r{ri+1}c{ci+1}'), lab(mk, 'line mask'), lab(A, 'A remove'), lab(B, 'B Telea'), lab(C, 'C color'), lab(D, 'D color+fill')]))
for k, v in stats.items():
    v = np.array(v); print(k, len(v), 'p5/50/95 =', np.percentile(v, [5, 50, 95]).round(1) if len(v) else '-')
hmax = max(p.shape[1] for p in panels)
panels = [cv2.copyMakeBorder(p, 0, 4, 0, hmax - p.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for p in panels]
cv2.imwrite(os.path.join(OUT, 'compare.jpg'), np.vstack(panels), [cv2.IMWRITE_JPEG_QUALITY, 85])
