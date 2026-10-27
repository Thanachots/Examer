# ประเมินบน val (อนุญาต 24 ต.ค. 21:20 · ใช้เลือกโมเดลเท่านั้น) · python eval_val.py <ชื่อ> <โมเดล.pt>
import sys, os, json, numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import p3train as P
t = np.load(f'{P.R}/phase3/data/val/letters.npz'); net = P.Net(); net.load_state_dict(torch.load(sys.argv[2], map_location='cpu'))
T = json.load(open(f'{P.R}/phase3/data/val/truth_override.json')); T.pop('_note')
r = P.evaluate(net, t, np.ones(len(t['Y']), bool), T); print('VAL', sys.argv[1], json.dumps(r)); json.dump(r, open(f'{P.R}/phase3/data/val_{sys.argv[1]}.json', 'w'))
