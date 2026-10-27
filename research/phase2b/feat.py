import numpy as np
def maxrun(b):
    # b: bool HxW → ความยาว run แนวนอนยาวสุดต่อแถว (ยอมช่องว่าง 2 px)
    out = np.zeros(b.shape[0], int)
    for y in range(b.shape[0]):
        r = best = gap = 0
        for v in b[y]:
            if v: r += 1 + gap; gap = 0
            elif r and gap < 2: gap += 1
            else: r = gap = 0
            best = max(best, r)
        out[y] = best
    return out
def strike_feat(x):
    b = x < 150
    mr = maxrun(b)
    return mr[14:50].max()
