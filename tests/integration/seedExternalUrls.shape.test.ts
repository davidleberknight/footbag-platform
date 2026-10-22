/**
 * Every external URL in committed seed data must be a possible web address.
 *
 * This is the cheap half of URL validation and the only half that can be
 * enforced automatically. Shape needs no network, no API key and no
 * configuration, so it is asserted here on every run. Whether an address is
 * safe and reachable is the expensive half: it needs live third-party lookups,
 * so it happens at data-prep time and is recorded in committed verdict
 * companions, which is why nothing in this file makes a request.
 *
 * Without this gate the only way to find a bogus URL was to look at the page it
 * rendered on. Four club rows held prose rather than an address, one per club:
 * the first word of a Spanish welcome, the first word of "Coming soon", a label
 * with a stray colon, and a lone hyphen. Each parsed as a valid URL with a
 * single-label host, so the safety pass stamped all four verified and every club
 * page showed a dead link.
 *
 * There is deliberately no exception list. A known-bad row allowed to stay is
 * how these survived in the first place; a bogus URL is fixed at its source, in
 * the curated club overrides, not recorded here as tolerated.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { listFiles } from '../fixtures/sourceTree';
import { parseCsvRecords } from '../../scripts/verify-seed-urls';
import { structuralUrlRejection } from '../../src/lib/externalUrlShape';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLUB_SEED = path.join(REPO_ROOT, 'legacy_data', 'seed', 'clubs.csv');
const GALLERY_DIR = path.join(REPO_ROOT, 'curated', 'galleries');
const GALLERY_VERDICTS = 'url_verdicts.json';

interface SeedUrl {
  source: string;
  url: string;
}

function clubSeedUrls(): SeedUrl[] {
  if (!fs.existsSync(CLUB_SEED)) return [];
  const records = parseCsvRecords(fs.readFileSync(CLUB_SEED, 'utf8'));
  const header = records[0] ?? [];
  const keyIdx = header.indexOf('legacy_club_key');
  const urlIdx = header.indexOf('external_url');
  expect(keyIdx, 'club seed must carry a legacy_club_key column').toBeGreaterThanOrEqual(0);
  expect(urlIdx, 'club seed must carry an external_url column').toBeGreaterThanOrEqual(0);
  const out: SeedUrl[] = [];
  for (const record of records.slice(1)) {
    const key = (record[keyIdx] ?? '').trim();
    const url = (record[urlIdx] ?? '').trim();
    if (!key || !url) continue;
    out.push({ source: `club ${key}`, url });
  }
  return out;
}

function gallerySidecarUrls(): SeedUrl[] {
  if (!fs.existsSync(GALLERY_DIR)) return [];
  const out: SeedUrl[] = [];
  for (const file of listFiles('curated/galleries', /\.json$/)) {
    if (file === GALLERY_VERDICTS) continue;
    const sidecar = JSON.parse(fs.readFileSync(path.join(GALLERY_DIR, file), 'utf8')) as {
      id?: string;
      externalLinks?: Array<{ url?: string }>;
    };
    if (!Array.isArray(sidecar.externalLinks)) continue;
    for (const link of sidecar.externalLinks) {
      const url = (link.url ?? '').trim();
      if (url) out.push({ source: `gallery ${sidecar.id ?? file}`, url });
    }
  }
  return out;
}

/** Every rejected URL, named with where it came from so a failure is actionable. */
function rejections(urls: SeedUrl[]): string[] {
  return urls
    .map((u) => ({ ...u, reason: structuralUrlRejection(u.url) }))
    .filter((u) => u.reason !== null)
    .map((u) => `${u.source}: ${u.url} -- ${u.reason}`);
}

describe('committed seed external URLs are possible web addresses', () => {
  it('the club seed carries URLs to check, so this suite cannot pass vacuously', () => {
    expect(clubSeedUrls().length).toBeGreaterThan(0);
  });

  it('every club seed URL survives shape validation', () => {
    expect(rejections(clubSeedUrls())).toEqual([]);
  });

  it('the gallery sidecars carry URLs to check, so this suite cannot pass vacuously', () => {
    // The sibling assertion on the club seed has guarded this from the start.
    // Without the same guard here, an empty directory, a renamed one, or a
    // sidecar shape that stopped matching would leave the next assertion reading
    // an empty list and reporting success, which is the exact failure this file
    // exists to catch.
    expect(gallerySidecarUrls().length).toBeGreaterThan(0);
  });

  it('every curator gallery sidecar URL survives shape validation', () => {
    expect(rejections(gallerySidecarUrls())).toEqual([]);
  });

  it('every club seed URL carries a committed safety verdict', () => {
    // Same failure as the galleries below: the club loader stamps a link from the
    // committed verdicts and leaves an uncovered one unverified, which the public
    // club page hides, and no ship gate checks clubs at all.
    const file = path.join(REPO_ROOT, 'legacy_data', 'seed', 'clubs_url_verdicts.csv');
    const records = fs.existsSync(file) ? parseCsvRecords(fs.readFileSync(file, 'utf8')) : [];
    const header = records[0] ?? [];
    const [k, u, v, q] = ['legacy_club_key', 'external_url', 'validated_at', 'quarantine_reason'].map((c) =>
      header.indexOf(c),
    );
    const verdicted = new Set(
      records
        .slice(1)
        .filter((r) => (r[v!] ?? '') !== '' || (r[q!] ?? '') !== '')
        .map((r) => `club ${(r[k!] ?? '').trim()}|${(r[u!] ?? '').trim()}`),
    );
    const missing = clubSeedUrls()
      .filter((s) => !verdicted.has(`${s.source}|${s.url}`))
      .map((s) => `${s.source}: ${s.url}`);
    expect(
      missing,
      'run: npm run verify:seed-urls -- --safe-browsing-key-from production, then commit legacy_data/seed/clubs_url_verdicts.csv',
    ).toEqual([]);
  });

  it('every curator gallery sidecar URL carries a committed safety verdict', () => {
    // The curator seed reads the committed verdicts file and loads any link it
    // does not cover with no verdict, which the public gallery page hides. The
    // only check on the built database is the production ship gate, so a link
    // added without running the verifier stayed invisible until a production
    // deploy refused the database. Checking coverage here moves that failure to
    // the push that added the link. A quarantine is a verdict; only a missing
    // entry, or an entry with neither field set, fails.
    const file = path.join(GALLERY_DIR, GALLERY_VERDICTS);
    const verdicts: Record<string, Record<string, { validated_at?: string | null; quarantine_reason?: string | null }>> =
      fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const missing = gallerySidecarUrls()
      .filter((u) => {
        const id = u.source.replace(/^gallery /, '');
        const v = verdicts[id]?.[u.url];
        return !v || (!v.validated_at && !v.quarantine_reason);
      })
      .map((u) => `${u.source}: ${u.url}`);
    expect(
      missing,
      'run: npm run verify:seed-urls -- --galleries-only --safe-browsing-key-from production, then commit curated/galleries/url_verdicts.json',
    ).toEqual([]);
  });

  it('the gate rejects the shapes that reached public pages, so it demonstrably bites', () => {
    const wouldHaveCaught = [
      { source: 'regression', url: 'http://Coming' },
      { source: 'regression', url: 'http://Bienvenidos' },
      { source: 'regression', url: 'http://e-mail:' },
      { source: 'regression', url: 'http://-' },
    ];
    expect(rejections(wouldHaveCaught)).toHaveLength(4);
  });
});
