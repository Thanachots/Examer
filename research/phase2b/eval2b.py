# ประเมิน 2B: python eval2b.py <model.pt> <val|test>  → ตัวชี้วัดต่อคลาส + confusion + Wilson CI · เทียบวิธีเส้นนอนยาว (baseline)
import sys, json, math, numpy as np, torch, importlib.util, hashlib
sys.argv, MP, SPLIT = [sys.argv[0], '', 'x.pt', '1'], sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location('T', 'train2b.py'); T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
Y = np.load('Y.npy'); F = np.load('F.npy'); M = T.M
ids = [i for i, m in enumerate(M) if m['split'] == SPLIT and Y[i] >= 0]
net = T.Net(); net.load_state_dict(torch.load(MP)); P = T.predict(net, ids); yp = P.argmax(1); yt = Y[ids]
base = np.array([0 if Y[i] == 0 and False else (2 if F[i] >= 38 else 1) for i in ids]); base[np.array([T.D[i][10:54, 10:54].__lt__(150).mean() < 0.004 for i in ids])] = 0
def wil(k, n, z=1.96):
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return round(100 * (c - h), 2), round(100 * (c + h), 2)
def rep(name, yt, yp):
    out = {'n': int(len(yt)), 'acc': float((yt == yp).mean()), 'acc_ci': wil(int((yt == yp).sum()), len(yt))}
    for c, cn in enumerate(['empty', 'char', 'strike']):
        tp = int(((yp == c) & (yt == c)).sum()); fp = int(((yp == c) & (yt != c)).sum()); fn = int(((yp != c) & (yt == c)).sum())
        p = tp / (tp + fp) if tp + fp else 0; r = tp / (tp + fn) if tp + fn else 0
        out[cn] = dict(P=round(p, 4), R=round(r, 4), F1=round(2 * p * r / (p + r), 4) if p + r else 0, tp=tp, fp=fp, fn=fn, n=int((yt == c).sum()), R_ci=wil(tp, tp + fn) if tp + fn else None)
    out['macro_f1'] = round(np.mean([out[c]['F1'] for c in ('empty', 'char', 'strike')]), 4)
    out['cm'] = [[int(((yt == a) & (yp == b)).sum()) for b in range(3)] for a in range(3)]
    print(name, json.dumps(out, ensure_ascii=False)); return out
R = {'model': MP, 'model_sha256': hashlib.sha256(open(MP, 'rb').read()).hexdigest(), 'split': SPLIT}
R['cnn_all'] = rep('CNN ทั้งหมด', yt, yp); R['base_all'] = rep('baseline ทั้งหมด', yt, base)
for fo in ('Edge', 'Horizontal', 'Words'):
    s = np.array([M[i]['folder'].startswith(fo) for i in ids])
    if s.any(): R['cnn_' + fo] = rep('CNN ' + fo, yt[s], yp[s])
R['errors'] = [[int(i), M[i]['file'], M[i]['row'], M[i]['col'], int(Y[i]), int(p)] for i, p in zip(ids, yp) if Y[i] != p]
json.dump(R, open(f'eval_{SPLIT}_{MP[:-3]}.json', 'w'), ensure_ascii=False)
