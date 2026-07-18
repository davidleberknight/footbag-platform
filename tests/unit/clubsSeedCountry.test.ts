/**
 * The club country page groups strictly on the stored country value, so a wrong
 * country in the seed silently files a club under the wrong nation with no
 * behavioural error to catch it. Two clubs were misfiled under Argentina: a club
 * in Athens (Greece) and a club in the Kutaisi area (Georgia). This reads the
 * committed seed and pins their corrected countries, and guards the general
 * shape by rejecting any club whose city is one of those two capitals/areas yet
 * still claims Argentina.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface SeedClub { key: string; name: string; city: string; region: string; country: string }

function loadSeedClubs(): SeedClub[] {
  const csv = readFileSync(join(process.cwd(), 'legacy_data/seed/clubs.csv'), 'utf8');
  const lines = csv.split('\n').filter((l) => l.length > 0);
  const [, ...rows] = lines; // header: legacy_club_key,name,city,region,country,...
  return rows.map((line) => {
    // Simple positional split is safe here: the first five columns never contain
    // a comma in this seed. Anything after the fifth is club-supplied free text
    // we do not read.
    const cols = line.split(',');
    return { key: cols[0], name: cols[1], city: cols[2], region: cols[3], country: cols[4] };
  });
}

describe('clubs seed country classification', () => {
  const clubs = loadSeedClubs();

  it('the Athens club is filed under Greece', () => {
    const club = clubs.find((c) => c.key === '1486385137');
    expect(club, 'Greece Footbag Community (key 1486385137) should exist in the seed').toBeDefined();
    expect(club!.name).toBe('Greece Footbag Community');
    expect(club!.city).toBe('Athens');
    expect(club!.country).toBe('Greece');
  });

  it('the Kutaisi-area club is filed under Georgia', () => {
    const club = clubs.find((c) => c.key === '1438092592');
    expect(club, 'Kutaisi Footbag Club (key 1438092592) should exist in the seed').toBeDefined();
    expect(club!.name).toBe('Kutaisi Footbag Club');
    expect(club!.city).toBe('Mglebi');
    expect(club!.country).toBe('Georgia');
  });

  it('no Athens or Mglebi club is misfiled under Argentina', () => {
    const misfiled = clubs.filter(
      (c) => (c.city === 'Athens' || c.city === 'Mglebi') && c.country === 'Argentina',
    );
    expect(misfiled.map((c) => c.name)).toEqual([]);
  });
});
