/**
 * The pure reading of an organizer's results file: parse it, check that it
 * is well formed as results, match each named competitor against the event's
 * confirmed registrations, and say what committing it would write. No
 * database access; EventService supplies the event's divisions and
 * registrants and acts on the result.
 *
 * The file is CSV with one header row and one row per placed entry:
 * competition, sport (only for a competition the event does not carry),
 * place, player, partner (doubles) and score (optional, kept as written).
 * A header may also say division for competition and category for sport.
 *
 * The same text is read twice, at preview and at commit, with the organizer's
 * decisions from the preview (which repeated places are ties, which unknown
 * divisions really ran). Nothing is held between the two reads.
 *
 * Every named competitor must match exactly one of the event's confirmed
 * registrations: a name that matches none, or several, is a problem naming
 * its row, so a result is never recorded as a name without its member. A
 * doubles row naming a competitor whose own entry in that division names no
 * partner is refused the same way: the organizer adds the partner to the
 * entry first, so results and registrations agree.
 */
import { parseCsv, startsLikeFormula } from '../lib/csv';
import { CURRENT_SPORTS, SPORT_LABELS } from './sportCategories';

export const RESULTS_FILE_MAX_BYTES = 256 * 1024;
export const RESULTS_FILE_MAX_ROWS = 2000;
const NAME_MAX = 100;
const SCORE_MAX = 100;

export const RESULTS_COLUMNS = ['competition', 'sport', 'place', 'player', 'partner', 'score'] as const;
const REQUIRED_COLUMNS = ['competition', 'place', 'player'] as const;
// Header names a file may carry instead, each read as the column it stands for.
const COLUMN_ALIASES: Record<string, string> = { division: 'competition', category: 'sport' };

// The sports an upload may name for a competition the event did not list.
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CURRENT_SPORTS.map((s) => [s, SPORT_LABELS[s]]),
);

export interface ResultsEventDivision {
  id: string;
  name: string;
  teamType: string;
  hasResults: boolean;
}

export interface ResultsCandidate {
  registrationId: string;
  memberId: string;
  displayName: string;
  historicalPersonId: string | null;
  /** The doubles divisions this registration entered without a partner. */
  partnerlessDivisionIds?: readonly string[];
}

export interface ResultsDecisions {
  /** `${divisionKey}|${place}` for each repeated place the organizer declared a tie. */
  ties: ReadonlySet<string>;
  /** Folded names of unknown divisions the organizer confirmed were contested. */
  newDivisions: ReadonlySet<string>;
}

export interface ResultsCompetitor {
  name: string;
  match: ResultsCandidate | null;
}

export interface ResultsPlacement {
  place: number;
  competitors: ResultsCompetitor[];
  score: string | null;
  isTie: boolean;
}

export interface ResultsGroup {
  /** Folded division name: the key ties and confirmations are keyed by. */
  key: string;
  name: string;
  /** The event's division, or null for one it does not carry. */
  divisionId: string | null;
  category: string | null;
  categoryLabel: string | null;
  teamType: 'singles' | 'doubles';
  isConfirmedNew: boolean;
  placements: ResultsPlacement[];
  /** Places more than one entry holds, each needing the organizer's tie declaration. */
  repeatedPlaces: Array<{ place: number; tieKey: string; declared: boolean }>;
}

export interface ResultsPreview {
  /** Problems that refuse the whole file before anything is read as results. */
  fileErrors: string[];
  /** Problems the organizer must fix in the file or settle in the preview. */
  problems: string[];
  groups: ResultsGroup[];
  /** Unknown divisions awaiting the organizer's confirmation, by key and name. */
  unknownDivisions: Array<{ key: string; name: string; confirmed: boolean }>;
  rowCount: number;
  /** The event's advertised divisions the file carries no rows for. */
  missingDivisions: string[];
  /** True when committing would write: no file error and no problem left. */
  committable: boolean;
}

/** A name or division compared without case, accents or repeated spaces. */
export function foldName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function categoryFrom(raw: string): string | null {
  const key = foldName(raw).replace(/[\s-]+/g, '_');
  return key in CATEGORY_LABELS ? key : null;
}

