"""What the extraction project's Python makes of the disc, as JSON, for the
checks to hold js/ to. It imports the tools from reference/tools, or from
$ZB_TOOLS (a front's own, before it lands), and never changes them.

    python3 utilities/oracle.py archives   # every archive's directory
    python3 utilities/oracle.py bitmaps    # every tBMP, frame by frame
    python3 utilities/oracle.py scripts    # every SCRS and SCRB, parsed
    python3 utilities/oracle.py snoids     # all 625 Zoombinis standing, as
                                           # animate.py puts them together
    python3 utilities/oracle.py snoidticks # every snoid script's ticks, each
                                           # record the part animate.py fits
"""
import hashlib, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ.get('ZB_TOOLS') or os.path.join(ROOT, 'reference', 'tools'))
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


def snoidticks():
    """Every snoid script on the disc (layout words 0-3), tick by tick: each
    record as [part, pose, x, y], the part being the one animate.py draws it
    as (its fitted profile swap for a Zoombini, split_effects for the
    tumble, whose effects are 'effect'), or None for a tick it draws
    nothing of. And animate.py's blocks, part by part: [bases, poses]."""
    import animate as A
    kinds = {0: A.ZOOMBINI_ATLAS, 1: A.ZOOMBINI_ATLAS, 2: A.ZOOMBINI_TUMBLE_ATLAS, 3: A.FLEENS_ATLAS}
    out = {'blocks': {}, 'scripts': {}}
    for word, kind in ((0, 'zoombini'), (2, 'tumble'), (3, 'fleen')):
        out['blocks'][kind] = {p['name']: [p['bases'], [A.pose_count(p, v) for v in range(len(p['bases']))]]
                               for p in kinds[word]}
    for name in archives():
        m = MHK(os.path.join(DATA, name + '.MHK'))
        for rid, _, _ in m.res.get('SCRS', []):
            sections, header = MS.parse(m.get('SCRS', rid), 2)
            word = header[1]
            if word not in kinds:
                continue
            by_layer = {p['layer']: p['name'] for p in kinds[word]}
            ticks = []
            for sec in sections:
                recs = [tuple(r) for r in sec['records']]
                if word == 2:
                    split = MS.split_effects(recs)
                    if sum(1 for r in split if r[0] is not None) != 5:
                        ticks.append(None); continue
                    ticks.append([[by_layer[sl] if sl is not None else 'effect', f, x, y] for sl, f, x, y in split])
                elif len(recs) != 5:
                    ticks.append(None)
                else:
                    if word != 3:
                        recs = A.zoombini_records(recs)
                    ticks.append([[by_layer[k], f, x, y] for k, (f, x, y) in enumerate(recs)])
            out['scripts']['%s/%d' % (name, rid)] = ticks
    return out


if __name__ == '__main__':
    what = sys.argv[1]
    if what in ('snoids', 'snoidticks'):
        json.dump(snoids() if what == 'snoids' else snoidticks(), sys.stdout)
        sys.exit()
    fn = {'archives': directory, 'bitmaps': bitmaps, 'scripts': scripts}[what]
    json.dump({n: fn(n) for n in archives()}, sys.stdout)
