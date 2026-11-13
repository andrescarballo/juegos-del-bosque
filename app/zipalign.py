#!/usr/bin/env python3
"""zipalign mínimo: alinea a 4 bytes los ficheros sin comprimir (resources.arsc, png, etc.)
como exige Android 11+. Uso: python3 zipalign.py entrada.apk salida.apk"""
import sys
import zipfile

ALIGN = 4


def main(src, dst):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            new = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            new.compress_type = info.compress_type
            new.external_attr = info.external_attr
            new.create_system = info.create_system
            extra = b""
            if info.compress_type == zipfile.ZIP_STORED:
                name_len = len(info.filename.encode("utf-8"))
                offset = zout.fp.tell() + 30 + name_len
                pad = (-offset) % ALIGN
                extra = b"\x00" * pad
            new.extra = extra
            zout.writestr(new, data)
    # comprobación
    with zipfile.ZipFile(dst) as z:
        for info in z.infolist():
            if info.compress_type == zipfile.ZIP_STORED:
                start = info.header_offset + 30 + len(info.filename.encode("utf-8")) + len(info.extra)
                assert start % ALIGN == 0, info.filename


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
