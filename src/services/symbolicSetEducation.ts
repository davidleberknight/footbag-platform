/**
 * symbolicSetEducation.ts
 *
 * Hand-authored educational content for canonical-set teaching surfaces. A set
 * is a launch system, so its page teaches what structural launch the set
 * contributes to an otherwise-unchanged base dexterity, concept before
 * mechanics.
 *
 * This is the PEDAGOGY layer, deliberately separate from the set ontology in
 * freestyleCanonicalSets.ts: ontology objects carry terse canonical facts
 * (formula, derived systems, provenance), and must not absorb teaching prose.
 * The freestyle service resolves the authored content below into a view-model,
 * resolving every progression / representative-trick slug against the
 * dictionary so the links are clickable.
 *
 * The frozen set template (headings identical on every migrated set page; the
 * page title names the set): What it is / Why it exists / How it launches /
 * JOB notation / Where it appears / How it composes / Progression /
 * Representative tricks / Common confusions / Related concepts / Launch notes.
 * It reads in lockstep with the operator template; the two slots that are
 * launch-specific ("How it launches", "Launch notes") replace the operator
 * slots "How it changes the base trick" and "Execution notes".
 *
 * Adding a set: register an object in SET_PAGE_CONTENT.
 */
import type { FreestyleTrickRow } from '../db/db';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface SetEducationConfusionPair {
  heading: string;
  prose:   string;
}

export interface SetEducationProgressionStep {
  slug:        string;
  addedLabel:  string;   // e.g., "anchor (no stepping yet)", "+ stepping"
  rationale:   string;
}

export interface SetEducationExample {
  slug:      string;   // resolved against the dictionary
  baseLabel: string;   // e.g., "Basic dex", "Whirl family"
  prose:     string;
}

export interface SetEducationRelatedSystem {
  name:  string;
  prose: string;
}

// Per-set authored content (input shape; static).
export interface SetEducationInput {
  slug:         string;   // canonical-set slug; matches the /freestyle/sets/:slug param
  displayName:  string;
  pageSubtitle: string;   // one-line frame below the H1
  definition:     string; // What it is
  whyItExists:    string; // Why it exists (the launch distinction it records, not difficulty)
  howItLaunches:  string; // How it launches (launch-first; the base dexterity stays recognizable)
  jobNotation:    string; // The set formula and what the notation records
  whereItAppears: string; // Which bases and compounds use this launch (composition first)
  howItComposes:  string; // What it combines with, and the set systems it seeds
  launchNotes:    string; // Objective: the defining launch structure, not coaching
  confusions:     SetEducationConfusionPair[];
  progression: {
    anchorBaseLabel: string;
    steps:           SetEducationProgressionStep[];
  };
  representativeTricks: {
    framingLine: string;
    examples:    SetEducationExample[];
  };
  relatedConcepts: SetEducationRelatedSystem[];
}

// Per-set output shape (dictionary-row-resolved view-model).
export interface SetEducationProgressionStepResolved extends SetEducationProgressionStep {
  canonicalName: string;
  adds:          string | null;
  detailHref:    string;
  isAnchor:      boolean;
  stepNumber:    number;
  isPilot:       boolean;
}

export interface SetEducationExampleResolved extends SetEducationExample {
  canonicalName: string;
  adds:          string | null;
  detailHref:    string;
  isPilot:       boolean;
}

export interface SetEducationContent {
  slug:           string;
  displayName:    string;
  pageSubtitle:   string;
  definition:     string;
  whyItExists:    string;
  howItLaunches:  string;
  jobNotation:    string;
  whereItAppears: string;
  howItComposes:  string;
  launchNotes:    string;
  confusions:     SetEducationConfusionPair[];
  progression: {
    anchorBaseLabel: string;
    steps:           SetEducationProgressionStepResolved[];
  };
  representativeTricks: {
    framingLine: string;
    examples:    SetEducationExampleResolved[];
  };
  relatedConcepts: SetEducationRelatedSystem[];
}

// ─────────────────────────────────────────────────────────────────────────
// Authored content — STEPPING (the set-page reference implementation)
// ─────────────────────────────────────────────────────────────────────────

