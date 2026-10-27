/**
 * Every page view on the site, measured as the browser draws it, at phone and
 * desktop width, against the site's layout standard.
 *
 * One page per view: the check seeds the crawl corpus, walks the site by links
 * as each viewer and keeps the first page that names each view in its
 * development-only response header; views no link reaches are listed by URL,
 * and a view that answers a form is listed by the page carrying the form, which
 * the check fills and submits as a visitor would. A view in none of those fails
 * the check. Each page is then rendered at 390px and 1280px, captured, and
 * judged by the rendered-style rules, with axe's automated accessibility rules
 * at desktop width (colour contrast is left to the rules, which composite real
 * backgrounds) and anything the browser refused or reported while loading.
 *
 * Findings that exist today are listed in the known-findings baseline by rule,
 * view, viewport and count. A finding not listed, or a count above its line,
 * fails, and every offending page is reported in one failure. A fixed finding
 * never fails: run on a workstation, the check lowers the baseline itself, so it
 * only ever shrinks without anyone remembering a step. Accepting a new finding
 * as known is the one deliberate act: RENDERED_STYLE_WRITE_BASELINE=1.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, formatFinding, tableNamesFromSchema, type Finding } from './helpers/renderedStyle';
import { compareToBaseline, formatBaseline, formatBaselineEntries, measuredKey, normalisePageProblem, parseBaseline, shrinkBaseline } from './helpers/renderedStyleDiff';
import { capture, DESKTOP, MEASURE_SCRIPT, PHONE, VIEW_HEADER, walkFocus } from './helpers/renderedStyleCapture';
import { walkViews } from './helpers/pageWalk';
import { watchPageProblems } from './helpers/pageProblems';
import { scanWcagAa } from './helpers/axe';
import { openLiveDb } from './helpers/liveDb';
import { seedCrawlWorld } from '../fixtures/crawl/seedCrawlFixture';
import { submitForm } from './helpers/submitForm';
import {
  insertAuditEntry, insertClub, insertClubLeader, insertCuratorVideo, insertDiscipline, insertEmailArchive, insertEvent, insertFreeformTag,
  insertResultEntry, insertResultParticipant, insertResultsUpload,
  insertFreestyleEvAdjudication, insertFreestyleTrick, insertFreestyleTrickAlias,
  insertHistoricalPerson, insertLegacyMember, insertMediaItem, insertMediaJob, insertMember,
  insertMemberClubAffiliation, insertMemberGallery, insertNetTeam, insertPayment,
  insertRecurringDonationSubscription, insertSystemJobRun, insertTag, insertWorkQueueItem,
} from '../fixtures/factories';
import {
  EXEMPT, REACH, REACH_ROWS, STRESS, VIEWERS, forMember, listPageTemplates,
  STRESS_CLUB_KEY, STRESS_CLUB_NAME, STRESS_CLUB_URL,
  STRESS_TRICK_NAME, STRESS_TRICK_NOTATION, STRESS_TRICK_SLUG,
  STRESS_AUDIT_ENTITY_ID, STRESS_AUDIT_METADATA,
  type Reach,
} from '../fixtures/pageLists';

const BASELINE = path.resolve(__dirname, 'rendered-style-baseline.txt');
const ctx = { tableNames: tableNamesFromSchema(fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8')) };

test.beforeAll(() => {
  const db = openLiveDb();
  seedCrawlWorld(db);
  const tag = insertTag(db, { standard_type: 'club', tag_normalized: `#${STRESS_CLUB_KEY}`, tag_display: `#${STRESS_CLUB_KEY}` });
  insertClub(db, { id: 'club-stress-longest', hashtag_tag_id: tag, name: STRESS_CLUB_NAME, external_url: STRESS_CLUB_URL, city: 'Stress City' });
  insertFreestyleTrick(db, {
    slug: STRESS_TRICK_SLUG, canonical_name: STRESS_TRICK_NAME, adds: '9',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1, operational_notation: STRESS_TRICK_NOTATION,
  });
  // A displayed nickname rides on the same line as the name, so the longest row carries one.
  insertFreestyleTrickAlias(db, `${STRESS_TRICK_SLUG}_nick`, STRESS_TRICK_SLUG, 'the extraordinarily long community nickname', { alias_type: 'common', alias_display: 1 });
  insertAuditEntry(db, { action_type: 'admin.loss_alert_raised', entity_type: 'member', entity_id: STRESS_AUDIT_ENTITY_ID, metadata: STRESS_AUDIT_METADATA });

  // Rows the listed pages need, under the ids their URLs name.
  const member = 'member_persona_t1_paid';
  const eventTag = insertTag(db, { standard_type: 'event', tag_normalized: `#${REACH_ROWS.eventKey}`, tag_display: `#${REACH_ROWS.eventKey}` });
  insertEvent(db, { id: REACH_ROWS.eventId, hashtag_tag_id: eventTag, title: 'Rendered Style Open' });
  const playerA = insertHistoricalPerson(db, { person_id: REACH_ROWS.playerAId, person_name: 'Rendered Style Player A' });
  const playerB = insertHistoricalPerson(db, { person_name: 'Rendered Style Player B' });
  // One published result, so the administrator's correction pages have a row to open.
  insertDiscipline(db, REACH_ROWS.eventId, { id: REACH_ROWS.resultDisciplineId, name: 'Open Singles Net', discipline_category: 'net' });
  const upload = insertResultsUpload(db, REACH_ROWS.eventId, 'member_persona_admin_t2');
  insertResultEntry(db, REACH_ROWS.eventId, upload, REACH_ROWS.resultDisciplineId, { id: REACH_ROWS.resultEntryId, score_text: '15-11' });
  insertResultParticipant(db, REACH_ROWS.resultEntryId, 'Rendered Style Player A', { historical_person_id: playerA });
  insertNetTeam(db, { team_id: REACH_ROWS.netTeamId, person_id_a: playerA, person_id_b: playerB });
  insertMemberGallery(db, { id: REACH_ROWS.memberGalleryId, owner_member_id: member, created_by: member, name: 'Rendered Style Gallery', description: '', is_default: 0 });
  insertMediaItem(db, { id: REACH_ROWS.memberMediaId, uploader_member_id: member, caption: 'Rendered style upload' });
  insertPayment(db, { id: REACH_ROWS.paymentId, member_id: member, status: 'succeeded', stripe_checkout_session_id: REACH_ROWS.checkoutSessionId });
  insertRecurringDonationSubscription(db, { member_id: member, stripe_subscription_id: REACH_ROWS.recurringSubscriptionId, status: 'active', amount_cents: 2500 });
  insertCuratorVideo(db, { uploaderMemberId: 'crawl-fh-system', sourceFilename: 'rendered-style.mp4', slotTag: '#rendered_style_demo', mediaId: REACH_ROWS.curatorMediaId });
  insertMediaJob(db, { id: REACH_ROWS.curatorJobId, admin_member_id: 'member_persona_admin_t2' });
  insertEmailArchive(db, { id: REACH_ROWS.broadcastId, sender_member_id: 'member_persona_admin_t2', recipient_count: 12 });
  insertSystemJobRun(db, { id: REACH_ROWS.reconciliationRunId, job_name: 'SYS_Reconcile_Payments_Nightly' });
  insertFreestyleEvAdjudication(db, { candidate_id: REACH_ROWS.backlogCandidateId, submitted_name: 'Rendered Style Backlog Candidate', blocker_id: 'D1' });
  insertFreeformTag(db, { tag_normalized: `#${REACH_ROWS.retirableTag}`, tag_display: `#${REACH_ROWS.retirableTag}` });

  // A dispute: another member's claim took the old account the requester says is theirs.
  insertMember(db, { id: REACH_ROWS.disputeHolderId, real_name: 'Rendered Style Holder', legacy_member_id: REACH_ROWS.disputedLegacyId });
  insertLegacyMember(db, { legacy_member_id: REACH_ROWS.disputedLegacyId, real_name: 'Rendered Style Holder', claimed_by_member_id: REACH_ROWS.disputeHolderId, claimed_at: '2026-01-01T00:00:00.000Z' });
  insertMember(db, { id: REACH_ROWS.disputeRequesterId, real_name: 'Rendered Style Disputer' });
  insertWorkQueueItem(db, {
    id: REACH_ROWS.disputeItemId, entity_id: REACH_ROWS.disputeRequesterId, created_by: REACH_ROWS.disputeRequesterId,
    reason_text: JSON.stringify({
      statement: 'That old account was mine before it was claimed by someone else.',
      is_dispute: true,
      disputed_legacy_member_ids: [REACH_ROWS.disputedLegacyId],
      disputed_historical_person_ids: [],
      disputed_record_holders: { [REACH_ROWS.disputedLegacyId]: REACH_ROWS.disputeHolderId },
    }),
  });
  // A plain request to link an old account nobody holds.
  insertLegacyMember(db, { legacy_member_id: REACH_ROWS.linkHelpLegacyId, real_name: 'Rendered Style Requester' });
  insertMember(db, { id: REACH_ROWS.linkHelpRequesterId, real_name: 'Rendered Style Requester' });
  insertWorkQueueItem(db, {
    id: REACH_ROWS.linkHelpItemId, entity_id: REACH_ROWS.linkHelpRequesterId, created_by: REACH_ROWS.linkHelpRequesterId,
    reason_text: JSON.stringify({ statement: 'Please link my old footbag.org account.' }),
  });

  const leaderTag = insertTag(db, { standard_type: 'club', tag_normalized: `#${REACH_ROWS.leaderClubKey}`, tag_display: `#${REACH_ROWS.leaderClubKey}` });
  insertClub(db, { id: REACH_ROWS.leaderClubId, hashtag_tag_id: leaderTag, name: 'Rendered Style Leaders Club' });
  insertMember(db, { id: REACH_ROWS.leaderMemberId, slug: REACH_ROWS.leaderSlug, real_name: 'Rendered Style Leader' });
  insertMemberClubAffiliation(db, REACH_ROWS.leaderMemberId, REACH_ROWS.leaderClubId, { is_current: 1, is_primary: 1 });
  insertClubLeader(db, { club_id: REACH_ROWS.leaderClubId, member_id: REACH_ROWS.leaderMemberId });

  // A record another member already holds, for the claim conflict page.
  insertHistoricalPerson(db, { person_id: REACH_ROWS.heldPersonId, person_name: 'Rendered Style Held Record' });
  insertMember(db, { real_name: 'Rendered Style Record Holder', historical_person_id: REACH_ROWS.heldPersonId });
  for (const slug of [REACH_ROWS.deletePhoneSlug, REACH_ROWS.deleteDesktopSlug]) insertMember(db, { slug, real_name: 'Rendered Style Departing' });
  db.close();
});

/**
 * The fonts the browser actually drew an element with, as Chromium reports
 * them: a face the site serves, or a system font it fell back to.
 */
