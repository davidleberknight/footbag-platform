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
 * violates the "services own use-case logic, not editorial data" boundary;
 * roughly 200 lines of hardcoded editorial arrays previously lived in
 * `freestyleService.ts` and were extracted here.
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
  // Recognition badges (BAP, HOF, etc.). Populated only when the existing
  // editorial note text or external community documentation explicitly
  // attests the recognition — do NOT invent attribution. Empty array
  // means recognition data hasn't been confirmed for this entry yet.
  recognitions?: string[];
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
    name: 'Kenny Shults (The Enforcer)',
    note: 'Early clipper-based vocabulary; helped establish whirl as a competition element. 11 freestyle singles wins across multiple eras.',
    profileHref: '/history/2a6a7c9e-1d8a-4f9a-a8f5-6f3a3c1e9b0f',
  },
  {
    name: 'Rick Reese (Rippin\')',
    note: 'Foundational movement-trick vocabulary; early ripwalk variants. Namesake of one of the most-used transition tricks in competitive freestyle.',
    profileHref: '/history/0858e74f-3f58-51c5-8d9b-4a6f2333c08c',
  },
  {
    name: 'Eric Wulff (Iron Man)',
    note: 'Butterfly-based freestyle style; among the first to demonstrate butterfly combinations in competition. 25 podium finishes spanning multiple decades.',
    profileHref: '/history/e8b82661-4428-5e51-a786-29bf7a23728f',
  },
  {
    name: 'Tuan Vu (Disco Ninja)',
    note: 'Influential technical freestyler; widely cited by peers as an early innovator of difficult sequences in the pre-ADD era.',
    profileHref: '/history/28565dd0-2196-5404-bf23-6cf0617ce79b',
  },
  {
    name: 'Scott Davidson (Enlightener)',
    note: 'Early innovator; helped shape the pre-ADD competitive culture. 6 gold medals, active across the formative period.',
    profileHref: '/history/274d2f51-e2d5-5458-be40-6b9211ff813e',
  },
  {
    name: 'Daryl Genz (Genzu Blades)',
    note: 'Early innovator and longtime competition contributor across the formative 1980s and 1990s.',
    profileHref: '/history/bd97ebe2-5ecd-5854-9d2e-b877a27ac527',
  },
  {
    name: 'Peter Irish (The Executioner)',
    note: '13 freestyle singles golds; dominant competitor from the late 1980s into the 1990s.',
    profileHref: '/history/542be6a9-3b5a-5374-961b-9de19c0def7a',
  },
  {
    name: 'Carol Wedemeyer (She blade)',
    note: "9 gold medals in women's freestyle; dominant in the 1980s–1990s transition period.",
    profileHref: '/history/b63b58da-fe12-59da-92d6-15726472e38b',
  },
  {
    name: 'Tim Kelley (Stikman)',
    note: 'Minnesota freestyler; huge combos with double dexterities on both sides.',
    profileHref: '/history/044b9080-ec21-5ca5-a8b0-e85ab5fb1c0b',
  },
  {
    name: 'Dimitri Kavouras (Celsone)',
    note: 'Bay Area innovator; co-developed the San Francisco freestyle scene with Dennis Jones through intensive training.',
    profileHref: '/history/56d03794-1837-5abc-b35c-48bfc50ea8ae',
  },
  {
    name: 'Dennis Jones (D-Money)',
    note: 'Co-built the San Francisco Bay Area freestyle scene through relentless training and cutting-edge combinations.',
    profileHref: '/history/075d8a18-efd4-531c-a9cd-493213bb8382',
  },
  {
    name: 'Joey Schaeffer (Za Za)',
    note: 'Originated the BAP\'s "Stand Clear of the Blades" branding at the 1992 Worlds; conceptualized the symposium modifier.',
    profileHref: '/history/50799219-0327-5a7e-9542-53c37b63ce66',
    // Joey's note explicitly attests BAP-era contribution at the 1992 Worlds.
    // Other entries in this list lack equivalently explicit attestation and
    // are left without recognitions until curator review confirms.
    recognitions: ['BAP'],
  },
];

