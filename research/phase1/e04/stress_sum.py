import json, sys, collections, statistics as st
def load(fn):
    return [json.loads(l) for l in open(fn)]
def summ(rows):
    out = collections.OrderedDict()
    for r in rows:
        d = out.setdefault(r['cond'], dict(n=0, ok=0, caught=0, silent=0, false_alarm=0, ms=[]))
        d['n'] += 1; d['ms'].append(r['ms'])
        good = r.get('reg_max') is not None and r['reg_max'] <= 8
        qc_pass = r.get('qc_max') is not None and r['qc_max'] <= 8 and not r.get('fail')
        if good and qc_pass: d['ok'] += 1
        elif good: d['false_alarm'] += 1
        elif qc_pass: d['silent'] += 1
        else: d['caught'] += 1
    for d in out.values(): d['ms'] = round(st.median(d['ms']))
    return out
if __name__ == '__main__':
    for fn in sys.argv[1:]:
        rows = load(fn); s = summ(rows); print(fn, len(rows))
        tot = collections.Counter()
        for c, d in s.items():
            print(f"{c:11s} ok {d['ok']:2d}/{d['n']} caught {d['caught']:2d} silent {d['silent']:2d} false_alarm {d['false_alarm']:2d} ms {d['ms']}")
            for k in ('n', 'ok', 'caught', 'silent', 'false_alarm'): tot[k] += d[k]
        print('TOTAL', dict(tot))
