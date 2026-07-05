#!/usr/bin/env python3
import json, re, csv, io, sys

SRC = "src/content/freestyleObservationalUniverse.ts"

rows = []
for line in open(SRC):
    s = line.strip().rstrip(",")
    if s.startswith("{") and s.endswith("}"):
        try:
            rows.append(json.loads(s))
        except Exception:
            pass

CARD = {"ready", "frontier", "doctrine"}
rows = [r for r in rows if r.get("section") in CARD]

# Settled token vocabulary (mirrors freestyleService KNOWN_FRONTIER_TOKENS).
KNOWN = set("""
toe stall clipper clip around world atw orbit legover leg over pickup mirage illusion butterfly osis whirl swirl sole
blender torque drifter dyno barfly eclipse flail guay eggbeater dada curve da paradon flurry blur fog smoke smog haze
fury nemesis royale mobius bubba witchdoctor spyro hatchet smear magellan infinity flapper bar rake scoop neutron
pogo terraging terrage blurry blurrier blurriest furious barraging sailing shooting frantic nuclear atomic quantum
illusioning miraging whirling swirling gyro flailing surfing slicing splicing warping railing rooted floating tapping
backside inspinning spinning stepping ducking diving symposium paradox fairy pixie blistering surging
far near op os reverse rev same ss double triple down up set kick side front back inside outside cross body in out
dex xbd bs dod ddd plo dlo dso pdx bod del uns xdex symp inward outward wo crossbody hopover ps twirl arctic pinching
pincher muted flying ripwalk blizzard refraction barrage
""".split())
TYPO = {"butterfy":"butterfly","baragging":"barraging","royall":"royale","eggbeating":"eggbeater"}

# Genuinely undefined / unresolved-doctrine operators (as of 2026-06-30).
UNDEFINED = {"weaving","zulu","motion","locomotion","swivel","alpine","fusing","dragon","slapping","void"}
# Note: rooted/rooting SETTLED (0 ADD); fusion-as-compound settled; sailing/frantic are
# identification (Needs Curator Review), not undefined-operator.

RECEIVERS = {"mirage","illusion","whirl","torque","drifter"}
POSITIONAL = {"ss","near","far","op","os"}

def toks(name):
    return re.findall(r"[a-z]+", name.split("(")[0].lower())

def undefined_ops(name):
    t = set(toks(name))
    return sorted(o for o in UNDEFINED if o in t)

def is_dod(name, cluster):
    if cluster == "dod-ddd":
        return True
    low = name.lower()
    tl = toks(name)
    return ("double down" in low or "double over down" in low or "over down" in low
            or "ddd" in tl or "dod" in tl or "pod" in low.split() or "pixie over down" in low)

