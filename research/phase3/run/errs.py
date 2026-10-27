import sys, os, numpy as np, torch, collections
sys.path.insert(0, 'phase3/run'); sys.argv = ['x']
exec(open('phase3/run/p3train.py', encoding='utf-8').read().split("if __name__ == '__main__':")[0])
net = Net(); net.load_state_dict(torch.load('../feas/m_line.pt', map_location='cpu'))
h, t = load(); p, _ = predb(net, t['X']); rows = {}
for i in range(len(p)): rows.setdefault((str(t['SH'][i]), int(t['RI'][i])), []).append(i)
cnt = collections.Counter()
for (sh, ri), ii in sorted(rows.items()):
    ii = sorted(ii, key=lambda i: t['K'][i]); s = ''.join(chr(65 + p[i]) for i in ii); e = L.expected(ri)
    if s != e:
        cnt[L.side(ri)] += 1
        if L.side(ri) in sys.argv[1:] or True: print(L.side(ri), sh, ri, s, e)
