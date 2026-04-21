/**
 * Freestyle editorial content.
 *
 * Authored and curated by James (pipeline-side analytical work) and
 * incorporated here as static, non-DB-backed content for two public pages:
 *   - `/freestyle/insights` — analytical snapshots of the freestyle
 *     competition dataset
 *   - `/freestyle/history` — editorial history of the sport
 *
 * Why this module exists separately from `src/services/freestyleService.ts`:
 * the data here is CONTENT, not service logic. Putting it in a service file
 * violates the "services own use-case logic, not editorial data" boundary
 * (`.claude/rules/service-layer.md`). Finding 11.4 of `code_doc_review.md`
 * called out ~200 lines of hardcoded arrays in `freestyleService.ts`; this
 * module is where they were moved.
 *
 * What is in here:
 *   1. Type interfaces describing each content shape (consumed by
 *      freestyleService when building its page view-models).
 *   2. The actual content constants — hand-curated tables of trick usage,
 *      transitions, sequences, player diversity, difficulty eras, narrative
 *      paragraphs, pioneer bios, and era descriptions.
 *
 * What is NOT in here:
 *   - Live DB-derived data (records, leaderboards). Those live in
 *     `freestyleService` and query the `freestyle_records` table.
 *   - View-model types that compose editorial + live data (e.g.,
 *     `FreestyleInsightsContent`). Those stay in `freestyleService` because
 *     they are the service's contract with the controller.
 *
 * Maintenance model:
 *   - This file is the canonical home for the editorial text. Edits land
 *     here via code review, not through an admin UI. There is no DB
 *     round-trip; changes deploy with the codebase.
 *   - Source material (the original CSV and Markdown report) lives under
 *     `legacy_data/inputs/curated/records/`. If that source is regenerated
 *     by a future pipeline run, this module must be updated by hand to
 *     match. No auto-regeneration is wired.
 *
 * Source provenance:
 *   - INSIGHTS_* tables: derived from
 *     `legacy_data/inputs/curated/records/freestyle_insights.csv`, a
 *     frozen analytical output of the freestyle competition dataset.
 *   - INSIGHTS_NARRATIVES, HISTORY_ERAS, HISTORY_PIONEERS, HISTORY_ADD_SYSTEM:
 *     editorial prose from
 *     `legacy_data/inputs/curated/records/FREESTYLE_EVOLUTION_REPORT.md`,
 *     a curated historical report derived from 774 documented competitive
 *     events (1980–2026).
 *
 * Consumers:
 *   - `src/services/freestyleService.ts` — imports the interfaces and
 *     constants; packages them into `FreestyleInsightsContent` and
 *     `FreestyleHistoryContent` page view-models.
 *   - No other file should import from here. If a second surface needs
 *     this data, it's probably a sign the data should be DB-backed;
 *     revisit the editorial-vs-scaffolding decision before adding a
 *     second consumer.
 */

// ─── Insights type interfaces ────────────────────────────────────────────────
//
// Each `INSIGHTS_*` constant below is typed by one of these interfaces. The
// interfaces are exported so `freestyleService` can use them when declaring
// its `FreestyleInsightsContent` view-model shape.

export interface InsightsTrick {
  rank: number;
  name: string;
  adds: string;
  value: number;
  label: string;    // e.g. "150 mentions" or "99 connections"
}

export interface InsightsTransition {
  rank: number;
  from: string;
  to: string;
  count: number;
  players: number;
}

export interface InsightsSequence {
  rank: number;
  player: string;
  year: number;
  adds: number;
  length: number;
  sequence: string;
}

export interface InsightsDiversePlayer {
  rank: number;
  player: string;
  uniqueTricks: number;
  yearsActive: string;
}

export interface InsightsDifficultyEra {
  era: string;
  chains: number;
  avgAdd: number;
}

// ─── History type interfaces ─────────────────────────────────────────────────
//
// Shapes for the `/freestyle/history` page: pioneers (hand-curated player
// bios) and eras (period-by-period historical summaries).

export interface FreestyleHistoryPioneer {
  name: string;
  note: string;
  profileHref: string | null;  // /history/:personId if person is in canonical DB
}

export interface FreestyleHistoryEra {
  period: string;
  label: string;
  summary: string;
  keyFigures: string[];
}