def classify(r):
    name = r["name"]; cluster = r.get("cluster",""); fc = r.get("failureClass","")
    ib = r.get("intakeBucket",""); decomp = r.get("decomposition",""); t = toks(name)
    parens = re.findall(r"\(([^)]+)\)", name)
    flags = []
    if any(p in t for p in POSITIONAL) or "opposite" in name.lower() or "same side" in name.lower():
        flags.append("positional_variant")
    if ib in ("duplicate_variant","alias","equivalence","low_confidence"):
        flags.append("duplicate_or_alias_candidate")

    # 1. Doctrine Blocked — undefined operator or open doctrine (weaving)
    undef = undefined_ops(name)
    if undef or cluster == "weaving":
        op = "weaving" if (cluster == "weaving" and "weaving" not in undef) else ",".join(undef or ["weaving"])
        return "Doctrine Blocked", flags, f"Red ruling / operator definition pending: {op}", \
               f"undefined or open-doctrine operator ({op})"

    # special: Rooting/Rooted is settled (0 ADD) — out of Doctrine Blocked
    if name.lower().startswith("rooting") or name.lower().startswith("rooted"):
        flags.append("verification_needed")
        return "Ready for Authoring", flags, "Author notation; rooted = settled set, 0 ADD", \
               "rooted is a settled set-primitive (0 ADD); stale doctrine flag"

    # 2. DOD / DDD down-family — curator verification, not a Red ruling
    if is_dod(name, cluster):
        if "verification_needed" not in flags: flags.append("verification_needed")
        return "Needs Curator Review", flags, \
               "Curator verifies down-family decomposition (DOD vs DDD; down structure)", \
               "down-family terminal; structure understood, per-trick verification pending"

    # 3. Parser Limitation — genuine syntax/terminal-mechanic gap
    if fc in ("ambiguous-terminal-mechanic","parser-ambiguity","unresolved-directional-syntax"):
        return "Parser Limitation", flags, "Resolve terminal/directional notation syntax", \
               f"genuine parser gap ({fc})"
    if fc == "compression-ambiguity":
        unknown = [x for x in t if len(x) > 1 and TYPO.get(x,x) not in KNOWN]
        if len(parens) >= 2:
            for f in ("duplicate_or_alias_candidate","verification_needed"):
                if f not in flags: flags.append(f)
            return "Needs Curator Review", flags, "Curator selects canonical identity among candidates", \
                   f"multiple candidate identities ({len(parens)} folk aliases)"
        if unknown:
            if "verification_needed" not in flags: flags.append("verification_needed")
            return "Needs Curator Review", flags, "Curator identifies the unresolved base/reading", \
                   f"unresolved token(s): {','.join(unknown)}"
        return "Ready for Authoring", flags, "Author operational notation; reading determined", \
               "all operators settled; compression-ambiguity flag is stale"
    if fc == "unknown-modifier-token":
        unknown = [x for x in t if len(x) > 1 and TYPO.get(x,x) not in KNOWN]
        if unknown:
            if "verification_needed" not in flags: flags.append("verification_needed")
            return "Needs Curator Review", flags, "Curator identifies the unresolved operator/base", \
                   f"unresolved token(s): {','.join(unknown)}"
        return "Ready for Authoring", flags, "Author operational notation; tokens now settled", \
               "every token resolves to a settled operator; flag is stale"

    # 4. Ready for Authoring (default — settled operators)
    if "far" in t and (t and t[-1] not in ("paradox","pdx")) and any(x in t for x in RECEIVERS) \
       and "paradox" not in t and "pdx" not in t:
        if "verification_needed" not in flags: flags.append("verification_needed")
        return "Ready for Authoring", flags, "Author notation; verify far X-Dex +1 on receiver base", \
               "settled; far+receiver fires X-Dex (+1) — value to verify in decomposition"
    if decomp:
        return "Ready for Authoring", flags, "Promote: notation + promote to red_additions", \
               "settled operators; decomposition + ADD already derived"
    return "Ready for Authoring", flags, "Author operational notation + ADD", \
           "settled operators; structure understood, notation not yet written"

def cur_bucket(r):
    s = r.get("section")
    if s == "ready": return "Awaiting Ruling (ready)"
    if s == "frontier": return "Needs Authoring (frontier)"
    if s == "doctrine": return f"Doctrine cluster: {r.get('cluster','')}"
    return s

out = io.StringIO()
w = csv.writer(out)
w.writerow(["name","section","current_bucket","primary","flags","next_action","rationale","provisional_add","decomposition"])
from collections import Counter
pc = Counter(); fc_count = Counter(); bysec = Counter()
for r in sorted(rows, key=lambda x: (x["section"], x.get("cluster",""), x["name"])):
    primary, flags, action, rationale = classify(r)
    pc[primary]+=1; bysec[(r["section"],primary)]+=1
    for f in flags: fc_count[f]+=1
    w.writerow([r["name"], r["section"], cur_bucket(r), primary, "|".join(flags),
                action, rationale, r.get("provisionalAdd",""), r.get("decomposition","")])

sys.stdout.write(out.getvalue())
sys.stderr.write("\n==== SUMMARY ====\n")
sys.stderr.write(f"total rows: {sum(pc.values())}\n")
sys.stderr.write("by primary: " + ", ".join(f"{k}={v}" for k,v in sorted(pc.items())) + "\n")
sys.stderr.write("flags: " + ", ".join(f"{k}={v}" for k,v in sorted(fc_count.items())) + "\n")
sys.stderr.write("by section x primary:\n")
for (sec,prim),n in sorted(bysec.items()):
    sys.stderr.write(f"  {sec:9} {prim:22} {n}\n")