async function platformFonts(page: Page, selector: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return [];
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  await cdp.detach();
  return fonts.map((f) => `${f.familyName}${f.isCustomFont ? '' : ' (system)'}`);
}

async function viewerContext(browser: Browser, baseURL: string, persona: string | null): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  if (persona) {
    const res = await context.request.get(`/dev/switch?as=${encodeURIComponent(persona)}`);
    if (!res.ok()) throw new Error(`persona switch to ${persona} failed: HTTP ${res.status()}`);
  }
  return context;
}

test('every page view meets the layout standard at phone and desktop width', async ({ browser, baseURL }) => {
  test.setTimeout(45 * 60_000);
  const contexts = new Map<string, BrowserContext>();
  for (const v of VIEWERS) contexts.set(v.name, await viewerContext(browser, baseURL!, v.persona));

  // The measurements are the same on every machine only because the site serves
  // its own fonts. A face that failed to load would leave the browser on a system
  // font, so widths, and with them the findings, would differ between machines.
  {
    const probe = await contexts.get('anonymous')!.newPage();
    await probe.goto('/legal', { waitUntil: 'load' });
    // Known text in both faces, styled by the site's own stylesheet, so the probe
    // does not depend on what content the seeded pages happen to hold.
    // Each weight the stylesheet uses is its own font file, and accented
    // letters must come from the same face, not a system fallback.
    const bodyProbes = {
      body: '<p data-font-probe="body">Footbag 0123</p>',
      medium: '<p class="fw-500" data-font-probe="medium">Footbag 0123</p>',
      semibold: '<p class="fw-600" data-font-probe="semibold">Footbag 0123</p>',
      bold: '<p><strong data-font-probe="bold">Footbag 0123</strong></p>',
      accented: '<p data-font-probe="accented">Café Ñandú Øresund Łódź</p>',
    };
    await probe.evaluate(async (html) => {
      const main = document.querySelector('main') as HTMLElement;
      main.insertAdjacentHTML('beforeend', `${html}<pre class="font-mono" data-font-probe="mono">Footbag 0123</pre>`);
      await new Promise((r) => requestAnimationFrame(r));
      await document.fonts.ready;
    }, Object.values(bodyProbes).join(''));
    for (const name of Object.keys(bodyProbes)) {
      const fonts = await platformFonts(probe, `[data-font-probe="${name}"]`);
      expect(fonts, `${name} text must render only in the Inter the site serves, found ${fonts.join(', ')}`)
        .toEqual([expect.stringMatching(/^Inter\b(?!.*\(system\))/)]);
    }
    const loadedWeights = await probe.evaluate(() => [...document.fonts]
      .filter((f) => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded').map((f) => f.weight));
    expect(loadedWeights, 'every Inter weight the stylesheet uses must load its own file').toEqual(expect.arrayContaining(['400', '500', '600', '700']));
    expect(await platformFonts(probe, '[data-font-probe="mono"]'), 'monospace must render in the JetBrains Mono the site serves').toEqual(['JetBrains Mono']);

    // A root token comes back as authored, so one written as a named colour
    // would match no computed colour and the grey-text and palette rules would
    // go silent; the capture reads every token as the browser paints it.
    await probe.evaluate(() => document.documentElement.style.setProperty('--rs-probe-token', 'rebeccapurple'));
    const probed = await probe.evaluate(fs.readFileSync(MEASURE_SCRIPT, 'utf8') +
      ';globalThis.__footbagMeasure({ tokens: ["--rs-probe-token"] }).then((c) => c.tokens["--rs-probe-token"])');
    expect(probed, 'a token written as a named colour must be read as the colour it paints').toBe('rgb(102, 51, 153)');
    await probe.close();
  }

  // Discover one page per view.
  const plan = new Map<string, Reach>();
  const walkNotes: string[] = [];
  for (const v of VIEWERS) {
    const context = contexts.get(v.name)!;
    const cookies = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    const walked = await walkViews(context.request, v.seeds, cookies || null);
    if (walked.capped) walkNotes.push(`${v.name} walk stopped at its page budget after ${walked.fetched} pages`);
    for (const [template, url] of walked.views) {
      if (!plan.has(template)) plan.set(template, { template, viewer: v.name, url, why: 'found by the walk' });
    }
  }
  for (const r of REACH) if (!plan.has(r.template)) plan.set(r.template, r);

  // A scoped run measures only the named views, so a per-change check sees a
  // template's own layout without rendering the whole site. Whole-site claims
  // (every view reached, the baseline rewritten or lowered) are left to the
  // full run, because a partial run cannot speak for the views it skipped.
  const scope = (process.env.RENDERED_STYLE_VIEWS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const inScope = (t: string) => scope.length === 0 || scope.includes(t);
  if (scope.length > 0 && process.env.RENDERED_STYLE_WRITE_BASELINE === '1') {
    throw new Error('RENDERED_STYLE_WRITE_BASELINE needs the whole-site run; unset RENDERED_STYLE_VIEWS');
  }

  const onDisk = listPageTemplates();
  const unmeasured = scope.length > 0
    ? scope.filter((t) => !plan.has(t) && !STRESS.some((s) => s.template === t))
    : onDisk.filter((t) => !plan.has(t) && !(t in EXEMPT));
  const reachedButExempt = scope.length > 0 ? [] : Object.keys(EXEMPT).filter((t) => plan.has(t));
  const targets = [...[...plan.values()].filter((r) => !(r.template in EXEMPT)), ...STRESS].filter((r) => inScope(r.template));

  // Measure each page at both widths.
  const findings: Finding[] = [];
  const visited = new Set<string>();
  const origin = new URL(baseURL!).origin;
  async function openWatched(context: BrowserContext) {
    const page = await context.newPage();
    // The seeded rows name media files the throwaway stack's store does not
    // hold, and the check navigates on before videos and event streams finish.
    const problems = await watchPageProblems(page, origin, {
      ignoreDocumentStatus: true,
      ignoreAborted: true,
      ignoreUrl: (u) => new URL(u).pathname.startsWith('/media-store/'),
    });
    return { page, problems };
  }
  for (const target of targets) {
    // A target signed in per width gets its own session at each width;
    // every other target shares its viewer's session across both.
    const shared = target.signInPerWidth ? null : await openWatched(contexts.get(target.viewer)!);
    const problemLines: string[] = [];
    for (const [i, viewport] of [PHONE, DESKTOP].entries()) {
      const slug = target.signInPerWidth?.[i] ?? null;
      const own = slug ? await viewerContext(browser, baseURL!, slug) : null;
      const { page, problems } = shared ?? await openWatched(own!);
      const url = forMember(target.url, slug);
      const base = { template: target.template, url, viewport: viewport.width };
      try {
        await page.setViewportSize(viewport);
        let res = await page.goto(url, { waitUntil: 'load' });
        if (target.submit) {
          // A form that moved or changed shape is reported like a wrong
          // view, which the baseline can never accept.
          try {
            res = await submitForm(page, { ...target.submit, action: forMember(target.submit.action, slug) });
          } catch (err) {
            findings.push({ ...base, rule: 'wrong-view', selector: 'form', measured: `submit failed: ${(err as Error).message}` });
            continue;
          }
        }
        const rendered = res?.headers()[VIEW_HEADER] ?? null;
        if (rendered !== target.template) {
          findings.push({ ...base, rule: 'wrong-view', selector: 'document', measured: `rendered ${rendered ?? 'no view'} (HTTP ${res?.status() ?? 'none'}), not ${target.template}` });
          continue;
        }
        visited.add(measuredKey(target.template, viewport.width));
        visited.add(measuredKey(target.template, 0));
        const cap = await capture(page, target.template);
        if (viewport === DESKTOP) {
          for (const v of await scanWcagAa(page, { disableRules: ['color-contrast'] })) {
            findings.push({ ...base, rule: `axe-${v.id}`, selector: v.sampleTargets[0] ?? 'document', measured: `${v.nodes} node(s): ${v.help}` });
          }
          // Focus looks the same at every width, and walking it scrolls the
          // page and can open what a script shows on focus, so it runs last.
          cap.focus = await walkFocus(page);
        }
        findings.push(...evaluate(cap, ctx));
      } finally {
        if (own) {
          problemLines.push(...problems.list);
          await own.close();
        }
      }
    }
    if (shared) {
      problemLines.push(...shared.problems.list);
      await shared.page.close();
    }
    for (const p of new Set(problemLines.map((m) => normalisePageProblem(m, origin)))) {
      findings.push({ template: target.template, url: target.url, viewport: 0, rule: 'page-problem', selector: 'document', measured: p });
    }
  }
  for (const c of contexts.values()) await c.close();

  // Every finding in full, baseline-listed ones included, for whoever works the
  // baseline down; the CI job keeps it with the run's other results.
  fs.writeFileSync(test.info().outputPath('rendered-style-findings.txt'), `${findings.map(formatFinding).sort().join('\n')}\n`);

  const header = '# Known rendered-style findings: rule, view, viewport, count, elements. The check lowers these itself as findings are fixed.\n';
  if (process.env.RENDERED_STYLE_WRITE_BASELINE === '1') {
    // The deliberate escape hatch: accept every current finding, new ones included.
    fs.writeFileSync(BASELINE, header + formatBaseline(findings));
  }
  const baseline = parseBaseline(fs.readFileSync(BASELINE, 'utf8'));
  const verdict = compareToBaseline(findings, baseline, visited);

  // A fixed finding needs no one to remember anything. Run on its own on a
  // workstation, the check lowers the baseline itself and the smaller file rides
  // along in the next commit. In CI, which cannot commit, and inside the full
  // runner, which voids a run whose tree changes mid-flight, a lower count
  // simply passes and is reported.
  const { entries, changes } = shrinkBaseline(baseline, findings, visited, new Set(onDisk));
  const mayWrite = !process.env.CI && process.env.RENDERED_STYLE_READ_ONLY !== '1' && scope.length === 0;
  if (changes.length > 0) {
    if (mayWrite) fs.writeFileSync(BASELINE, header + formatBaselineEntries(entries));
    test.info().annotations.push({
      type: 'baseline',
      description: `${mayWrite ? 'lowered' : 'could be lowered (npm run test:rendered-style records it)'}: ${changes.length} line(s)\n${changes.join('\n')}`,
    });
  }

  const accept = 'fix it; to accept it as known instead, run RENDERED_STYLE_WRITE_BASELINE=1 npm run test:rendered-style';
  const report = [
    ...unmeasured.map((t) => scope.length > 0
      ? `unmeasured view ${t}: named in RENDERED_STYLE_VIEWS but no walk, REACH or STRESS entry measures it`
      : `unmeasured view ${t}: no walk reached it; add it to REACH with a URL or to EXEMPT with a reason`),
    ...reachedButExempt.map((t) => `exempt view ${t} is reached by the walk; remove its exemption`),
    ...verdict.unexpected.map((f) => `new finding (${accept}): ${formatFinding(f)}`),
    ...verdict.exceeded.map((e) => `more than listed (${accept}): ${e.entry.rule} ${e.entry.template} @${e.entry.viewport} found ${e.count}, listed ${e.entry.max}`),
    ...verdict.swapped.map((e) => `other elements than listed (${accept}): ${e.entry.rule} ${e.entry.template} @${e.entry.viewport} found ${e.count} on elements the baseline does not name`),
    ...walkNotes,
  ];
  expect(report.join('\n'), `rendered-style check over ${targets.length} pages:\n${report.join('\n')}`).toBe('');
});