export const HISTORY_ERAS: FreestyleHistoryEra[] = [
  {
    period: '1980–1989',
    label: 'Foundation Era',
    summary:
      'Freestyle footbag took shape inside the broader hacky sack culture of the early 1980s. Players began organizing the casual circles into something with shape: a recognizable cast of body and dex motions — clipper, mirage, legover, whirl, butterfly, osis — became the working vocabulary of competitive routines. There was no formal scoring yet. Performances were judged on execution, creativity, and the energy a routine carried into a circle. This era was about establishing what the sport could be. 26 documented freestyle events, primarily in North America.',
    keyFigures: ['Kenny Shults', 'Eric Wulff', 'Scott Davidson', 'Greg Nelson', 'Tim Kelley', 'Daryl Genz', 'Carol Wedemeyer'],
  },
  {
    period: '1990–1999',
    label: 'Codifying the Language',
    summary:
      'The 1990s gave the sport its grammar. The ADD (Additional Degree of Difficulty) system put numbers on what players had been doing intuitively for a decade — turning a shared feel for difficulty into a shared scale. The BAP (Big ADD Posse) recognition, started in 1992, honored the cohort who had built the sport into something with depth. Sick 3 emerged as the format where pure technical difficulty could be celebrated separately from routine choreography. The community kept growing, and so did the geographic reach. 49 documented freestyle events.',
    keyFigures: ['Peter Irish', 'Ryan Mulroney', 'Serge Kaldany', 'Rick Reese', 'Tuan Vu', 'John Schneider', 'Ken Somolinos'],
  },
  {
    period: '2000–2009',
    label: 'Technical Acceleration',
    summary:
      'The most heavily documented decade: 144 freestyle events, the densest Sick 3 sequence record, and the highest single-chain ADD on file — 22 ADD across a 7-trick run by Greg Solis in 2008. The blurry modifier reshaped what the top of the difficulty curve looked like. Players built routines around blurry whirl (5 ADD) as a launch node and whirl (3 ADD) as the resolution. By the late 2000s the modifier-stacking grammar that defines modern freestyle was largely in place, and European players began to assert serious competitive presence in what had been a North-American-dominated scene.',
    keyFigures: ['Václav Klouda', 'Stefan Siegert', 'Greg Solis', 'Byrin Wylie', 'Damian Gielnicki', 'Mariusz Wilk', 'Honza Weber'],
  },
  {
    period: '2010–2019',
    label: 'European Center of Gravity',
    summary:
      'The decade where freestyle\'s competitive heart shifted firmly to Europe. Average sequence ADD held steady around 3.1–3.3; what changed was depth — more players reaching the technical frontier the 2000s had defined. Václav Klouda extended his already-extraordinary career; a Polish, Czech, and German technical cluster pushed sequencing and consistency forward. The vocabulary kept refining; the community kept widening. 41 documented freestyle events.',
    keyFigures: ['Václav Klouda', 'Damian Gielnicki', 'Mariusz Wilk', 'Matthias Lino Schmidt', 'Filip Wojcik', 'Andreas Nawrath'],
  },
  {
    period: '2020–present',
    label: 'Refinement & Reconnection',
    summary:
      'Competitive activity rebuilt after the COVID interruption. The trick grammar settled into recognizable form years earlier; today\'s edge sits in execution quality, sequence architecture, and the depth of players who can sustain it. New players keep entering the circle. The range of recombinations available within the established vocabulary is enormous, and creative players continue to find fresh combinations within it. 12+ events documented through 2025.',
    keyFigures: ['Václav Klouda', 'Daniel Cadavid', 'Milan Benda', 'Miquel Clemente'],
  },
];

export const HISTORY_ADD_SYSTEM: string[] = [
  'The ADD system gave the community a shared way to talk about difficulty. It assigns a base value to each trick and adds bonuses for the modifiers layered on top. Base values reflect the minimum mechanical demand of a trick — the number of distinct body actions required within a single set cycle — turning what players already felt intuitively into something legible across players, eras, and contests.',
  'Modifiers are the body mechanics layered onto a base: rotations (spinning, blurry), dexterities (pixie, fairy), and positional constraints (ducking, symposium, paradox, atomic). Modifiers also interact with the base they attach to. A rotational base — mirage, whirl, torque — receives +2 from blurry rather than +1, because wrapping a blur around an already-rotating body is meaningfully harder than blurring a non-rotating base. Small details like this are what give the system its texture.',
  'The highest single-trick ADD in well-documented competitive play sits at 6: food processor (blurry blender = blurry+blender, 4+2) and blurry symposium whirl (symposium +1, blurry +2, whirl 3). Community discussion of 7-ADD constructions continues, and individual executions have been claimed; documenting them at sustained competitive scale remains an open frontier.',
  'By the late 2000s the trick grammar had largely settled. The decades since haven\'t shown many genuinely new base structures — but they\'ve shown enormous growth in how players combine, sequence, and execute the existing vocabulary. The frontier moved from "what new trick can be invented?" to "how cleanly, how consistently, how creatively can the established palette be played?" Both questions remain open.',
];
