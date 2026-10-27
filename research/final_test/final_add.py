
# ---- FINAL: เทียบเฉลย ----
import string
U = string.ascii_uppercase
def truth(ri): return 'OPQRSTUVWXYZN' if ri in (1, 3) else ('ABCDEFGHIJKLM' if ri % 2 == 0 else 'NOPQRSTUVWXYZ')
def align(a, b):
    n, m = len(a), len(b); D = [[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1): D[i][0] = i
    for j in range(m+1): D[0][j] = j
    for i in range(1, n+1):
        for j in range(1, m+1): D[i][j] = min(D[i-1][j]+1, D[i][j-1]+1, D[i-1][j-1]+(a[i-1] != b[j-1]))
    return D[n][m]
VER = sys.argv[3]
FT = lambda s, b=False: ImageFont.truetype('/root/.fonts/PlexThaiX-%s.ttf' % ('Bold' if b else 'Regular'), s)
tot = err = 0; lines = []
for ri in range(len(rows)):
    t = truth(ri); sy = ''.join(x for x in ans[ri] if x not in ('', '-')); e = align(sy, t); tot += len(t); err += e; lines.append((t, sy, e))
car = 100 * (1 - err / tot)
Wd, Ht = 1500, 160 + 46 * len(lines) + 40; im2 = Image.new('RGB', (Wd, Ht), 'white'); d = ImageDraw.Draw(im2)
d.text((30, 20), f'ผลสุดท้าย ({VER}) · IMG_5417 รูปที่ส่งผ่านแชท 1932×2576', font=FT(30, True), fill='#0B2F6B')
d.text((30, 70), f'ถูก {tot-err}/{tot} ตัว = {car:.2f}%   (? = ระบบไม่แน่ใจ นับเป็นผิด)', font=FT(28, True), fill='#B3261E' if car < 90 else '#1E8E5A')
d.text((30, 120), 'แถว', font=FT(22, True), fill='#333'); d.text((110, 120), 'เฉลย', font=FT(22, True), fill='#333'); d.text((560, 120), 'ระบบตอบ', font=FT(22, True), fill='#333'); d.text((1300, 120), 'ผิด', font=FT(22, True), fill='#333')
mono = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 26)
for i, (t, sy, e) in enumerate(lines):
    y = 160 + 46 * i
    if e: d.rectangle((20, y - 4, Wd - 20, y + 38), fill='#FBE4E2')
    d.text((40, y), str(i + 1), font=mono, fill='#333'); d.text((110, y), t, font=mono, fill='#333')
    x = 560
    import difflib; okset = set()
    for a_, b_, n_ in difflib.SequenceMatcher(None, sy, t, autojunk=False).get_matching_blocks(): okset |= set(range(a_, a_ + n_))
    for j, ch in enumerate(sy):
        ok = j in okset
        d.text((x, y), ch, font=mono, fill='#1E8E5A' if ok else '#C62828'); x += 17
    d.text((1300, y), str(e), font=mono, fill='#C62828' if e else '#333')
im2.save(f'{od}/4_final.png'); print('FINAL', VER, 'CAR_sys', round(car, 2), 'err', err, 'of', tot)