const STEPPING_SET_CONTENT: SetEducationInput = {
  slug:         'stepping',
  displayName:  'Stepping',
  pageSubtitle: 'A launch set that opens a trick from a relocating support foot, determining how the bag is delivered into the dexterity while the dexterity itself stays the same.',
  definition:
    'Stepping is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. The support foot relocates as it opens a clipper-anchored set, delivering the bag into the dexterity from an opposite-side inward set rather than from a stationary toe or clipper set. The dexterity that follows is unchanged; what stepping sets is the launch. In notation the set reads CLIP > OP IN [DEX], and as a set treatment it contributes +1.',
  whyItExists:
    'Stepping exists to distinguish tricks whose launch comes from a relocating support foot opening a clipper-anchored set, rather than from a stationary toe or clipper set. The dexterity is the same either way; the set records that the support foot steps to a new position to open the chain. This launch is a distinct structural event, scored independently as a +1 set treatment, separate from any body movement or dexterity in the trick.',
  howItLaunches:
    'Stepping is the launch itself, not a movement added after launch. The support foot relocates to open a clipper-anchored set, and the bag is delivered from an opposite-side inward set into whatever dexterity follows. The dexterity that follows is recognizable and unchanged: a stepping mirage is still a mirage, a stepping butterfly is still a butterfly (the named trick ripwalk). What stepping determines is how the trick is set up and entered, contributing +1 from the set treatment, separate from the dexterity count.',
  jobNotation:
    'Stepping lives in the set portion of the notation, at the front of the chain. A stepping trick opens CLIP > OP IN [DEX] >, the clipper-anchored set with an opposite-side inward dex that records the relocating support foot; the rest of the chain is the unchanged base. So stepping mirage reads CLIP > OP IN [DEX] >> OP IN [DEX] > OP TOE [DEL] and decomposes as stepping(+1) + mirage(2) = 3, where the leading set carries the +1 and the trailing dex and terminal carry the base. This is what marks stepping as a launch rather than a body operator: it is written as the opening set, not as a [BOD] or [PDX] token inserted alongside the dexterity.',
  whereItAppears:
    'Stepping is one of the core launch sets and appears across a very wide range of bases, from single-dex tricks to deep compounds. Several named systems are built directly on it: barraging, blurry, leaning, go-go, and shooting all extend the stepping launch. Its butterfly case carries the well-known name ripwalk. Among the launch sets it is clipper-anchored, the directional mirror of bubba, distinct from the toe-anchored launches such as pixie and fairy.',
  howItComposes:
    'Stepping composes with almost any dexterity while contributing its clipper-anchored launch. It opens uptime, rotational, and cross-body dexes, and the body operators layer on top of it: stepping and symposium, stepping and ducking, stepping and paradox all combine on a single base, each on its own axis. Because stepping is the launch and the body operators are body movements, the two layer without competing, which is why the deepest stepping compounds carry several operators at once. Stepping also seeds its own derived set systems, where a further set treatment is layered onto the stepping launch.',
  launchNotes:
    'The defining structure is a clipper-anchored set with an opposite-side inward dex, opened as the support foot relocates. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged. In notation the launch is recorded at the front of the chain as CLIP > OP IN [DEX].',
  confusions: [
    {
      heading: 'Stepping vs a plain clipper or toe set',
      prose:
        'Stepping is not just any clipper set. It is a clipper-anchored set with an opposite-side inward dex, opened by relocating the support foot. A stationary toe or clipper set delivers the bag without that relocation and scores no set bonus; stepping records the foot relocation and scores +1.',
    },
    {
      heading: 'Stepping is a launch, not a body movement',
      prose:
        'Stepping does not turn, duck, or pivot the body. It determines how the bag is launched into the trick, at the set layer. That is why it is scored as a set treatment and written in the set portion of the notation, not as a body token.',
    },
    {
      heading: 'Stepping vs pixie',
      prose:
        'Stepping and pixie are both core launch sets, but they are different launches. Pixie is a toe set with a same-side inward dex (TOE > SAME IN [DEX]); stepping is a clipper-anchored set with an opposite-side inward dex (CLIP > OP IN [DEX]). They are separate launch identities, not two names for one launch.',
    },
    {
      heading: 'Stepping does not replace the base trick',
      prose:
        'A stepping trick is still fundamentally the underlying trick. Stepping sets how it is launched; it does not replace the underlying dexterity or family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:       'butterfly',
        addedLabel: 'anchor (no stepping yet)',
        rationale:
          'The butterfly dexterity on its own, opened from a stationary set. Stepping will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'ripwalk',
        addedLabel: '+ stepping',
        rationale:
          'The stepping launch applied to butterfly: the support foot relocates to open the set while the butterfly itself is unchanged. The clearest single case for the set, and it carries its own name, ripwalk.',
      },
      {
        slug:       'parkwalk',
        addedLabel: '+ paradox',
        rationale:
          'The stepping launch combined with a paradox side-switch on the same butterfly base, a body operator on its own axis. The named trick parkwalk.',
      },
      {
        slug:       'stepping_ducking_butterfly',
        addedLabel: '+ ducking (deepest stack)',
        rationale:
          'The stepping launch stacked with ducking on butterfly, a deeper stepping compound. The support-foot relocation is still the same launch opening the chain.',
      },
    ],
  },
  representativeTricks: {
    framingLine:
      'These examples illustrate how the same stepping launch opens different trick families.',
    examples: [
      {
        slug:      'stepping_mirage',
        baseLabel: 'Basic dex',
        prose:
          'The stepping launch opening a single mirage dex, the clearest case of the set on its own (3 ADD).',
      },
      {
        slug:      'stepping_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The same stepping launch opening a whirl: the launch changes while the whirl dex is unchanged (4 ADD).',
      },
      {
        slug:      'stepping_eggbeater',
        baseLabel: 'Cross-body',
        prose:
          'Stepping opening the eggbeater (atomic legover), a cross-body base; the clipper-anchored launch delivers the bag into the cross-body dex (4 ADD).',
      },
      {
        slug:      'stepping_symposium_mirage',
        baseLabel: 'Multiple operators',
        prose:
          'The stepping launch with symposium added: the support leg is kept off the ground through the dex, a body operator on the stepping launch of a mirage (4 ADD).',
      },
      {
        slug:      'ripwalk',
        baseLabel: 'Recognizable named trick',
        prose:
          'Ripwalk is the canonical stepping butterfly, the most recognizable stepping compound and a named trick in its own right (named after the player Rippin Rick Reese): the stepping launch opening a butterfly (4 ADD).',
      },
    ],
  },
  relatedConcepts: [
    {
      name:  'barraging',
      prose: 'A two-dex set built on the stepping launch, adding a second inward dex (also called furious). The clearest system derived from stepping.',
    },
    {
      name:  'blurry',
      prose: 'A set system that decomposes to stepping plus a paradox side-switch; the stepping launch with an added cross-body relationship.',
    },
    {
      name:  'shooting',
      prose: 'Another set system derived from the stepping launch, layering a further set treatment onto it.',
    },
    {
      name:  'bubba',
      prose: 'The directional mirror of stepping: the same clipper-anchored launch opened to the opposite side.',
    },
    {
      name:  'pixie',
      prose: 'A toe-anchored launch set (a toe set with a same-side inward dex). A separate launch identity, useful to contrast against stepping.',
    },
    {
      name:  'fairy',
      prose: 'The directional mirror of pixie, and like pixie a toe-anchored launch; contrasts with the clipper anchor of stepping.',
    },
    {
      name:  'paradox',
      prose: 'A side-switch dex relationship that combines with the stepping launch; the combination underlies blurry and the named trick parkwalk.',
    },
  ],
};