// ─── Insights data: frozen analytical tables ─────────────────────────────────
//
// The six tables below are snapshots of the freestyle-competition analytical
// output. They were computed once by the pipeline (from 774 documented
// events 1980–2026) and pinned here as stable, curated content. They do not
// regenerate on their own; if the underlying dataset is rerun and the
// analysis changes, update these arrays by hand.
//
// Each table renders as a ranked list on `/freestyle/insights`.

export const INSIGHTS_MOST_USED: InsightsTrick[] = [
  { rank: 1,  name: 'whirl',             adds: '3',        value: 150, label: '150 mentions, 86 players' },
  { rank: 2,  name: 'pixie',             adds: 'modifier', value: 121, label: '121 mentions, 75 players' },
  { rank: 3,  name: 'swirl',             adds: '3',        value: 96,  label: '96 mentions, 44 players' },
  { rank: 4,  name: 'blurry whirl',      adds: '5',        value: 89,  label: '89 mentions, 53 players' },
  { rank: 5,  name: 'torque',            adds: '4',        value: 78,  label: '78 mentions, 49 players' },
  { rank: 6,  name: 'ducking',           adds: 'modifier', value: 59,  label: '59 mentions, 43 players' },
  { rank: 7,  name: 'ripwalk',           adds: '4',        value: 58,  label: '58 mentions, 45 players' },
  { rank: 8,  name: 'butterfly',         adds: '3',        value: 56,  label: '56 mentions, 48 players' },
  { rank: 9,  name: 'spinning',          adds: 'modifier', value: 55,  label: '55 mentions, 31 players' },
  { rank: 10, name: 'legover',           adds: '2',        value: 51,  label: '51 mentions, 31 players' },
  { rank: 11, name: 'mirage',            adds: '2',        value: 48,  label: '48 mentions, 39 players' },
  { rank: 12, name: 'dimwalk',           adds: '4',        value: 45,  label: '45 mentions, 38 players' },
  { rank: 13, name: 'symposium',         adds: 'modifier', value: 38,  label: '38 mentions, 27 players' },
  { rank: 14, name: 'blender',           adds: '4',        value: 36,  label: '36 mentions, 22 players' },
  { rank: 15, name: 'eggbeater',         adds: '3',        value: 33,  label: '33 mentions, 23 players' },
];

export const INSIGHTS_CONNECTORS: InsightsTrick[] = [
  { rank: 1,  name: 'whirl',             adds: '3',  value: 99, label: '99 connections, 86 players' },
  { rank: 2,  name: 'blurry whirl',      adds: '5',  value: 70, label: '70 connections, 53 players' },
  { rank: 3,  name: 'ripwalk',           adds: '4',  value: 61, label: '61 connections, 45 players' },
  { rank: 4,  name: 'butterfly',         adds: '3',  value: 44, label: '44 connections, 48 players' },
  { rank: 5,  name: 'torque',            adds: '4',  value: 39, label: '39 connections, 49 players' },
  { rank: 6,  name: 'dimwalk',           adds: '4',  value: 38, label: '38 connections, 38 players' },
  { rank: 7,  name: 'swirl',             adds: '3',  value: 34, label: '34 connections, 44 players' },
  { rank: 8,  name: 'mirage',            adds: '2',  value: 30, label: '30 connections, 39 players' },
  { rank: 9,  name: 'ducking butterfly', adds: '4',  value: 29, label: '29 connections, 26 players' },
  { rank: 10, name: 'legover',           adds: '2',  value: 27, label: '27 connections, 31 players' },
];

export const INSIGHTS_TRANSITIONS: InsightsTransition[] = [
  { rank: 1,  from: 'blurry whirl',      to: 'whirl',              count: 17, players: 15 },
  { rank: 2,  from: 'ripwalk',           to: 'whirl',              count: 11, players: 10 },
  { rank: 3,  from: 'whirl',             to: 'whirl',              count: 10, players: 9  },
  { rank: 4,  from: 'smear',             to: 'dimwalk',            count: 7,  players: 7  },
  { rank: 5,  from: 'dimwalk',           to: 'ripwalk',            count: 6,  players: 6  },
  { rank: 6,  from: 'blurry whirl',      to: 'ripwalk',            count: 6,  players: 5  },
  { rank: 7,  from: 'dimwalk',           to: 'whirl',              count: 5,  players: 5  },
  { rank: 8,  from: 'blurry whirl',      to: 'paradox torque',     count: 5,  players: 5  },
  { rank: 9,  from: 'fusion',            to: 'eggbeater',          count: 5,  players: 4  },
  { rank: 10, from: 'torque',            to: 'whirl',              count: 4,  players: 3  },
];

