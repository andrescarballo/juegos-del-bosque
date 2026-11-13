#!/usr/bin/env python3
"""Prepara para el juego los dos packs de naturaleza, los dos CC0 (dominio público):

  python3 herramientas/empaquetar_natura.py CARPETA_KAYKIT CARPETA_MEGAKIT

- KayKit Forest Nature Pack (Kay Lousberg): árboles, rocas, arbustos y hierba. Sus modelos se colorean con una
  textura-paleta; aquí ese color se pasa a los vértices y se guarda solo geometría + color en
  web/modelos/kaykit/<nombre>.glb. Sin texturas: una llamada de dibujo por modelo y se tiñe por estación.
- Stylized Nature MegaKit (Quaternius): solo lo que al otro le falta (flores, setas, helecho, trébol). Geometría con
  UV en web/modelos/natura/<nombre>.glb y sus tres texturas, reducidas, en web/modelos/natura/tex/.
Necesita Pillow.
"""
import json, os, struct, sys

KAYKIT = ['Tree_1_A', 'Tree_1_B', 'Tree_1_C', 'Tree_2_A', 'Tree_2_B', 'Tree_2_C', 'Tree_2_D', 'Tree_3_A', 'Tree_3_B', 'Tree_4_A', 'Tree_4_B', 'Tree_4_C',
          'Tree_Bare_1_A', 'Tree_Bare_1_C', 'Tree_Bare_2_B', 'Rock_1_A', 'Rock_1_D', 'Rock_1_G', 'Rock_2_B', 'Rock_2_C', 'Rock_2_D', 'Rock_3_A', 'Rock_3_E', 'Rock_3_G', 'Rock_3_K',
          'Bush_1_C', 'Bush_1_D', 'Bush_1_F', 'Bush_2_C', 'Bush_3_A', 'Bush_3_B', 'Bush_4_C', 'Grass_1_A', 'Grass_1_B', 'Grass_1_C', 'Grass_2_B']
MODELOS = ['Fern_1', 'Plant_7_Big', 'Clover_1', 'Mushroom_Common', 'Flower_3_Group', 'Flower_3_Single', 'Flower_4_Group']
# textura del kit -> (archivo de salida, tamaño)
TEXTURAS = {'Leaves.png': ('Leaves.png', 512), 'Flowers.png': ('Flowers.png', 512), 'Mushrooms.png': ('Mushrooms.jpg', 512)}

def glb(destino, g, datos):
    txt = json.dumps(g, separators=(',', ':')).encode()
    while len(txt) % 4: txt += b' '
    with open(destino, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(txt) + 8 + len(datos)))
        f.write(struct.pack('<I4s', len(txt), b'JSON')); f.write(txt)
        f.write(struct.pack('<I4s', len(datos), b'BIN\0')); f.write(datos)

