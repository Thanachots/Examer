# แปลงจาก zip โดยตรง (ทำต่อจากที่ค้างได้) จำกัดเวลาต่อรอบ
import zipfile, os, sys, time, io, pillow_heif
from PIL import Image, ImageOps
pillow_heif.register_heif_opener()
Z, OUT, LIMIT = sys.argv[1], sys.argv[2], float(sys.argv[3])
t0 = time.time(); z = zipfile.ZipFile(Z); n = 0; skip = 0
for m in sorted(z.namelist()):
    if not m.upper().endswith('.HEIC'): continue
    dst = os.path.join(OUT, m[:-5] + '.jpg')
    if os.path.exists(dst): skip += 1; continue
    if time.time() - t0 > LIMIT: break
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(z.read(m)))).convert('RGB')
    tmp = dst + '.part'; im.save(tmp, 'JPEG', quality=92); os.replace(tmp, dst); n += 1
print('new', n, 'already', skip, 'sec', round(time.time() - t0, 1))