export const INSIGHTS_SEQUENCES: InsightsSequence[] = [
  { rank: 1,  player: 'Greg Solis',         year: 2008, adds: 22, length: 7, sequence: 'butterfly > whirl > osis > dimwalk > osis > butterfly > swirl' },
  { rank: 2,  player: 'Stefan Siegert',     year: 2005, adds: 18, length: 5, sequence: 'blurry whirl > ripwalk > whirl > pixie > paradox whirl' },
  { rank: 3,  player: 'Cody Rushing',       year: 2008, adds: 18, length: 5, sequence: 'blur > dimwalk > swirl > smear > dimwalk' },
  { rank: 4,  player: 'Daniel Cadavid',     year: 2021, adds: 18, length: 5, sequence: 'dimwalk > osis > dimwalk > spinning osis > whirl' },
  { rank: 5,  player: 'Kyle Hewitt',        year: 2007, adds: 16, length: 4, sequence: 'ripwalk > blurry whirl > smear > dimwalk' },
  { rank: 6,  player: 'Brad Nelson',        year: 2002, adds: 15, length: 3, sequence: 'blurry whirl > paradox torque > paradox blender' },
  { rank: 7,  player: 'Jake Wren',          year: 2007, adds: 15, length: 3, sequence: 'blurriest > spinning whirl > blurry whirl' },
  { rank: 8,  player: 'Byrin Wylie',        year: 2007, adds: 15, length: 3, sequence: 'blurry whirl > blurry whirl > blurriest' },
  { rank: 9,  player: 'Marcin Bujko',       year: 2010, adds: 15, length: 3, sequence: 'spinning osis > food processor > mobius' },
  { rank: 10, player: 'Chris Dean',         year: 2013, adds: 15, length: 3, sequence: 'ducking butterfly > food processor > mobius' },
];

export const INSIGHTS_DIVERSE_PLAYERS: InsightsDiversePlayer[] = [
  { rank: 1,  player: 'Mariusz Wilk',            uniqueTricks: 30, yearsActive: '2008–2019' },
  { rank: 2,  player: 'Honza Weber',              uniqueTricks: 22, yearsActive: '2004–2021' },
  { rank: 3,  player: 'Julien Appolonio',         uniqueTricks: 20, yearsActive: '2007' },
  { rank: 4,  player: 'Stefan Siegert',           uniqueTricks: 19, yearsActive: '2005–2012' },
  { rank: 5,  player: 'Jim Penske',               uniqueTricks: 18, yearsActive: '2006–2015' },
  { rank: 6,  player: 'Byrin Wylie',              uniqueTricks: 16, yearsActive: '2005–2007' },
  { rank: 7,  player: 'Matthias Lino Schmidt',    uniqueTricks: 16, yearsActive: '2012–2013' },
  { rank: 8,  player: 'Damian Gielnicki',         uniqueTricks: 14, yearsActive: '2006–2022' },
  { rank: 9,  player: 'Milan Benda',              uniqueTricks: 12, yearsActive: '2007–2014' },
  { rank: 10, player: 'Nick Landes',              uniqueTricks: 11, yearsActive: '2004–2009' },
];

export const INSIGHTS_DIFFICULTY_ERAS: InsightsDifficultyEra[] = [
  { era: '2001–2003', chains: 29,  avgAdd: 3.52 },
  { era: '2004–2006', chains: 93,  avgAdd: 3.46 },
  { era: '2007–2009', chains: 118, avgAdd: 3.30 },
  { era: '2010–2015', chains: 53,  avgAdd: 3.26 },
  { era: '2016–2025', chains: 82,  avgAdd: 3.12 },
];

