# Compression Analysis

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. It estimates where the operational notation compresses movement intentionally, and separates useful abstraction from genuine information loss. It describes the compression; it recommends no changes. Companion to `VOLUME_III.md` and `INFORMATION_LOSS_MAP.md`.

Compression here means: the notation deliberately declines to distinguish things a full movement record would. The question is which of those declinings are useful abstraction (they merge things that are the same for the notation's purpose) and which are genuine loss (they merge things that are different even for that purpose).

## Useful abstraction: the notation merging things that are the same for scoring and identity

- **Laterality (the mirror abstraction).** The notation omits the absolute reference foot and both legs entirely. This is not an oversight; it is the notation abstracting over left-right mirror symmetry. A movement and its mirror image are the same trick with the same score, and the notation's identity is invariant under that mirror, so dropping the absolute foot and the legs is exactly the right compression: it merges movements that are, for scoring and naming, the same movement. This is the single largest and most useful abstraction in the notation, and it is why the reference frame and legs are absent from 100% of the corpus.

- **The generic launch.** The generic set launch abstracts over the specific entry surface when the entry surface does not distinguish the trick. Where it does matter, a concrete launch is written instead. This is selective abstraction: compress the launch when it is irrelevant to identity, name it when it is not.

- **Fine phase and micro-timing.** Continuous rotational phase and exact timing within a co-articulated pair are not written. These are movement detail that neither changes the score nor the family, so merging them is useful abstraction for a scoring-and-identity shorthand.

These three are compression working as intended: the notation is smaller than the movement because it deliberately forgets what does not bear on score or identity.

## Genuine information loss: the notation merging things that differ even for its purpose

- **The intermediate carriage.** The side the bag is carried through between two dexterities can distinguish two movements that are not mirror images and are not the same trick, yet it has no token. This is loss beyond the useful abstraction: it is not laterality, and it can separate distinct movements. The compression here has gone past what scoring and identity would merge.

- **The frame-transport relation.** Distinct from the absolute frame (usefully dropped as laterality), whether the frame turns between two dexterities is a relative fact that affects how the second dexterity composes. Dropping the absolute foot is useful; dropping whether the frame transported is genuine loss, because it changes the movement's internal structure, not just its handedness.

- **The measured named collisions.** The 72 movements (8% of the corpus) that share one notation with a differently-named movement are the visible genuine loss: whatever distinguishes each pair as two named tricks is not in the notation. For many of these the two may be structurally near-identical and named apart for reasons the notation legitimately abstracts, but the collision shows the compression has, at least at the naming layer, merged things the community treats as distinct.

## The dividing line

The line between useful abstraction and genuine loss falls exactly at laterality. Everything the notation drops that is a mirror-symmetry or an irrelevance to score and family (the absolute foot, the legs, the fine phase, the irrelevant launch) is useful abstraction: it merges movements that are the same for the notation's purpose. Everything it drops that can distinguish two non-mirror movements (the intermediate carriage, the frame-transport relation, whatever separates the named collisions) is genuine loss: it merges movements that are different even for the notation's purpose. The notation is a good compressor of laterality and irrelevance and a lossy compressor of internal state.

## What the compression reveals

The compression profile confirms the volume's central reading. The notation compresses hardest exactly where scoring and identity are indifferent (laterality) and preserves hardest exactly where they are not (scored events, family structure). Its genuine losses are concentrated in the internal movement state, which is the region a scoring-and-identity shorthand has the least reason to keep. The notation is not a lossy movement language that happens to forget state; it is a scoring-and-identity shorthand whose compression is well-aimed at handedness and irrelevance, with a residual genuine loss in the internal state it was never built to carry.
