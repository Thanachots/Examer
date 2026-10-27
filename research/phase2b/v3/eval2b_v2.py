# ประเมิน 2B v2 บนชุดในช่อง (val|test) ด้วยป้ายเดิมของ v1 · python eval2b_v2.py <model.pt> <split>
import sys, json, math, hashlib, numpy as np, torch
MP, SPLIT = sys.argv[1], sys.argv[2]; sys.argv = ['x', 'x.pt', '1']
src = open('train2b_v3.py').read().split("if __name__")[0]; exec(src)
ids = [i for i, m in enumerate(M) if m['split'] == SPLIT and Y0[i] >= 0]
net = Net(); net.load_state_dict(torch.load(MP)); P = predict(net, X[ids]); yp = P.argmax(1); yt = Y0[ids]
def wil(k, n, z=1.96):
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return round(100 * (c - h), 2), round(100 * (c + h), 2)
def rep(yt, yp):
    out = {'n': int(len(yt)), 'acc': round(float((yt == yp).mean()), 6), 'acc_ci': wil(int((yt == yp).sum()), len(yt))}
    for c, cn in enumerate(['empty', 'char', 'strike']):
        tp = int(((yp == c) & (yt == c)).sum()); fp = int(((yp == c) & (yt != c)).sum()); fn = int(((yp != c) & (yt == c)).sum())
        p = tp / (tp + fp) if tp + fp else 0; r = tp / (tp + fn) if tp + fn else 0
        out[cn] = dict(P=round(p, 4), R=round(r, 4), F1=round(2 * p * r / (p + r), 4) if p + r else 0, tp=tp, fp=fp, fn=fn, R_ci=wil(tp, tp + fn) if tp + fn else None)
    out['cm'] = [[int(((yt == a) & (yp == b)).sum()) for b in range(3)] for a in range(3)]; return out
R = {'model': MP, 'sha256': hashlib.sha256(open(MP, 'rb').read()).hexdigest(), 'split': SPLIT, 'all': rep(yt, yp)}
for fo in ('Edge', 'Horizontal', 'Words'):
    s = np.array([M[i]['folder'].startswith(fo) for i in ids]); R[fo] = rep(yt[s], yp[s])
R['errors'] = [[M[i]['file'], M[i]['row'], M[i]['col'], int(Y0[i]), int(p)] for i, p in zip(ids, yp) if Y0[i] != p]
print(json.dumps({k: R[k] for k in ('split', 'sha256', 'all')}, ensure_ascii=False)); print('errors', R['errors'][:20])
json.dump(R, open(f'eval_{SPLIT}_v2.json', 'w'), ensure_ascii=False)
