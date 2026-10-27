import cv2,json,numpy as np,phase1 as p,stress as S,matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
for f in ('/root/.fonts/PlexThai-400.ttf','/root/.fonts/PlexThai-700.ttf'): fm.fontManager.addfont(f)
plt.rcParams['font.family']=['PlexThai','DejaVu Sans']
from make_e04 import TH
src=json.load(open('stress_src.json')); ref=json.load(open('bars_ref.json'))
PTS=np.vstack([p.CANON[1:4],ref['L'],ref['R']]).astype(np.float32)
files=sorted(src); D='/mnt/user-data/uploads/EXAMER/dataset/jpg/0.กระดาษเปล่า/'
pick=['bg_white','rot_any','tilt','cut_corner','occlude','glare','mix']
fig,axs=plt.subplots(2,len(pick),figsize=(13.33,7.5),dpi=150,gridspec_kw=dict(height_ratios=[1,1.05]))
for j,c in enumerate(pick):
    ci=list(S.CONDS).index(c); fi=7; f=files[fi]
    img,G,meta=S.make(cv2.imread(D+f),src[f]['Q'],src[f]['H'],c,10007*ci+fi)
    r,cl=p.run_v04(img,ref); e=float(S.reg_err(r['H_total'],G,PTS).max()) if cl is not None else None
    axs[0,j].imshow(cv2.cvtColor(cv2.resize(img,None,fx=0.12,fy=0.12,interpolation=cv2.INTER_AREA),cv2.COLOR_BGR2RGB)); axs[0,j].set_title(TH[c],fontsize=11.5,weight='bold')
    if cl is not None: axs[1,j].imshow(cv2.resize(cl,(310,438),interpolation=cv2.INTER_AREA),cmap='gray',vmin=0,vmax=255)
    q=r.get('qc_max'); ok=e is not None and e<=8 and q is not None and q<=8
    tag=('ทางขอบกระดาษ' if r.get('path')=='paper' else 'ทางหมุด')
    axs[1,j].set_title(f"{tag}\nQC {q:.1f} px · GT {e:.1f} px" if q is not None and e is not None else f"{tag}\nQC ไม่ผ่าน → ลากมุมเอง",fontsize=10,color='#15803d' if ok else '#d97706')
    for a in axs[:,j]: a.axis('off')
fig.text(0.02,0.965,'ตัวอย่าง: รูปที่ถ่ายมา (บน) → หน้าสแกนที่ v0.4 ให้ (ล่าง) · แผ่นเดียวกัน 7 สภาพ',fontsize=15,weight='bold')
fig.text(0.02,0.93,'QC = แถบดำแถวคี่ที่ไม่ได้ใช้ fit · GT = ค่าคลาดจริงเทียบตำแหน่งที่รู้จากตอนสร้างภาพ · เกณฑ์ ≤ 8 px',fontsize=11,color='#6b6a65')
plt.subplots_adjust(left=0.01,right=0.99,top=0.86,bottom=0.02,wspace=0.06,hspace=0.25)
plt.savefig('e04_examples.png'); print('ok')
