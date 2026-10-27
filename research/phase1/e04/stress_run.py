# python stress_run.py <fn> <out.jsonl>  · รันทุกเงื่อนไข × Dev 50 · resume ได้ · 2 process
import cv2, json, os, sys, time, numpy as np, multiprocessing as mp
import phase1 as p, stress as S
FN, OUT = sys.argv[1], sys.argv[2]
src = json.load(open('stress_src.json')); ref = json.load(open('bars_ref.json'))
D = '/mnt/user-data/uploads/EXAMER/dataset/jpg/0.กระดาษเปล่า/'
PTS = np.vstack([p.CANON[1:4], ref['L'], ref['R']]).astype(np.float32)
def job(a):
    ci, cond, fi, f = a
    im = cv2.imread(D + f); seed = 10007 * ci + fi
    img, G, meta = S.make(im, src[f]['Q'], src[f]['H'], cond, seed)
    t = time.time(); r, cl = getattr(p, FN)(img, ref); ms = (time.time() - t) * 1000
    o = dict(cond=cond, file=f, seed=seed, ms=round(ms), **meta, qc_max=r.get('qc_max'), fail=r.get('fail'), path=r.get('path'))
    if cl is not None and 'H_total' in r:
        e = S.reg_err(r['H_total'], G, PTS); o['reg_max'] = float(e.max()); o['reg_med'] = float(np.median(e))
    return o
if __name__ == '__main__':
    done = set()
    if os.path.exists(OUT): done = {(j['cond'], j['file']) for j in map(json.loads, open(OUT))}
    jobs = [(ci, c, fi, f) for ci, c in enumerate(S.CONDS) for fi, f in enumerate(sorted(src)) if (c, f) not in done]
    with mp.Pool(2) as pool, open(OUT, 'a') as fo:
        for o in pool.imap_unordered(job, jobs):
            fo.write(json.dumps(o) + '\n'); fo.flush()
    print('done', len(jobs))
