import sys,json,struct,numpy as np
d=open(sys.argv[1],'rb').read(); cl=struct.unpack('<I',d[12:16])[0]; j=json.loads(d[20:20+cl]); N=j['nodes']
def M(n):
    t=n.get('translation',[0,0,0]); x,y,z,w=n.get('rotation',[0,0,0,1]); s=n.get('scale',[1,1,1])
    R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    m=np.eye(4); m[:3,:3]=R*np.array(s); m[:3,3]=t; return m
par={}; S=float(sys.argv[3]) if len(sys.argv)>3 else 1
for i,n in enumerate(N):
    for c in n.get('children',[]) or []: par[c]=i
def W(i): return (W(par[i]) if i in par else np.eye(4))@M(N[i])
def show(i,dep=0):
    p=W(i)[:3,3]; print('  '*dep+f"{N[i].get('name')}  pos=({p[0]*S:+.2f},{p[1]*S:+.2f},{p[2]*S:+.2f})")
    for c in N[i].get('children',[]) or []: show(c,dep+1)
show(int(sys.argv[2]))