export const INSIGHTS_NARRATIVES: string[] = [
  'From a network perspective, freestyle sequences exhibit a clear directional structure. ' +
  'Blurry whirl functions as the primary launch node, initiating high-difficulty sequences, ' +
  'while whirl serves as the dominant attractor, acting as the most common resolution point. ' +
  'This creates a highly asymmetric flow pattern: sequences tend to begin with high-complexity ' +
  'rotational entries and resolve into more stable, clipper-based terminations.',

  'The plateau in average ADD after 2007 suggests that freestyle did not continue to increase ' +
  'in raw technical difficulty after the mid-2000s. Instead, progress shifted toward consistency, ' +
  'execution quality, and the number of players capable of reaching the established ceiling — ' +
  'a transition from technical expansion to competitive depth.',

  'While ADD values above 6 may be theoretically possible, the dataset shows no sustained ' +
  'increase in single-trick difficulty beyond 6 ADD. This suggests a practical ceiling imposed ' +
  'by human biomechanics: finite airtime, constraints on rotational speed, increasing coordination ' +
  'complexity with stacked modifiers, and the requirement for controlled stall completion.',

  'The concentration of both podium finishes and high-difficulty sequence data among European ' +
  'players indicates that the competitive center of freestyle shifted geographically during this ' +
  'period. While early innovation was driven largely by North American players, the post-2005 era ' +
  'is characterized by European dominance in both performance and participation density.',

  'Freestyle footbag evolved through two distinct phases: an early period of rapid innovation in ' +
  'which the core vocabulary was established, followed by a mature phase in which that vocabulary ' +
  'was fully exploited. Progress is now defined not by new elements, but by the refinement and ' +
  'recombination of existing ones.',
];

// ─── Insights narratives: editorial prose analysis ───────────────────────────
//
// Five paragraphs of analytical commentary rendered as the narrative section
// of `/freestyle/insights`. Authored as editorial text; edits land here
// via code review, not live rebuilds.

// ─── History data: pioneers, eras, ADD system explainer ──────────────────────
//
// Editorial content for `/freestyle/history`. All hand-curated.
//
//   HISTORY_PIONEERS: foundational players with bios and (where available)
//     links to their canonical historical-person profile at /history/:id.
//     `profileHref: null` means the player is not yet in the canonical
//     historical_persons table; update when/if they're added.
//
//   HISTORY_ERAS: five period summaries (1980-89, 1990-99, 2000-09,
//     2010-19, 2020-present) with label, summary prose, and key-figure
//     names.
//
//   HISTORY_ADD_SYSTEM: four paragraphs explaining the ADD (Additional
//     Degree of Difficulty) scoring system used throughout the dataset.

export const HISTORY_PIONEERS: FreestyleHistoryPioneer[] = [
  {
    name: 'Kenny Shults',
    note: 'Early clipper-based vocabulary; helped establish whirl as a competition element. 11 freestyle singles wins across multiple eras.',
    profileHref: '/history/2a6a7c9e-1d8a-4f9a-a8f5-6f3a3c1e9b0f',
  },
  {
    name: 'Rick Reese (Rippin\')',
    note: 'Foundational movement-trick vocabulary; early ripwalk variants. Namesake of one of the most-used transition tricks in competitive freestyle.',
    profileHref: null,
  },
  {
    name: 'Eric Wulff',
    note: 'Butterfly-based freestyle style; among the first to demonstrate butterfly combinations in competition. 25 podium finishes spanning multiple decades.',
    profileHref: '/history/e8b82661-4428-5e51-a786-29bf7a23728f',
  },
  {
    name: 'Tuan Vu',
    note: 'Influential technical freestyler; widely cited by peers as an early innovator of difficult sequences in the pre-ADD era.',
    profileHref: null,
  },
  {
    name: 'Scott Davidson',
    note: 'Early innovator; helped shape the pre-ADD competitive culture. 6 gold medals, active across the formative period.',
    profileHref: '/history/274d2f51-e2d5-5458-be40-6b9211ff813e',
  },
  {
    name: 'Daryl Genz',
    note: 'Early innovator and longtime competition contributor across the formative 1980s and 1990s.',
    profileHref: null,
  },
  {
    name: 'Peter Irish',
    note: '13 freestyle singles golds; dominant competitor from the late 1980s into the 1990s.',
    profileHref: '/history/542be6a9-3b5a-5374-961b-9de19c0def7a',
  },
  {
    name: 'Carol Wedemeyer',
    note: "9 gold medals in women's freestyle; dominant in the 1980s–1990s transition period.",
    profileHref: '/history/b63b58da-fe12-59da-92d6-15726472e38b',
  },
];

