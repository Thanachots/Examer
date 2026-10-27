# แปลงเฉพาะรูปใหม่ (ไม่อยู่ใน splits.csv) จาก zip → jpg_new/<โฟลเดอร์>/ · resume ได้
import zipfile, os, sys, time, io, csv, hashlib, pillow_heif
from PIL import Image, ImageOps
pillow_heif.register_heif_opener()
old = {os.path.basename(r['file'])[:-4] for r in csv.DictReader(open('splits.csv', encoding='utf-8'))}
LIMIT = float(sys.argv[1]); t0 = time.time(); n = 0; skip = 0
for Z in sys.argv[2:]:
    z = zipfile.ZipFile(Z)
    for m in sorted(z.namelist()):
        base = os.path.basename(m)[:-5]
        if not m.upper().endswith('.HEIC') or base in old: continue
        dst = os.path.join('jpg_new', m[:-5] + '.jpg')
        if os.path.exists(dst): skip += 1; continue
        if time.time() - t0 > LIMIT: break
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        raw = z.read(m); im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
        tmp = dst + '.part'; im.save(tmp, 'JPEG', quality=92); os.replace(tmp, dst); n += 1
print('new', n, 'already', skip, 'sec', round(time.time() - t0, 1))
