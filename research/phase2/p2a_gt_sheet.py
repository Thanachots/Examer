# GT รายแผ่น (ไม่ใช้ detector ของ 2A): ฟิตแม่แบบตารางที่พิมพ์จริง (p2a_gt_printed.json) เข้ากับภาพเทาของแผ่นนั้น
#  1) เลื่อนทั้งตารางแนวตั้ง d ∈ [−40, 40] → เลือก d ที่ผลรวมความเข้มบนเส้นนอนทั้ง 40 เส้นมากสุด
#  2) ปรับทีละเส้นนอน ±6 px → จุดเข้มสุดของโปรไฟล์ (เฉลี่ยตามแนวนอนทั้งตาราง)
#  3) ในแต่ละแถว (ใช้แถบ 12 px ชิดเส้นบน/ล่าง): เลื่อนแนวนอน d ∈ [−40, 40] จากเส้นตั้ง 21 เส้น แล้วปรับทีละเส้น ±6 px
#  ช่อง = ภายในเส้น (กึ่งกลางเส้น ± 3 px) · นิยามเดียวกับ detector
import cv2, numpy as np
H = 3
def _prof_min(p, c, r):
    a = max(0, int(round(c)) - r); b = min(len(p), int(round(c)) + r + 1)
    return a + int(np.argmin(p[a:b]))
def gt_sheet(gray, GP):
    g = gray.astype(np.float32); py = np.convolve(g[:, 300:2200].mean(1), np.ones(3) / 3, 'same')
    L = [x for r in GP for x in (r['tc'], r['bc'])]
    d = min(range(-40, 41), key=lambda d: sum(py[int(round(y + d))] for y in L))
    out = []
    for r in GP:
        t = _prof_min(py, r['tc'] + d, 6); b = _prof_min(py, r['bc'] + d, 6)
        # ใช้แถบชิดขอบบน/ล่างของแถว (ลายมือมักอยู่กลางช่อง) → เส้นตั้งเด่นกว่าหมึก
        px = np.convolve(np.vstack([g[t + 6:t + 18, :], g[b - 17:b - 5, :]]).mean(0), np.ones(3) / 3, 'same')
        dx = min(range(-40, 41), key=lambda e: sum(px[int(round(x + e))] for x in r['vc']))
        vc = [_prof_min(px, x + dx, 6) for x in r['vc']]
        out.append(dict(top=[t, t], bot=[b, b], cells=[[vc[k] + H, t + H, vc[k + 1] - H, b - H] for k in range(20)]))
    return out