// Registry — set teaching pages.
const SET_PAGE_CONTENT: Record<string, SetEducationInput> = {
  stepping: STEPPING_SET_CONTENT,
};

// ─────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────

/** Returns true when an authored set-teaching page exists for the slug. */
export function hasSetEducationPage(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(SET_PAGE_CONTENT, slug);
}

/**
 * Build the set-teaching content for a slug, resolving every progression step
 * and representative-trick slug against the dictionary so links are clickable
 * and carry the canonical name + ADD. Returns null when the slug has no
 * authored content.
 */
export function buildSetEducationContent(
  slug: string,
  allDictRows: readonly FreestyleTrickRow[],
): SetEducationContent | null {
  const input = SET_PAGE_CONTENT[slug];
  if (!input) return null;

  const dictBySlug = new Map<string, FreestyleTrickRow>();
  for (const row of allDictRows) dictBySlug.set(row.slug, row);

  const steps: SetEducationProgressionStepResolved[] = input.progression.steps.map((step, idx) => {
    const row = dictBySlug.get(step.slug);
    return {
      ...step,
      canonicalName: row?.canonical_name ?? step.slug,
      adds:          row?.adds ?? null,
      detailHref:    `/freestyle/tricks/${step.slug}`,
      isAnchor:      idx === 0,
      stepNumber:    idx + 1,
      isPilot:       !!row,
    };
  });

  const examples: SetEducationExampleResolved[] = input.representativeTricks.examples.map(ex => {
    const row = dictBySlug.get(ex.slug);
    return {
      ...ex,
      canonicalName: row?.canonical_name ?? ex.slug,
      adds:          row?.adds ?? null,
      detailHref:    `/freestyle/tricks/${ex.slug}`,
      isPilot:       !!row,
    };
  });

  return {
    slug:           input.slug,
    displayName:    input.displayName,
    pageSubtitle:   input.pageSubtitle,
    definition:     input.definition,
    whyItExists:    input.whyItExists,
    howItLaunches:  input.howItLaunches,
    jobNotation:    input.jobNotation,
    whereItAppears: input.whereItAppears,
    howItComposes:  input.howItComposes,
    launchNotes:    input.launchNotes,
    confusions:     input.confusions,
    progression: {
      anchorBaseLabel: input.progression.anchorBaseLabel,
      steps,
    },
    representativeTricks: {
      framingLine: input.representativeTricks.framingLine,
      examples,
    },
    relatedConcepts: input.relatedConcepts,
  };
}
