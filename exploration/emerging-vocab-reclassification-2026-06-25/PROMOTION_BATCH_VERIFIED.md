# Promotion batch — verified against the live DB

Audit of `PROMOTION_BATCH.md`'s "84 promote-ready" list, checked name-by-name
against `freestyle_tricks` (active) and `freestyle_trick_aliases`. That list was
computed from the observational universe, which had not folded out
already-promoted tricks, so most of it is stale.

**Result: of the 84, 56 are already in the dictionary, 4 are doctrine-held, and
24 are a genuine authoring queue. Promote-now = 0.**

## Promote now — 0

No candidate carries operational notation or an assigned `base_trick`. By the
source artifact's own statement that is the curator authoring step, so nothing is
auto-promotable; a real batch waits on authored notation plus sign-off.

## Discard — already represented (56)

48 resolve to an active canonical trick, 8 to an existing alias. Promoting any as
a new row would duplicate. The 8 aliases:

`Rev. Swirl`→`rev_swirl` · `Toe near Barrage`→`barrage` · `Stepping Opposite Side
Reverse Whirl`→`stepping_rev_whirl` · `Gyro Torque`→`mobius` · `Toe Mobius`→`mobius`
· `Spinning Paradox Symposium Whirling Swirl`→`swirlwind` · `Surging Paradox
Blender`→`margaritaville` · `Spinning Paradox Miraging Symposium Torque`→`big_apple_sauce`

Feed this back into `build_observational_universe_content.py` so the universe
stops re-surfacing promoted tricks as candidates.

## Held pending Red — 4 (atomic X-Dex receiver ruling)

The open question is whether atomic's separate X-Dex (+1) fires on the receiver
base. The proposed receiver set is internally contradictory (torque is listed as a
receiver but the Silo ruling gives atomic-torque no X-Dex), so X-Dex must be
decided per trick. For all four, `base_trick` never changes, and ADD /
decomposition / operational notation (`[XDEX]`) move together or not at all.

| Trick | asserted ADD | X-Dex off | X-Dex on |
|---|---:|---:|---:|
| Atomic Far Whirl | 4 | 4 | 5 |
| Atomic Far Symposium Whirl | 5 | 5 | 6 |
| Atomic Ducking Far Mirage | 4 | 4 | 5 |
| Atomic Gyro Torque | 6 | 6 | 7 |

## Authoring queue — 24 (no doctrine block)

Derivation settled; each needs operational notation + `base_trick` authored and
curator sign-off, then promote one base-layer at a time via `red_additions` +
loader 19.

Atomic Swirl\* · Atomic Reverse Swirl\* · Far Reverse Guay · Spyro Gyro · Far
Reverse Swirl · Far Reverse Whirl · Miraging far Legover · Clipper Diving near
Whirl · Clipper Ducking far Drifter · Clipper Ducking far Whirl · Clipper far
Symposium Whirl · Pixie far Butterfly · Pixie far Drifter · Stepping near Drifter ·
Surging far Mirage · Toe ss Symposium Swirl · Clipper Ducking far Blender · Clipper
Ducking far Symposium Whirl · Spinning far Symposium Whirl · Stepping near Torque ·
Surging far Whirl · Toe Spinning near Torque · Pixie Miraging Symposium Miraging
Legover · Surging Ducking far Blender

\* Atomic Swirl and Atomic Reverse Swirl are **not** doctrine-held: swirl is a
settled X-Dex non-receiver, so the receiver question does not touch them and their
asserted ADD (4) is final. They are gated only on the atomic +1 migration, and
enter the normal authoring queue once that migration ships.
