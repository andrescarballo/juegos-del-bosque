import sys,json,struct
f=open(sys.argv[1],'rb'); d=f.read()
magic,ver,ln=struct.unpack('<4sII',d[:12]); cl,ct=struct.unpack('<II',d[12:20]); j=json.loads(d[20:20+cl])
print(magic,ver,ln,'json',cl)
print('gen',j.get('asset')); print('ext',j.get('extensionsUsed'),j.get('extensionsRequired'))
print('scenes',j.get('scenes'))
N=j.get('nodes',[])
print('nodes',len(N))
for i,n in enumerate(N): print(i,n.get('name'),'mesh' if 'mesh' in n else '', 'skin' if 'skin' in n else '', 'ch',n.get('children'), 't',n.get('translation'),'r',n.get('rotation'),'s',n.get('scale'))
A=j.get('accessors',[])
for m in j.get('meshes',[]):
    for p in m['primitives']:
        a=A[p['attributes']['POSITION']]; print('mesh',m.get('name'),'verts',a['count'],'min',a.get('min'),'max',a.get('max'),'idx',A[p['indices']]['count'] if 'indices' in p else None,list(p['attributes']),'mat',p.get('material'))
print('skins',[(s.get('name'),len(s['joints']),s.get('skeleton')) for s in j.get('skins',[])])
print('mats',json.dumps(j.get('materials'))[:800])
print('images',[(i.get('mimeType'),j['bufferViews'][i['bufferView']]['byteLength']) for i in j.get('images',[]) if 'bufferView' in i])
print('textures',len(j.get('textures',[])))
for a in j.get('animations',[]):
    t=max(A[s['input']]['max'][0] for s in a['samplers']); print('anim',a.get('name'),'channels',len(a['channels']),'dur',t)
