/**
 * EquipmentService -- public equipment page (read-only).
 *
 * Serves:
 *   - GET /equipment (public, unauthenticated): what you need to play each footbag game. It is the
 *     `equipment` top-level nav section, beside Rules.
 *
 * Rendering contract:
 *   - getEquipmentPage() returns PageViewModel<EquipmentContent>.
 *   - Opening paragraphs, then one section per topic with a stable anchor id (`footbags`, `shoes`,
 *     `net`, `foot-c`, `freestyle`, `golf`, `square-games`). The net, freestyle and sideline pages
 *     deep-link to these anchors, so the ids are a stable contract.
 *   - An item stating an official figure carries `officialRule`, a link to the exact rule section
 *     that governs it; items without one are practical guidance.
 *   - The vendor is named as plain text: the page renders zero offsite hyperlinks.
 *
 * Governance:
 *   - Equipment is the site's own practical guidance, written by the IFPA secretary, and a sibling
 *     of the rules rather than part of them. The published rules are the single source for every
 *     official equipment requirement, so this page never restates one differently: an official
 *     figure appears as the rule states it and links to that rule. Where the guide describes
 *     current practice that the rule does not fix, the wording says so.
 */
import { PageViewModel } from '../types/page';

export interface EquipmentRuleLinkViewModel {
  label: string;
  href: string;
}

export interface EquipmentItemViewModel {
  lead: string;
  text: string;
  officialRule: EquipmentRuleLinkViewModel | null;
}

export interface EquipmentSectionViewModel {
  id: string;
  heading: string;
  paragraphs: string[];
  items: EquipmentItemViewModel[];
  closingParagraphs: string[];
}

export interface EquipmentRulesPointerViewModel {
  before: string;
  linkLabel: string;
  href: string;
  after: string;
}

export interface EquipmentContent {
  introParagraphs: string[];
  sections: EquipmentSectionViewModel[];
  rulesPointer: EquipmentRulesPointerViewModel;
}

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

const NET_RULES = '/rules/net/footbag-net';
const FREESTYLE_RULES = '/rules/freestyle/footbag-freestyle';
const GOLF_RULES = '/rules/golf/footbag-golf';

function rule(rulePageHref: string, label: string, anchor: string): EquipmentRuleLinkViewModel {
  return { label, href: `${rulePageHref}#${anchor}` };
}

const INTRO_PARAGRAPHS = [
  'To play footbag you need a footbag and a pair of shoes you can kick in. Net, golf and 4-square (also 2-square and 5-square) need a court or targets, laid out as below.',
  'footbag.org doesn\'t sell equipment. For footbags, nets and other gear, see World Footbag (worldfootbag.com). This is listed for information only and isn\'t an endorsement by IFPA.',
];

