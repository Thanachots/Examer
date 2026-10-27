# แตก zip แล้วแปลง HEIC → JPG (หมุนตาม EXIF) เก็บต้นฉบับไว้ไม่แก้
import zipfile, os, sys, pillow_heif
from PIL import Image, ImageOps
pillow_heif.register_heif_opener()
Z = sys.argv[1]; RAW = 'raw_heic'; OUT = 'jpg'
z = zipfile.ZipFile(Z)
if not os.path.exists(RAW): z.extractall(RAW)
done = 0
for root, _, files in os.walk(RAW):
    for f in sorted(files):
        if not f.upper().endswith('.HEIC'): continue
        rel = os.path.relpath(root, RAW); dst = os.path.join(OUT, rel, f[:-5] + '.jpg')
        if os.path.exists(dst): done += 1; continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im = ImageOps.exif_transpose(Image.open(os.path.join(root, f))).convert('RGB')
        im.save(dst, quality=92); done += 1
        if done % 20 == 0: print(done, flush=True)
print('DONE', done, flush=True)
