# รูปสรุป P1-E04: ความทนของ Phase 1 ต่อสภาพถ่าย (ชุดทดสอบความทนสร้างจาก Dev 50)
import json, collections, cv2, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
for f in ('/root/.fonts/PlexThai-400.ttf', '/root/.fonts/PlexThai-700.ttf'): fm.fontManager.addfont(f)
plt.rcParams['font.family'] = ['PlexThai', 'DejaVu Sans']
import stress as S, stress_sum as SS

TH = {'bg_white': 'โต๊ะขาว', 'bg_dark': 'โต๊ะดำ', 'bg_cloth': 'ผ้าสี', 'bg_pattern': 'ของรกบนโต๊ะ', 'rot_any': 'หมุนทุกทิศ',
      'tilt': 'กล้องเอียงมาก', 'small': 'ถ่ายไกล (กระดาษเล็ก)', 'cut_corner': 'มุมกระดาษหลุดเฟรม', 'occlude': 'ปากกา/นิ้วบังขอบ',
      'dim': 'แสงมืด', 'shadow': 'เงาพาด', 'glare': 'แสงสะท้อนจ้า', 'blur': 'เบลอ + JPEG แย่', 'mix': 'สุ่มรวมทุกอย่าง'}
A = SS.summ(SS.load('stress_v03.jsonl')); B = SS.summ(SS.load('stress_v04.jsonl'))
conds = list(S.CONDS)
INK, MUTE, C3, C4, RED, AMB = '#1d1d1b', '#6b6a65', '#b9b6ab', '#c2410c', '#b91c1c', '#d97706'

# ---- รูป 1: ผ่านต่อเงื่อนไข ก่อน/หลัง ----
fig, ax = plt.subplots(figsize=(13.33, 7.5), dpi=150)
y = np.arange(len(conds))[::-1]
a = [A[c]['ok'] / A[c]['n'] * 100 for c in conds]; b = [B[c]['ok'] / B[c]['n'] * 100 for c in conds]
for yi, ai, bi, c in zip(y, a, b, conds):
    ax.plot([ai, bi], [yi, yi], color='#e4e2da', lw=6, solid_capstyle='round', zorder=1)
    ax.scatter(ai, yi, s=110, color=C3, zorder=3); ax.scatter(bi, yi, s=140, color=C4, zorder=4)
    ax.text(bi + (2.2 if bi >= ai else -2.2), yi, f'{bi:.0f}%', va='center', ha='left' if bi >= ai else 'right', fontsize=12, color=C4, weight='bold')
    if abs(bi - ai) > 6: ax.text(ai + 2.2 if ai < 5 else ai - 2.2, yi + (0.33 if ai < 5 else 0), f'{ai:.0f}%', va='center', ha='left' if ai < 5 else 'right', fontsize=10.5, color=MUTE)
    sil = B[c]['silent']
    if sil: ax.text(108, yi, f'พังเงียบ {sil}', va='center', fontsize=10.5, color=RED)
ax.set_yticks(y); ax.set_yticklabels([TH[c] for c in conds], fontsize=12.5)
ax.axvline(95, color=INK, lw=1, ls=(0, (4, 4))); ax.text(95, len(conds) - 0.35, 'เกณฑ์ Gate 1: 95%', fontsize=10.5, color=INK, ha='center')
ax.set_xlim(-2, 118); ax.set_xticks([0, 25, 50, 75, 100]); ax.set_xticklabels(['0%', '25%', '50%', '75%', '100%'], fontsize=11)
for s in ('top', 'right', 'left'): ax.spines[s].set_visible(False)
ax.tick_params(axis='y', length=0); ax.set_ylim(-0.8, len(conds) - 0.2)
ta = sum(A[c]['ok'] for c in conds); tb = sum(B[c]['ok'] for c in conds); n = sum(A[c]['n'] for c in conds)
fig.text(0.04, 0.955, 'P1-E04 · ความทนต่อสภาพถ่าย: ผ่าน (ค่าคลาดลงทะเบียนเทียบ GT ≤ 8 px และ QC ผ่าน)', fontsize=17, weight='bold', color=INK)
fig.text(0.04, 0.915, f'ชุดทดสอบความทน 14 เงื่อนไข × Dev 50 แผ่น = {n} รูป · สร้างจาก Dev เท่านั้น ไม่แตะ Test', fontsize=12, color=MUTE)
fig.text(0.62, 0.955, '', fontsize=1)
ax.scatter([], [], s=110, color=C3, label=f'v0.3 ขอบกระดาษอย่างเดียว · รวม {ta}/{n} ({ta / n * 100:.0f}%)')
ax.scatter([], [], s=140, color=C4, label=f'v0.4 + ทางสำรองหาจากหมุด · รวม {tb}/{n} ({tb / n * 100:.0f}%)')
ax.legend(loc='lower left', bbox_to_anchor=(0.0, -0.13), ncol=2, frameon=False, fontsize=12)
plt.subplots_adjust(left=0.2, right=0.97, top=0.88, bottom=0.12)
plt.savefig('e04_conditions.png'); plt.close()

# ---- รูป 2: ผลลัพธ์ 4 แบบ (ผ่าน / QC จับได้ / พังเงียบ / QC เตือนเกิน) ----
fig, axs = plt.subplots(1, 2, figsize=(13.33, 4.2), dpi=150)
for ax, D, nm in ((axs[0], A, 'v0.3'), (axs[1], B, 'v0.4')):
    tot = collections.Counter()
    for c in conds:
        for k in ('ok', 'caught', 'silent', 'false_alarm'): tot[k] += D[c][k]
    parts = [('ผ่าน', tot['ok'], C4 if nm == 'v0.4' else '#8a877d'), ('ไม่ผ่าน · QC จับได้ → ถ่ายใหม่/ลากมุม', tot['caught'], AMB),
             ('QC เตือนเกิน (ผลจริงดี)', tot['false_alarm'], '#93c5fd'), ('พังเงียบ (QC ปล่อยผ่าน)', tot['silent'], RED)]
    x = 0
    for lab, v, col in parts:
        ax.barh(0, v, left=x, color=col, height=0.4)
        if v / n > 0.06: ax.text(x + v / 2, 0, f'{v}', ha='center', va='center', color='white', fontsize=13, weight='bold')
        x += v
    ax.set_xlim(0, n); ax.set_ylim(-0.35, 1.05); ax.axis('off'); ax.set_title(nm, loc='left', fontsize=15, weight='bold', color=INK)
    for i, (lab, v, col) in enumerate(parts):
        yy = 0.95 - i * 0.16
        ax.add_patch(plt.Rectangle((0, yy - 0.05), n * 0.025, 0.1, color=col)); ax.text(n * 0.04, yy, f'{lab}: {v}', fontsize=11, va='center', color=INK)
fig.text(0.04, 0.92, 'สิ่งที่สำคัญกว่า "ผ่านกี่ %" คือ "พังแบบเงียบกี่รูป" — รูปที่ QC ปล่อยผ่านทั้งที่ผิด จะส่งต่อไป Phase 2 แบบผิดๆ', fontsize=12.5, color=INK)
plt.subplots_adjust(left=0.04, right=0.98, top=0.78, bottom=0.05, wspace=0.08)
plt.savefig('e04_outcomes.png'); plt.close()
print('ok', ta, tb, n)