def lineal(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def con_color(origen, destino, paleta):
    """KayKit: el color de cada vértice sale de la paleta, en el punto que dice su UV."""
    j = json.load(open(origen))
    datos = open(os.path.splitext(origen)[0] + '.bin', 'rb').read()
    W, H = paleta.size; px = paleta.load()
    def leer(i, fmt, n):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        ini = bv.get('byteOffset', 0) + a.get('byteOffset', 0); paso = bv.get('byteStride') or struct.calcsize(fmt) * n
        return [struct.unpack_from('<%d%s' % (n, fmt), datos, ini + k * paso) for k in range(a['count'])]
    nuevo, vistas, accesores, prims = bytearray(), [], [], []
    def meter(valores, fmt, n, tipo, comp, minmax=False):
        while len(nuevo) % 4: nuevo.append(0)
        ini = len(nuevo)
        for v in valores: nuevo.extend(struct.pack('<%d%s' % (n, fmt), *v))
        vistas.append({'buffer': 0, 'byteOffset': ini, 'byteLength': len(nuevo) - ini})
        a = {'bufferView': len(vistas) - 1, 'componentType': comp, 'count': len(valores), 'type': tipo}
        if minmax: a['min'] = [min(v[k] for v in valores) for k in range(n)]; a['max'] = [max(v[k] for v in valores) for k in range(n)]
        accesores.append(a); return len(accesores) - 1
    for m in j['meshes']:
        for p in m['primitives']:
            pos = leer(p['attributes']['POSITION'], 'f', 3); nor = leer(p['attributes']['NORMAL'], 'f', 3); uv = leer(p['attributes']['TEXCOORD_0'], 'f', 2)
            ia = j['accessors'][p['indices']]; idx = leer(p['indices'], {5123: 'H', 5125: 'I', 5121: 'B'}[ia['componentType']], 1)
            col = []
            for u, v in uv:
                r, g, b = px[min(W - 1, max(0, int((u % 1.0) * W))), min(H - 1, max(0, int((v % 1.0) * H)))][:3]
                col.append((lineal(r), lineal(g), lineal(b)))
            prims.append({'attributes': {'POSITION': meter(pos, 'f', 3, 'VEC3', 5126, True), 'NORMAL': meter(nor, 'f', 3, 'VEC3', 5126), 'COLOR_0': meter(col, 'f', 3, 'VEC3', 5126)},
                          'indices': meter(idx, 'I', 1, 'SCALAR', 5125)})
    while len(nuevo) % 4: nuevo.append(0)
    glb(destino, {'asset': {'version': '2.0', 'generator': 'empaquetar_natura.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
                  'meshes': [{'primitives': prims}], 'accessors': accesores, 'bufferViews': vistas, 'buffers': [{'byteLength': len(nuevo)}]}, nuevo)

def empaquetar(origen, destino):
    j = json.load(open(origen))
    datos = open(os.path.splitext(origen)[0] + '.bin', 'rb').read()
    nuevo, vistas, accesores, mapaA = bytearray(), [], [], {}
    def accesor(i):
        if i in mapaA: return mapaA[i]
        a = dict(j['accessors'][i]); bv = j['bufferViews'][a['bufferView']]
        ini = bv.get('byteOffset', 0); trozo = datos[ini:ini + bv['byteLength']]
        while len(nuevo) % 4: nuevo.append(0)
        v = {'buffer': 0, 'byteOffset': len(nuevo), 'byteLength': len(trozo)}
        if 'byteStride' in bv: v['byteStride'] = bv['byteStride']
        if 'target' in bv: v['target'] = bv['target']
        nuevo.extend(trozo); vistas.append(v)
        a['bufferView'] = len(vistas) - 1; accesores.append(a); mapaA[i] = len(accesores) - 1
        return mapaA[i]
    mallas = []
    for m in j['meshes']:
        prims = []
        for p in m['primitives']:
            at = {k: accesor(v) for k, v in p['attributes'].items() if k in ('POSITION', 'NORMAL', 'TEXCOORD_0')}
            q = {'attributes': at, 'material': p.get('material', 0)}
            if 'indices' in p: q['indices'] = accesor(p['indices'])
            prims.append(q)
        mallas.append({'name': m.get('name', ''), 'primitives': prims})
    while len(nuevo) % 4: nuevo.append(0)
    g = {'asset': {'version': '2.0', 'generator': 'empaquetar_natura.py'}, 'scene': 0, 'scenes': j['scenes'], 'nodes': j['nodes'],
         'materials': [{'name': m['name']} for m in j.get('materials', [])], 'meshes': mallas, 'accessors': accesores, 'bufferViews': vistas,
         'buffers': [{'byteLength': len(nuevo)}]}
    glb(destino, g, nuevo)

if __name__ == '__main__':
    from PIL import Image
    kaykit, kit = sys.argv[1], sys.argv[2]
    web = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'modelos')
    os.makedirs(os.path.join(web, 'kaykit'), exist_ok=True); os.makedirs(os.path.join(web, 'natura', 'tex'), exist_ok=True)
    paleta = Image.open(os.path.join(kaykit, 'Textures', 'forest_texture.png')).convert('RGB')
    for n in KAYKIT:
        con_color(os.path.join(kaykit, 'Assets', 'gltf', n + '_Color1.gltf'), os.path.join(web, 'kaykit', n + '.glb'), paleta)
    for n in MODELOS:
        empaquetar(os.path.join(kit, 'glTF', n + '.gltf'), os.path.join(web, 'natura', n + '.glb'))
    for origen, (salida, lado) in TEXTURAS.items():
        im = Image.open(os.path.join(kit, 'Textures', origen))
        im = im.resize((lado, lado), Image.LANCZOS)
        if salida.endswith('.jpg'): im.convert('RGB').save(os.path.join(web, 'natura', 'tex', salida), quality=88)
        else: im.save(os.path.join(web, 'natura', 'tex', salida), optimize=True)
    print(len(KAYKIT), 'modelos de KayKit,', len(MODELOS), 'del MegaKit y', len(TEXTURAS), 'texturas en', os.path.normpath(web))
