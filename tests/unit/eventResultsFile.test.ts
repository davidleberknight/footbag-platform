/**
 * Reading an organizer's results file into what committing it would write:
 * the file is refused when it is not well formed as results, ties are shared
 * places that skip the places they take up, every name must match exactly one
 * confirmed registration or the file is refused naming its rows, and a division the
 * event did not advertise is written only once the organizer confirms it ran.
 */
import { describe, it, expect } from 'vitest';
import {
  foldName, readResultsFile, resultsFileTemplate, RESULTS_FILE_MAX_BYTES, RESULTS_FILE_MAX_ROWS,
  type ResultsCandidate, type ResultsDecisions, type ResultsEventDivision,
} from '../../src/services/eventResultsFile';

const SINGLES: ResultsEventDivision = { id: 'd-singles', name: 'Open Singles Footbag Net', teamType: 'singles', hasResults: false };
const DOUBLES: ResultsEventDivision = { id: 'd-doubles', name: 'Open Doubles Footbag Net', teamType: 'doubles', hasResults: false };
const ANNA: ResultsCandidate = { registrationId: 'r-anna', memberId: 'm-anna', displayName: 'Anna Ångström', historicalPersonId: 'hp-anna' };
const BEN: ResultsCandidate = { registrationId: 'r-ben', memberId: 'm-ben', displayName: 'Ben Ito', historicalPersonId: null };
const CARA: ResultsCandidate = { registrationId: 'r-cara', memberId: 'm-cara', displayName: 'Cara Diaz', historicalPersonId: null };

const NONE: ResultsDecisions = { ties: new Set(), newDivisions: new Set() };
const HEADER = 'division,category,place,player,partner,score\n';

function read(body: string, decisions: Partial<ResultsDecisions> = {}, divisions = [SINGLES, DOUBLES]) {
  return readResultsFile(HEADER + body, divisions, [ANNA, BEN, CARA], { ...NONE, ...decisions });
}

