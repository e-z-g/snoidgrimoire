"""What the extraction project's Python makes of the disc, as JSON, for the
checks to hold js/ to. It imports the tools from reference/tools and never
changes them.

    python3 utilities/oracle.py archives   # every archive's directory
    python3 utilities/oracle.py bitmaps    # every tBMP, frame by frame
    python3 utilities/oracle.py scripts    # every SCRS and SCRB, parsed
    python3 utilities/oracle.py snoids     # all 625 Zoombinis standing, as
                                           # animate.py puts them together
"""
import hashlib, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'reference', 'tools'))
from mohawk_archive import MHK
import mohawk_bmp as MB
import mohawk_script as MS

DATA = os.path.join(ROOT, 'reference', 'disc', 'DATA')


def archives():
    return sorted(f[:-4] for f in os.listdir(DATA) if f.upper().endswith('.MHK'))


def directory(name):
    m = MHK(os.path.join(DATA, name + '.MHK'))
    out = []
    for tag, entries in m.res.items():
        for rid, idx, nm in entries:
            off, size, flags = m.filetab[idx - 1]
            out.append({'tag': tag, 'id': rid, 'index': idx, 'name': nm, 'offset': off, 'size': size})
    return out


def bitmaps(name):
    m = MHK(os.path.join(DATA, name + '.MHK'))
    out = []
    for rid, _, _ in m.res.get('tBMP', []):
        data = m.get('tBMP', rid)
        sheet = MB.compound_offsets(data) is not None
        frames = MB.decode_compound(data) if sheet else [MB.decode_single(data)]
        out.append({'id': rid, 'sheet': sheet, 'frames': [
            [f.width, f.height, hashlib.sha1(f.pixels).hexdigest()] for f in frames]})
    return out


def scripts(name):
    m = MHK(os.path.join(DATA, name + '.MHK'))
    out = []
    for tag, words in (('SCRS', 2), ('SCRB', 1)):
        for rid, _, _ in m.res.get(tag, []):
            sections, header = MS.parse(m.get(tag, rid), words)
            out.append({'tag': tag, 'id': rid, 'header': header, 'sections': None if sections is None else [
                {'records': [list(r) for r in s['records']], 'op': s['op'], 'sound': s['sound']} for s in sections]})
    return out


def snoids():
    """Every Zoombini as SCRS 100 stands it: animate.py's parts, frames and
    offsets, part by part in the order drawn."""
    import animate as A
    m = MHK(os.path.join(DATA, 'ZOOMBINI.MHK'))
    regs = A.load_regs(m, 890)
    sections, header = MS.parse(m.get('SCRS', 100), 2)
    recs = A.zoombini_records([tuple(r) for r in sections[0]['records']])
    ox, oy = recs[0][1], recs[0][2]
    out = []
    for n in range(625):
        z = {'hair': n // 125, 'eyes': n // 25 % 5, 'nose': n // 5 % 5, 'feet': n % 5}
        placed = []
        for part in A.draw_order(A.ZOOMBINI_ATLAS, recs):
            rel, x, y = recs[part['layer']]
            i = A.atlas_frame(part, z.get(part['name'], 0), rel)
            rx, ry = regs[i]
            placed.append([part['name'], i, x - ox - rx, y - oy - ry])
        out.append(placed)
    return out


if __name__ == '__main__':
    what = sys.argv[1]
    if what == 'snoids':
        json.dump(snoids(), sys.stdout)
        sys.exit()
    fn = {'archives': directory, 'bitmaps': bitmaps, 'scripts': scripts}[what]
    json.dump({n: fn(n) for n in archives()}, sys.stdout)