const SECTIONS: EquipmentSectionViewModel[] = [
  {
    id: 'footbags',
    heading: 'Footbags',
    paragraphs: ['Which footbag suits you depends on what you want to play.'],
    items: [
      {
        lead: 'Kicking around',
        text: 'for casual play, almost any small kicking bag will do. They\'re sold at toy, sporting goods and outdoor shops, and online.',
        officialRule: null,
      },
      {
        lead: 'Freestyle',
        text: 'freestylers favor softer bags that are easy to stall (catch and hold on the foot). These are typically many-paneled (often 32 panels) and filled with plastic beads, sand or other fillers.',
        officialRule: null,
      },
      {
        lead: 'Net',
        text: 'use a bag made for net play. Net bags use a thicker material and are harder and rounder than freestyle bags. They\'re rarely sold in stores.',
        officialRule: null,
      },
      {
        lead: 'Breaking in a new bag',
        text: 'most freestyle bags are playable straight from the package and soften further with play. Net bags often need breaking in: knead them by hand and kick with them until they soften. Don\'t try to soften a bag by crushing it.',
        officialRule: null,
      },
      {
        lead: 'Making your own',
        text: 'many players sew their own bags from a pattern.',
        officialRule: null,
      },
    ],
    closingParagraphs: [
      'For the widest choice, buy online. Your local club can also tell you where players near you get their bags.',
    ],
  },
  {
    id: 'shoes',
    heading: 'Shoes',
    paragraphs: [
      'Shoes matter as much as the bag. Freestylers look for a flat inside surface, for stalls and delays on the inside of the foot, an uncluttered toe area for toe stalls, and a sole that absorbs landings. The adidas Rod Laver and the Quantum are current favorites, and many players modify or re-lace their shoes for freestyle. Net players also need flat inside and outside surfaces, in a sport shoe built for quick side-to-side movement. The Nike Air Max 90 is currently a popular choice for net.',
    ],
    items: [],
    closingParagraphs: [],
  },
  {
    id: 'net',
    heading: 'Net Equipment',
    paragraphs: ['Footbag net is played on a badminton-sized court with a 5-foot net.'],
    items: [
      {
        lead: 'Court',
        text: 'the same dimensions as a badminton court, 44 feet long and 20 feet wide, except that a center line runs the full length to define the four serving quadrants. The same court is used for singles and doubles.',
        officialRule: rule(NET_RULES, '302.01 Court Dimensions', '302-01-court-dimensions'),
      },
      {
        lead: 'Net',
        text: '5 feet high, measured at center court. Stanchions sit just outside the court. A 1-inch mesh is recommended so the footbag can\'t pass through.',
        officialRule: rule(NET_RULES, '302.02 Net Height and Stanchion Placement', '302-02-net-height-and-stanchion-placement'),
      },
      {
        lead: 'Lines',
        text: 'most net sets come with rope lines, which are fine for casual play. Tournaments usually use 2-inch tape, painted lines, or the lines on a painted gym floor.',
        officialRule: rule(NET_RULES, '302.06 Line Width', '302-06-line-width'),
      },
      {
        lead: 'Net sets',
        text: 'a badminton net works but isn\'t recommended, because players land on the net and it should fall rather than break. A net made for footbag is the safer choice.',
        officialRule: null,
      },
    ],
    closingParagraphs: [],
  },
  {
    id: 'foot-c',
    heading: 'Foot-C or Mini Net',
    paragraphs: ['A smaller net game that fits in one quarter of a full-size net court.'],
    items: [
      {
        lead: 'Court',
        text: '10 by 22 feet (3.05 by 6.71 meters).',
        officialRule: null,
      },
      {
        lead: 'Net',
        text: '41 inches high (1.04 meters) and 10 feet across, spanning the court\'s width.',
        officialRule: null,
      },
    ],
    closingParagraphs: [],
  },
  {
    id: 'freestyle',
    heading: 'Freestyle Equipment',
    paragraphs: ['Freestyle needs no court or net, just a footbag and a flat, open space to play in.'],
    items: [
      {
        lead: 'Playing area',
        text: 'a circle 20 feet (6 meters) across for most events, and about 40 feet (12 meters) across for choreographed routines.',
        officialRule: rule(FREESTYLE_RULES, '502.01 Playing Area', '502-01-playing-area'),
      },
    ],
    closingParagraphs: [],
  },
  {
    id: 'golf',
    heading: 'Golf Equipment',
    paragraphs: ['A footbag golf course is a set of holes, each with a tee box to start from and a target to finish at.'],
    items: [
      {
        lead: 'Hole (target)',
        text: '18 inches in diameter, standing 18 inches off the ground, on an 18-inch base.',
        officialRule: rule(GOLF_RULES, '402.03 Targets', '402-03-targets'),
      },
      {
        // "commonly" marks the 20-foot radius as current practice: the rule
        // allows 20 to 50 feet from the green's edge to the hole, and the
        // linked rule section is where the official range is read.
        lead: 'Green',
        text: 'commonly a circle with a 20-foot radius around the hole, sometimes marked with a 20-foot string tied to the hole\'s post. Players use the string to check whether their lie is on the green. Keep the green as level as possible within 5 feet of the hole, with no obstructions within 5 feet of the target.',
        officialRule: rule(GOLF_RULES, '402.04 Greens', '402-04-greens'),
      },
      {
        lead: 'Tee box',
        text: '6 feet square.',
        officialRule: rule(GOLF_RULES, '403.02 Teeing Off', '403-02-teeing-off'),
      },
      {
        lead: 'Lie marker',
        text: 'some kind of marker to mark where your footbag landed, such as a spare footbag or mini disc.',
        officialRule: rule(GOLF_RULES, '402.02 Markers', '402-02-markers'),
      },
    ],
    closingParagraphs: [],
  },
  {
    id: 'square-games',
    heading: '2-Square and 4-Square Equipment',
    paragraphs: ['Both games are played on a court of squares chalked or taped on any flat surface.'],
    items: [
      {
        lead: 'Court',
        text: '14 by 14 feet (4.26 by 4.26 meters), split into four 7-foot squares (2.13 meters).',
        officialRule: null,
      },
      {
        lead: 'Lines',
        text: '1 to 2 inches wide (2.5 to 5 cm). Street chalk works.',
        officialRule: null,
      },
      {
        lead: '2-square',
        text: 'a two-player version on half the court: two 7-foot squares side by side, 7 by 14 feet (2.13 by 4.26 meters), with the same lines.',
        officialRule: null,
      },
      {
        lead: '5-square',
        text: 'a variation with a fifth square in the center.',
        officialRule: null,
      },
    ],
    closingParagraphs: [],
  },
];

const RULES_POINTER: EquipmentRulesPointerViewModel = {
  before: 'For the full rules of each game, see the ',
  linkLabel: 'Footbag Rules',
  href: '/rules',
  after: '.',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const equipmentService = {
  getEquipmentPage(): PageViewModel<EquipmentContent> {
    return {
      seo: {
        title: 'Equipment',
        description: 'What you need to play footbag: footbags, shoes, and how to set up net, freestyle, golf, 2-square and 4-square courts.',
      },
      page: {
        sectionKey: 'equipment',
        pageKey: 'equipment_index',
        title: 'Footbag Equipment',
        intro: 'What you need to play each footbag game, from the footbag and shoes to setting up a court or course.',
      },
      content: {
        introParagraphs: INTRO_PARAGRAPHS,
        sections: SECTIONS,
        rulesPointer: RULES_POINTER,
      },
    };
  },
};