describe('readResultsFile', () => {
  it('reads a clean file into its divisions with every competitor matched and nothing left to settle', () => {
    // A well-formed file must be committable at once, its rows grouped under the event's own divisions.
    const out = read('open singles footbag net,,2,Ben Ito,,21-15\nOpen Singles Footbag Net,,1,anna angstrom,,\n');
    expect(out.committable).toBe(true);
    expect(out.problems).toEqual([]);
    expect(out.rowCount).toBe(2);
    const [group] = out.groups;
    expect(group.divisionId).toBe('d-singles');
    expect(group.placements.map((p) => [p.place, p.competitors[0].match?.memberId, p.score])).toEqual([
      [1, 'm-anna', null], [2, 'm-ben', '21-15'],
    ]);
  });

  it('names the advertised divisions the file carries no rows for, without refusing it', () => {
    // A sanctioned event owes every division's results; the organizer must be told which are missing.
    const out = read('Open Singles Footbag Net,,1,Ben Ito,,\n');
    expect(out.committable).toBe(true);
    expect(out.missingDivisions).toEqual(['Open Doubles Footbag Net']);
  });

  it('refuses a repeated place until the organizer declares it a tie', () => {
    // Two entries at one place with no tie declared is how a typo in the place column looks.
    const body = 'Open Singles Footbag Net,,1,Anna Ångström,,\nOpen Singles Footbag Net,,1,Ben Ito,,\n';
    const undeclared = read(body);
    expect(undeclared.committable).toBe(false);
    expect(undeclared.groups[0].repeatedPlaces).toEqual([{ place: 1, tieKey: `${foldName(SINGLES.name)}|1`, declared: false }]);
    const declared = read(body, { ties: new Set([`${foldName(SINGLES.name)}|1`]) });
    expect(declared.committable).toBe(true);
    expect(declared.groups[0].placements.every((p) => p.isTie)).toBe(true);
  });

  it('refuses a declared tie followed by a place the tie took up', () => {
    // Two tied at 3rd take 3rd and 4th, so the next entry is 5th; a 4th means a wrong place somewhere.
    const tie = new Set([`${foldName(SINGLES.name)}|3`]);
    const body = (next: number) =>
      `Open Singles Footbag Net,,3,Anna Ångström,,\nOpen Singles Footbag Net,,3,Ben Ito,,\nOpen Singles Footbag Net,,${next},Cara Diaz,,\n`;
    expect(read(body(4), { ties: tie }).committable).toBe(false);
    expect(read(body(5), { ties: tie }).committable).toBe(true);
  });

  it('refuses a name that matches no registration, or more than one, naming each such row', () => {
    // A result saved as a bare name would credit nobody; the organizer must be told which rows to correct.
    const twins = [ANNA, BEN, { ...BEN, registrationId: 'r-ben2', memberId: 'm-ben2' }];
    const out = readResultsFile(
      `${HEADER}Open Singles Footbag Net,,1,Ben Ito,,\nOpen Singles Footbag Net,,2,Dana Non-Member,,\nOpen Singles Footbag Net,,3,Anna Ångström,,\n`,
      [SINGLES], twins, NONE,
    );
    expect(out.groups[0].placements.map((p) => p.competitors[0].match?.memberId ?? null)).toEqual([null, null, 'm-anna']);
    expect(out.committable).toBe(false);
    const said = out.problems.join(' ');
    expect(said).toContain('row 2 (Ben Ito)');
    expect(said).toContain('row 3 (Dana Non-Member)');
    expect(said).not.toContain('row 4');
    // A doubles partner is matched the same way as the player.
    const partner = read('Open Doubles Footbag Net,,1,Anna Ångström,Pat Partner,\n', {}, [DOUBLES]);
    expect(partner.committable).toBe(false);
    expect(partner.problems.join(' ')).toContain('row 2 (Pat Partner)');
  });

  it('holds a division the event did not advertise until the organizer confirms it ran, and needs its category', () => {
    // A division name typed wrong must not silently create a new division on the event.
    const noCategory = read('Shred 30,,1,Anna Ångström,,\n');
    expect(noCategory.unknownDivisions).toEqual([]);
    expect(noCategory.committable).toBe(false);
    const body = 'Shred 30,X-Square,1,Anna Ångström,,\n';
    const unconfirmed = read(body);
    expect(unconfirmed.unknownDivisions).toEqual([{ key: 'shred 30', name: 'Shred 30', confirmed: false }]);
    expect(unconfirmed.committable).toBe(false);
    const confirmed = read(body, { newDivisions: new Set(['shred 30']) });
    expect(confirmed.committable).toBe(true);
    expect(confirmed.groups[0]).toMatchObject({ divisionId: null, category: 'x_square', teamType: 'singles' });
  });

  it('refuses rows added to a division that already has results', () => {
    // A second upload must not double a division's placings; corrections are an administrator's.
    const out = read('Open Singles Footbag Net,,1,Anna Ångström,,\n', {}, [{ ...SINGLES, hasResults: true }, DOUBLES]);
    expect(out.committable).toBe(false);
  });

  it('requires a partner in a doubles division and refuses one in a singles division', () => {
    // A doubles placing recorded with one name loses a competitor's result.
    expect(read('Open Doubles Footbag Net,,1,Anna Ångström,,\n').committable).toBe(false);
    expect(read('Open Singles Footbag Net,,1,Anna Ångström,Ben Ito,\n').committable).toBe(false);
    const ok = read('Open Doubles Footbag Net,,1,Anna Ångström,Ben Ito,\n', {}, [DOUBLES]);
    expect(ok.committable).toBe(true);
    expect(ok.groups[0].placements[0].competitors.map((c) => c.match?.memberId)).toEqual(['m-anna', 'm-ben']);
  });

  it('refuses a doubles row placing an entry whose registration names no partner, naming the row', () => {
    // Defect caught: a doubles result is published for an entry the
    // registrations say has no partner, so results and registrations disagree
    // about who played.
    const partnerless = { ...ANNA, partnerlessDivisionIds: [DOUBLES.id] };
    const out = readResultsFile(
      `${HEADER}Open Doubles Footbag Net,,1,Ben Ito,Anna Ångström,\nOpen Doubles Footbag Net,,2,Cara Diaz,Ben Ito,\n`,
      [DOUBLES], [partnerless, BEN, CARA], NONE,
    );
    expect(out.committable).toBe(false);
    const said = out.problems.join(' ');
    expect(said).toContain('row 2 (Anna Ångström)');
    expect(said).not.toContain('row 3');
    // The flag is per division: the same registrant placing in singles is fine.
    const singles = readResultsFile(`${HEADER}Open Singles Footbag Net,,1,Anna Ångström,,\n`, [SINGLES, DOUBLES], [partnerless], NONE);
    expect(singles.committable).toBe(true);
  });

  it('refuses a row with no place or a place that is not a whole number from 1', () => {
    for (const place of ['', '0', '1st', '2.5']) {
      expect(read(`Open Singles Footbag Net,,${place},Anna Ångström,,\n`).committable, place).toBe(false);
    }
  });

  it('refuses the whole file for a cell a spreadsheet would run as a formula', () => {
    // A formula stored as a name would run in whoever opens the results later.
    const out = read('Open Singles Footbag Net,,1,=HYPERLINK("x"),,\n');
    expect(out.fileErrors).toHaveLength(1);
    expect(out.groups).toEqual([]);
    expect(out.committable).toBe(false);
  });

  it('reads a file under the blank template\'s header the same as one under the division and category header', () => {
    // An organizer who fills in the downloaded blank file would otherwise be
    // refused for missing columns, or have the sport of an unlisted contest ignored.
    const body = 'Open Singles Footbag Net,,1,Anna Ångström,,\nMixed Footbag Net,net,1,Ben Ito,Cara Diaz,\n';
    const decisions = { ...NONE, newDivisions: new Set([foldName('Mixed Footbag Net')]) };
    const fromTemplate = readResultsFile(resultsFileTemplate() + body, [SINGLES, DOUBLES], [ANNA, BEN, CARA], decisions);
    const fromOldHeader = readResultsFile(HEADER + body, [SINGLES, DOUBLES], [ANNA, BEN, CARA], decisions);
    expect(fromTemplate.fileErrors).toEqual([]);
    expect(fromTemplate.problems).toEqual([]);
    expect(fromTemplate.groups.map((g) => [g.divisionId, g.category])).toEqual([['d-singles', null], [null, 'net']]);
    expect(fromTemplate).toEqual(fromOldHeader);
  });

  it('refuses a file missing a required column, or with no result rows', () => {
    expect(readResultsFile('division,player\nNet,Anna\n', [SINGLES], [], NONE).fileErrors).toHaveLength(1);
    expect(readResultsFile(HEADER, [SINGLES], [], NONE).fileErrors).toHaveLength(1);
  });

  it('accepts a file at the size and row limits and refuses one past them', () => {
    // Pinned from both sides: the limit itself is accepted, one past it is refused.
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `Open Singles Footbag Net,,${i + 1},P${i},,`).join('\n');
    expect(readResultsFile(HEADER + rows(RESULTS_FILE_MAX_ROWS), [SINGLES], [], NONE).fileErrors).toEqual([]);
    expect(readResultsFile(HEADER + rows(RESULTS_FILE_MAX_ROWS + 1), [SINGLES], [], NONE).fileErrors).toHaveLength(1);
    const exact = HEADER + 'Open Singles Footbag Net,,1,Anna,,' + 'x'.repeat(RESULTS_FILE_MAX_BYTES - HEADER.length - 'Open Singles Footbag Net,,1,Anna,,'.length);
    expect(Buffer.byteLength(exact)).toBe(RESULTS_FILE_MAX_BYTES);
    expect(readResultsFile(exact, [SINGLES], [], NONE).fileErrors.join()).not.toMatch(/KB/);
    expect(readResultsFile(`${exact}x`, [SINGLES], [], NONE).fileErrors.join()).toMatch(/KB/);
  });
});
