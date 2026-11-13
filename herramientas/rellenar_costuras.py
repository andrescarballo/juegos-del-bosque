#!/usr/bin/env python3
"""Quita las costuras de los animales: las texturas de Meshy son islas sueltas sobre fondo negro y, al verse
pequeñas (mipmaps), ese negro se mezcla en los bordes y se ven las uniones de los polígonos.

Además, Meshy deja una raya clara pintada a lo largo de las aristas de los triángulos: esos píxeles
(las aristas, dibujadas en el mapa UV) se repintan con el color de alrededor.

Qué es "fondo" se saca de los propios triángulos (se pintan sus UV en una máscara), NO del color:
así los ojos y la nariz, que son oscuros, no se tocan. El fondo se rellena con el color medio de la isla
más cercana (dilatación) y se reescribe el GLB.

  python3 herramientas/rellenar_costuras.py web/modelos/animales/*.glb
Necesita Pillow y numpy. Pasarlo sobre los GLB originales (los del zip), no sobre los ya arreglados.
"""
import io
import json
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TIPOS = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
COMPS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def leer(j, binario, i):
    a = j['accessors'][i]
    v = j['bufferViews'][a['bufferView']]
    n, c = a['count'], COMPS[a['type']]
    dt = np.dtype(TIPOS[a['componentType']]).newbyteorder('<')
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    paso = v.get('byteStride', dt.itemsize * c)
    raw = np.frombuffer(binario, dtype=np.uint8, count=paso * (n - 1) + dt.itemsize * c, offset=o)
    filas = np.lib.stride_tricks.as_strided(raw, shape=(n, dt.itemsize * c), strides=(paso, 1))
    return np.ascontiguousarray(filas).view(dt).reshape(n, c).astype(np.float64)


def mascara_uv(j, binario, imagen, tam, grosor=3):
    """(píxeles que tapa algún triángulo que usa esa imagen, píxeles sobre las aristas de los triángulos)"""
    w, h = tam
    m = Image.new('L', tam, 0)
    d = ImageDraw.Draw(m)
    ma = Image.new('L', tam, 0)
    da = ImageDraw.Draw(ma)
    texs = j.get('textures', [])
    mats = [k for k, mt in enumerate(j.get('materials', []))
            if texs[mt.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index', 0)].get('source') == imagen]
    for malla in j['meshes']:
        for p in malla['primitives']:
            if p.get('material') not in mats or 'TEXCOORD_0' not in p['attributes']:
                continue
            uv = leer(j, binario, p['attributes']['TEXCOORD_0'])
            idx = leer(j, binario, p['indices'])[:, 0].astype(int) if 'indices' in p else np.arange(len(uv))
            px = np.column_stack([uv[:, 0] * w, uv[:, 1] * h])   # glTF: v=0 arriba, igual que la imagen
            for t in idx.reshape(-1, 3):
                pts = [tuple(px[k]) for k in t]
                d.polygon(pts, fill=255, outline=255)
                da.line(pts + [pts[0]], fill=255, width=grosor)
    return np.array(m) > 0, np.array(ma) > 0


def rellenar(img, tapado, pasadas=40):
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    lleno = tapado.copy()
    col = np.where(lleno[..., None], a, 0)
    for _ in range(pasadas):
        if lleno.all():
            break
        suma = np.zeros_like(col); cuenta = np.zeros(lleno.shape, np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            suma += np.roll(col, (dy, dx), (0, 1)); cuenta += np.roll(lleno, (dy, dx), (0, 1))
        nuevo = (~lleno) & (cuenta > 0)
        col[nuevo] = suma[nuevo] / cuenta[nuevo][:, None]
        lleno |= nuevo
    # Lo que quede lejos de todo, gris medio de la textura
    col[~lleno] = a[tapado].mean(0)
    return Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))


def procesar(ruta):
    d = open(ruta, 'rb').read()
    magic, _, _ = struct.unpack('<4sII', d[:12])
    assert magic == b'glTF'
    jl, _ = struct.unpack('<II', d[12:20])
    j = json.loads(d[20:20 + jl])
    o = 20 + jl
    bl, _ = struct.unpack('<II', d[o:o + 8])
    binario = d[o + 8:o + 8 + bl]
    vistas = [bytes(binario[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]) for v in j['bufferViews']]
    for k, im in enumerate(j.get('images', [])):
        if 'bufferView' not in im:
            continue
        i = im['bufferView']
        img = Image.open(io.BytesIO(vistas[i]))
        tapado, aristas = mascara_uv(j, binario, k, img.size)
        # Meshy pinta una raya clara a lo largo de cada arista: se repinta con el color de al lado
        # Filtro de mediana: borra rayas finas pero respeta el borde entre dos colores (boca, ojos)
        img = img.convert('RGB')
        med = np.asarray(img.filter(ImageFilter.MedianFilter(7)))
        a = np.asarray(img).copy()
        a[aristas & tapado] = med[aristas & tapado]
        limpio = Image.fromarray(a)
        out = io.BytesIO()
        rellenar(limpio, tapado).save(out, 'JPEG', quality=92)
        vistas[i] = out.getvalue()
        im['mimeType'] = 'image/jpeg'
        print(f'  {ruta}: {tapado.mean() * 100:.0f}% de la textura es modelo')
    nuevo = bytearray()
    for v, datos in zip(j['bufferViews'], vistas):
        while len(nuevo) % 4:
            nuevo.append(0)
        v['byteOffset'] = len(nuevo)
        v['byteLength'] = len(datos)
        nuevo += datos
    while len(nuevo) % 4:
        nuevo.append(0)
    j['buffers'][0]['byteLength'] = len(nuevo)
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(nuevo)
    with open(ruta, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(nuevo), 0x004E4942)); f.write(nuevo)
    print(ruta, len(d) // 1024, '->', total // 1024, 'KB')


if __name__ == '__main__':
    for r in sys.argv[1:]:
        procesar(r)
