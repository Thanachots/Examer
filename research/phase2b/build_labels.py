# ป้ายกำกับ 2B: 0=empty 1=char 2=strike
# empty = หมึกกลางช่อง < 0.004 หรือ (ตัดเส้นนอนยาว ≥ 40 px ออกแล้ว) < 0.004 · strike = จากการตรวจด้วยตา (labels_strike.txt) · ที่เหลือ = char
# Horizontal/Words: ไม่มีขีดฆ่า (เขียนเรียง/เขียนคำ) · Edge: ป้าย strike มีเฉพาะแผ่นที่ตรวจด้วยตา (val/test) → train = -1 (ไม่รู้)
import numpy as np, json
M = json.load(open('/mnt/user-data/uploads/EXAMER/phase2b/cells_meta.json')); C = np.load('cink.npy'); C2 = np.load('cink2.npy')
ov = json.load(open('overrides_valtest.json'))
S = {}; OC = set(); OE = set()
for l in open('labels_strike.txt', encoding='utf-8'):
    if l.startswith('#') or not l.strip(): continue
    p = l.split(); key = (p[0], p[1] + '.jpg'); S.setdefault(key, set())
    for t in p[2:]:
        if t.startswith('C'): OC.add(key + tuple(map(int, t[1:].split(','))))
        elif t.startswith('E'): OE.add(key + tuple(map(int, t[1:].split(','))))
        else: S[key].add(tuple(map(int, t.split(','))))
for k in ov['char']: OC.add(tuple(k))
for k in ov['empty']: OE.add(tuple(k))
Y = np.full(len(M), -1, int)
for i, m in enumerate(M):
    key = (m['split'], m['file']); rc = (m['row'], m['col'])
    empty = C[i] < 0.004 or (C[i] >= 0.004 and C2[i] < 0.004)
    if key + rc in OE: empty = True
    if key + rc in OC: empty = False
    if m['folder'].startswith(('Horizontal', 'Words')): Y[i] = 0 if empty else 1
    elif key in S: Y[i] = 0 if empty else (2 if rc in S[key] else 1)
    elif empty: Y[i] = 0
np.save('Y.npy', Y)
if __name__ == '__main__':
    import collections
    print(collections.Counter((m['folder'][:5], m['split'], int(Y[i])) for i, m in enumerate(M)))
    bad = [(k, rc) for k, v in S.items() for rc in v if not any(m['split'] == k[0] and m['file'] == k[1] and (m['row'], m['col']) == rc and Y[i] == 2 for i, m in enumerate(M))]
    print('strike ที่ตกเป็น empty:', bad)
