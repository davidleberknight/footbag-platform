# Leg-parity tracer for down-family JOBs.
# Hypothesis under test: SAME/OP tokens are relative to the PREVIOUS leg contact
# (body tokens like SPIN/DIVE do not change the anchor leg). If true, the
# absolute side-topology (entry surface+side vs catch side) is recoverable and
# is the representation-independent base discriminator.
import csv, re
from pathlib import Path

# Evidence source: the FB.org scrape, resolved relative to the repo root so the
# script runs from anywhere inside the checkout.
SCRAPE = Path(__file__).resolve().parents[2] / 'legacy_data' / 'out' / 'scraped_footbag_moves.csv'

def trace(job):
    segs = [s.strip() for s in job.split('>')]
    entry = segs[0].split()[0]           # TOE or CLIP
    cur = 'R'                            # entry side normalized to R
    legs = []                            # leg of each dex contact, in order
    catch = None
    for seg in segs[1:]:
        seg_clean = re.sub(r'\([^)]*\)', '', seg).strip()   # drop (back)/(plant)/(no plant while)
        if not seg_clean:
            continue
        first = seg_clean.split()[0]
        is_catch = '[DEL]' in seg or 'CLIP [XBD]' in seg or seg_clean.startswith(('SAME CLIP','OP CLIP','SAME TOE'))
        if first == 'SAME':
            leg = cur
        elif first == 'OP':
            leg = 'L' if cur == 'R' else 'R'
        else:
            continue                     # body-only token (SPIN/DIVE): anchor unchanged
        cur = leg
        if is_catch:
            catch = leg
        elif '[DEX]' in seg:
            legs.append(leg)
    topo = 'cross' if catch != 'R' else 'same'
    cell = {('TOE','cross'):'DOD', ('CLIP','same'):'DDD',
            ('TOE','same'):'PARADON-cell', ('CLIP','cross'):'CELL-4'}[(entry, topo)]
    return entry, legs, catch, topo, cell

with open(SCRAPE) as f:
    for r in csv.DictReader(f):
        blob = (r['source_name']+' '+r['alt_name']).lower()
        if not ('double' in blob and 'down' in blob) and r['source_name'] not in ('Paradon',):
            continue
        for i, variant in enumerate(r['notation'].split(' or ')):
            entry, legs, catch, topo, cell = trace(variant)
            tag = f" (variant {chr(65+i)})" if ' or ' in r['notation'] else ''
            print(f"[{r['showmove_id']:>3}] {r['source_name']}{tag}")
            print(f"      alt: {r['alt_name'] or '-'}")
            print(f"      entry {entry}(R) | dex legs {','.join(legs)} | catch {catch} | {topo}-side -> {cell}")
