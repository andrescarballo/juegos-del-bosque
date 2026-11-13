import sys,json,struct,io
from PIL import Image
def shrink(src,dst,size=1024,q=88):
    d=open(src,'rb').read(); cl=struct.unpack('<I',d[12:16])[0]; j=json.loads(d[20:20+cl])
    bl=struct.unpack('<I',d[20+cl:24+cl])[0]; binc=d[28+cl:28+cl+bl]
    bvs=j['bufferViews']; data=[binc[b.get('byteOffset',0):b.get('byteOffset',0)+b['byteLength']] for b in bvs]
    for im in j.get('images',[]):
        i=im['bufferView']; p=Image.open(io.BytesIO(data[i])); mode=p.mode; dims=p.size
        p=p.convert('RGB'); p.thumbnail((size,size),Image.LANCZOS); o=io.BytesIO(); p.save(o,'JPEG',quality=q,optimize=True)
        data[i]=o.getvalue(); im['mimeType']='image/jpeg'; print('  tex',dims,mode,'->',p.size,len(data[i]))
    out=bytearray()
    for b,x in zip(bvs,data):
        while len(out)%4: out.append(0)
        b['byteOffset']=len(out); b['byteLength']=len(x); out+=x
    while len(out)%4: out.append(0)
    j['buffers'][0]['byteLength']=len(out)
    js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
    g=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(out))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(out),b'BIN\0')+bytes(out)
    open(dst,'wb').write(g); print(dst,len(g))
import os
os.makedirs('small',exist_ok=True)
for n,s in [('jabali','/home/claude/glb/boar.glb'),('cervatillo','/home/claude/fawn/Meshy_AI_Little_Fawn_20261110_character.glb')]+[(n,f'/home/claude/glb2/{n}.glb') for n in ('zorro','conejo','oveja','oso','erizo','buho')]:
    shrink(s,f'small/{n}.glb')