export const HISTORY_ERAS: FreestyleHistoryEra[] = [
  {
    period: '1980–1989',
    label: 'Foundation Era',
    summary:
      'Freestyle footbag emerged alongside the sport itself. The core trick vocabulary — clipper, mirage, legover, whirl, butterfly, osis — was established before any formal ADD scoring. Players competed in open freestyle routines judged entirely on execution, variety, and presentation. 26 documented freestyle events in this decade, primarily in North America.',
    keyFigures: ['Kenny Shults', 'Eric Wulff', 'Scott Davidson', 'Greg Nelson', 'Tim Kelley', 'Daryl Genz', 'Carol Wedemeyer'],
  },
  {
    period: '1990–1999',
    label: 'ADD System & Expansion',
    summary:
      'The ADD (Additional Degree of Difficulty) system codified what players had already been doing for a decade. The BAP (Bag Arts Pioneer) recognition program, begun in 1992, acknowledged the foundational cohort who had built the sport. The Sick3 format emerged as a pure-difficulty side event. 49 documented freestyle events expanded geographic reach.',
    keyFigures: ['Peter Irish', 'Ryan Mulroney', 'Serge Kaldany', 'Rick Reese', 'Tuan Vu', 'John Schneider', 'Ken Somolinos'],
  },
  {
    period: '2000–2009',
    label: 'Technical Peak',
    summary:
      'The most documented era: 144 freestyle events, the highest density of Sick3 sequence data, and the highest recorded sequence difficulty — 22 ADD in a single 7-trick chain (Greg Solis, 2008). The blurry modifier drove the dominant trick structure: blurry whirl (5 ADD) as the launch node, whirl (3 ADD) as the resolution. Difficulty plateaued around 2005–2008; trick vocabulary was effectively complete by 2007. European players began asserting competitive dominance.',
    keyFigures: ['Václav Klouda', 'Stefan Siegert', 'Greg Solis', 'Byrin Wylie', 'Damian Gielnicki', 'Mariusz Wilk', 'Honza Weber'],
  },
  {
    period: '2010–2019',
    label: 'European Dominance',
    summary:
      'A geographic shift consolidated European dominance in both performance and participation. While difficulty did not increase — average ADD per sequence held steady around 3.1–3.3 — competitive depth increased. More players reached the difficulty frontier established in the 2000s. Václav Klouda extended his already-dominant career. 41 documented freestyle events.',
    keyFigures: ['Václav Klouda', 'Damian Gielnicki', 'Mariusz Wilk', 'Matthias Lino Schmidt', 'Filip Wojcik', 'Andreas Nawrath'],
  },
  {
    period: '2020–present',
    label: 'Modern Era',
    summary:
      'Activity resumed after the COVID interruption. The structural completeness of freestyle\'s vocabulary was clear: innovation occurs through recombination of existing components rather than genuinely new trick structures. 7-ADD combinations, while theoretically possible, remain rare in documented competition. 12+ events documented through 2025.',
    keyFigures: ['Václav Klouda', 'Daniel Cadavid', 'Milan Benda', 'Miquel Clemente'],
  },
];

export const HISTORY_ADD_SYSTEM: string[] = [
  'The ADD system quantifies trick difficulty by assigning a base value to each trick and adding bonuses for modifiers. The base values reflect the minimum mechanical demand of the trick — the number of distinct body actions required within a single set cycle.',
  'Modifiers are additional body mechanics layered onto base tricks: rotations (spinning, blurry), dexterities (pixie, fairy), and positional constraints (ducking, symposium, paradox, atomic). Critically, modifiers interact: a rotational base (mirage, whirl, torque) receives +2 from blurry rather than +1, reflecting the compounded demand of wrapping a blur around a rotation.',
  'The highest documented single-trick ADD in competitive play is 6: food processor (blurry blender = blurry+blender: 4+2) and blurry symposium whirl (symposium+1, blurry+2, whirl+3). Community discussion of 7-ADD constructions continues, and individual executions have been claimed, but no sustained competitive documentation at 7 ADD has been established in this dataset.',
  'Trick vocabulary was effectively complete by 2007–2008. No genuinely new base structures appear in 2010–2025 data. Progress since then has been measured in execution quality, consistency, and competitive depth rather than new ADD ceilings.',
];