/** The blank file an organizer downloads to fill in. */
export function resultsFileTemplate(): string {
  return `${RESULTS_COLUMNS.join(',')}\r\n`;
}

function emptyPreview(fileErrors: string[]): ResultsPreview {
  return {
    fileErrors, problems: [], groups: [], unknownDivisions: [], rowCount: 0,
    missingDivisions: [], committable: false,
  };
}

/**
 * Read a results file against the event. `decisions` carries what the
 * organizer settled in the preview; a first read passes none.
 */
export function readResultsFile(
  text: string,
  divisions: readonly ResultsEventDivision[],
  candidates: readonly ResultsCandidate[],
  decisions: ResultsDecisions,
): ResultsPreview {
  if (Buffer.byteLength(text, 'utf8') > RESULTS_FILE_MAX_BYTES) {
    return emptyPreview([`The file is larger than ${RESULTS_FILE_MAX_BYTES / 1024} KB.`]);
  }
  const parsed = parseCsv(text);
  if (!parsed.ok) {
    return emptyPreview([`The file is not readable as CSV: a quotation mark on line ${parsed.line} is out of place.`]);
  }
  const [header, ...body] = parsed.rows;
  if (!header) return emptyPreview(['The file is empty.']);
  const columns = header.map((h) => {
    const folded = foldName(h);
    return COLUMN_ALIASES[folded] ?? folded;
  });
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    return emptyPreview([`The first row must name the columns. Missing: ${missing.join(', ')}.`]);
  }
  if (body.length === 0) return emptyPreview(['The file has no result rows.']);
  if (body.length > RESULTS_FILE_MAX_ROWS) {
    return emptyPreview([`The file has more than ${RESULTS_FILE_MAX_ROWS} result rows.`]);
  }
  for (let i = 0; i < parsed.rows.length; i += 1) {
    if (parsed.rows[i].some((cell) => startsLikeFormula(cell.trim()))) {
      return emptyPreview([
        `Row ${i + 1} has a cell starting with =, +, - or @, which a spreadsheet would run as a formula. Remove it and upload again.`,
      ]);
    }
  }

  const col = (row: string[], name: string): string => {
    const at = columns.indexOf(name);
    return at === -1 ? '' : (row[at] ?? '').trim();
  };
  const byFold = new Map(divisions.map((d) => [foldName(d.name), d]));
  const byCandidate = new Map<string, ResultsCandidate[]>();
  for (const c of candidates) {
    const key = foldName(c.displayName);
    byCandidate.set(key, [...(byCandidate.get(key) ?? []), c]);
  }
  // Rows naming someone who matches no confirmed registration, or several.
  const unregistered: string[] = [];
  const ambiguous: string[] = [];
  // Rows placing a doubles entry whose registration names no partner.
  const partnerless: string[] = [];
  const matchName = (name: string, line: number): ResultsCandidate | null => {
    const found = byCandidate.get(foldName(name)) ?? [];
    if (found.length === 0) unregistered.push(`row ${line} (${name})`);
    if (found.length > 1) ambiguous.push(`row ${line} (${name})`);
    return found.length === 1 ? found[0] : null;
  };

  const problems: string[] = [];
  const groups = new Map<string, ResultsGroup>();
  body.forEach((row, index) => {
    const line = index + 2;
    const divisionName = col(row, 'competition');
    const placeText = col(row, 'place');
    const player = col(row, 'player');
    const partner = col(row, 'partner');
    const score = col(row, 'score');
    if (divisionName === '') { problems.push(`Row ${line} names no competition.`); return; }
    if (!/^\d{1,4}$/.test(placeText) || Number(placeText) < 1) {
      problems.push(`Row ${line} needs a place: a whole number from 1.`);
      return;
    }
    if (player === '') { problems.push(`Row ${line} names no player.`); return; }
    if ([divisionName, player, partner].some((v) => v.length > NAME_MAX)) {
      problems.push(`Row ${line} has a name longer than ${NAME_MAX} characters.`);
      return;
    }
    if (score.length > SCORE_MAX) {
      problems.push(`Row ${line} has a score longer than ${SCORE_MAX} characters.`);
      return;
    }
    const key = foldName(divisionName);
    let group = groups.get(key);
    if (!group) {
      const known = byFold.get(key) ?? null;
      const category = known ? null : categoryFrom(col(row, 'sport'));
      group = {
        key,
        name: known ? known.name : divisionName,
        divisionId: known?.id ?? null,
        category,
        categoryLabel: category ? CATEGORY_LABELS[category] : null,
        teamType: known ? (known.teamType === 'doubles' ? 'doubles' : 'singles') : (partner !== '' ? 'doubles' : 'singles'),
        isConfirmedNew: !known && decisions.newDivisions.has(key),
        placements: [],
        repeatedPlaces: [],
      };
      groups.set(key, group);
      if (known?.hasResults) {
        problems.push(`${known.name} already has results. An IFPA administrator corrects published results.`);
      }
      if (!known && !category) {
        problems.push(`${divisionName} is not one of this event's competitions, so its sport column must say net, freestyle, golf, consecutives or x-square.`);
      }
    }
    if (group.teamType === 'singles' && partner !== '') {
      problems.push(`Row ${line} names a partner, but ${group.name} is a singles competition.`);
      return;
    }
    if (group.teamType === 'doubles' && partner === '') {
      problems.push(`Row ${line} names no partner, but ${group.name} is a doubles competition.`);
      return;
    }
    const competitors = [player, ...(partner !== '' ? [partner] : [])].map((name) => ({ name, match: matchName(name, line) }));
    const divisionId = group.divisionId;
    if (divisionId && group.teamType === 'doubles') {
      const flagged = competitors.find((c) => c.match?.partnerlessDivisionIds?.includes(divisionId));
      if (flagged) partnerless.push(`row ${line} (${flagged.name})`);
    }
    group.placements.push({ place: Number(placeText), competitors, score: score === '' ? null : score, isTie: false });
  });

  for (const group of groups.values()) {
    group.placements.sort((a, b) => a.place - b.place);
    const counts = new Map<number, number>();
    for (const p of group.placements) counts.set(p.place, (counts.get(p.place) ?? 0) + 1);
    for (const [place, count] of counts) {
      if (count < 2) continue;
      const tieKey = `${group.key}|${place}`;
      const declared = decisions.ties.has(tieKey);
      group.repeatedPlaces.push({ place, tieKey, declared });
      for (const p of group.placements) if (p.place === place) p.isTie = declared;
      if (!declared) {
        problems.push(`${group.name}: place ${place} appears ${count} times. Tick it as a tie, or correct the file.`);
        continue;
      }
      // Tied entries share the place and the places they would have taken are skipped.
      const crowded = [...counts.keys()].filter((q) => q > place && q < place + count);
      if (crowded.length > 0) {
        problems.push(`${group.name}: ${count} entries tie at place ${place}, so the next place is ${place + count}, not ${crowded[0]}.`);
      }
    }
  }

  const unknownDivisions = [...groups.values()]
    .filter((g) => g.divisionId === null && g.category !== null)
    .map((g) => ({ key: g.key, name: g.name, confirmed: g.isConfirmedNew }));
  for (const u of unknownDivisions) {
    if (!u.confirmed) problems.push(`${u.name} is not one of this event's competitions. Tick it if it was contested.`);
  }

  let rowCount = 0;
  for (const g of groups.values()) rowCount += g.placements.length;
  if (unregistered.length > 0) {
    problems.push(`These names match no confirmed registration for this event: ${unregistered.join(', ')}. Correct each name to match the registration, and upload the file again.`);
  }
  if (ambiguous.length > 0) {
    problems.push(`These names match more than one confirmed registration for this event: ${ambiguous.join(', ')}.`);
  }
  if (partnerless.length > 0) {
    problems.push(`Results place a doubles pair whose registrations don't name each other: ${partnerless.join(', ')}. Pair them with Edit Entry on the participant list, then upload the file again.`);
  }
  const present = new Set([...groups.values()].map((g) => g.divisionId).filter(Boolean));
  const missingDivisions = divisions.filter((d) => !d.hasResults && !present.has(d.id)).map((d) => d.name);

  const ordered = [...groups.values()];
  return {
    fileErrors: [],
    problems,
    groups: ordered,
    unknownDivisions,
    rowCount,
    missingDivisions,
    committable: problems.length === 0 && ordered.length > 0,
  };
}
