# usage: check.sh name url  -> downloads to paint/<name>.png and prints how well it lines up with the render
curl -s -o paint/$1.png "$2"
python3 - "$1" <<'PY'
import cv2, numpy as np, sys
n=sys.argv[1]; r=cv2.imread('renders/'+n+'.png'); p=cv2.resize(cv2.imread('paint/'+n+'.png'),(r.shape[1],r.shape[0]),interpolation=cv2.INTER_AREA)
er=cv2.Canny(r,40,120); d=cv2.dilate(cv2.Canny(p,40,120),np.ones((7,7),np.uint8))
print(n,'lines up %.2f'%(((er>0)&(d>0)).sum()/(er>0).sum()))
PY
