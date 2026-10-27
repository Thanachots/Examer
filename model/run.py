# ใช้งาน:  python run.py รูป.jpg                → พิมพ์คำตอบ + บันทึก รูป.json
#          python run.py รูป.heic --viz ผล.jpg   → บันทึกภาพหน้าสแกนที่วาดคำตอบไว้ด้วย
#          python run.py โฟลเดอร์/               → อ่านทุกรูปในโฟลเดอร์
import sys, os, json, argparse, cv2
from examer.pipeline import read_sheet, load_image

def draw(R):
    c = R['scan'].copy(); F = cv2.FONT_HERSHEY_SIMPLEX
    for r in R['rows']:
        if r['mode'] == 'cell':
            for a, b in zip(r['cells'], r['boxes']):
                col = (0, 140, 255) if a == '?' else ((0, 0, 220) if a == '-' else (40, 150, 40))
                cv2.rectangle(c, (b[0], b[1]), (b[2], b[3]), col, 3); cv2.putText(c, a, (b[0] + 6, b[3] - 8), F, 1.1, col, 3)
        else:
            for a, b in zip(r['letters'], r['boxes']):
                col = (0, 140, 255) if a == '?' else (200, 90, 0)
                cv2.rectangle(c, (b[0], b[1]), (b[2], b[3]), col, 3); cv2.putText(c, a, (b[0], b[1] - 6), F, 1.1, col, 3)
    return c

def show(name, R):
    print(f'== {name}')
    if not R['ok']: print('  อ่านไม่ได้:', R['error']); return
    for r in R['rows']:
        s = ' '.join((x or '.') for x in r['cells']) if r['mode'] == 'cell' else ''.join(r['letters'])
        print(f"  {r['row']:2d} {'ในช่อง ' if r['mode'] == 'cell' else 'ทับเส้น'} {s}")
    print(f"  ส่งครูตรวจ {R['needs_review']} ช่อง · QC {R['phase1']['qc_px']} px · {R['seconds']} วินาที")

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('input'); ap.add_argument('--out', help='ไฟล์ JSON (ค่าเริ่ม: ชื่อรูป.json)'); ap.add_argument('--viz', help='บันทึกภาพผล (.jpg)')
    a = ap.parse_args(); EXT = ('.jpg', '.jpeg', '.png', '.heic', '.heif')
    files = [os.path.join(a.input, f) for f in sorted(os.listdir(a.input)) if f.lower().endswith(EXT)] if os.path.isdir(a.input) else [a.input]
    for f in files:
        R = read_sheet(load_image(f), keep_scan=True); show(os.path.basename(f), R)
        if a.viz and R.get('scan') is not None and R['ok']:
            v = a.viz if len(files) == 1 else os.path.splitext(f)[0] + '_viz.jpg'; cv2.imwrite(v, cv2.resize(draw(R), None, fx=0.5, fy=0.5)); print('  ภาพผล:', v)
        R.pop('scan', None); out = a.out if (a.out and len(files) == 1) else os.path.splitext(f)[0] + '.json'
        json.dump(R, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print('  JSON:', out)
