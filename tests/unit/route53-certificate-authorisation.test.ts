/**
 * Who may issue a certificate for a name under the domain, and when that becomes
 * true.
 *
 * A certificate-authorisation record constrains WHICH authority may issue for a
 * name under the domain. It does not constrain WHO may prove control to that
 * authority: the permitted authority also accepts proof by mail to five fixed
 * system addresses at the domain, and strips a leading www so a request for the
 * canonical host is proved at the apex set. So the record is one half of a pair,
 * and the other half is IFPA receiving those five addresses. This suite covers
 * the half that lives in the zone; the address half is a mail-provisioning
 * contract and is not assertable here.
 *
 * Why the half in the zone matters. Roughly forty legacy names are mirrored into
 * the zone and resolve to hosts IFPA does not control, and they stand until the
 * post-cutover cleanup. This record stops any authority but the permitted one
 * issuing for them; certificate transparency shows one of those names held a
 * certificate from another authority in 2015 and 2016. A host answering over
 * HTTPS under the domain receives the archive's access cookies, which carry the
 * parent-domain scope by necessity.
 *
 * Two properties therefore matter here, and neither is visible in a plan:
 *
 * WHEN. The apex record is ungated, so it publishes with the zone rather than at
 * a cutover flag, and is in force from the moment the registrar delegates. A
 * certificate obtained before it lands stays valid for its full life, up to 200
 * days under the current maximum, so the window it closes is an opportunity
 * window: publishing late does not shorten an exposure already allowed.
 *
 * WHAT. Absent an issuewild set, the authorisation standard has the issue set
 * govern wildcard requests too. So a record carrying only an issue line
 * authorises wildcards, and the refusal has to be written rather than omitted.
 * That is how a record which looks narrower than it is survives review.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE53 = readFileSync(
  resolve(__dirname, '../..', 'terraform/production/route53.tf'),
  'utf-8',
);

/** One resource block, from its header to the line that closes it. */
function resourceBlock(label: string): string {
  const start = ROUTE53.indexOf(`resource "aws_route53_record" "${label}" {`);
  expect(start, `no aws_route53_record named ${label}`).toBeGreaterThan(-1);
  const end = ROUTE53.indexOf('\n}\n', start);
  expect(end).toBeGreaterThan(start);
  return ROUTE53.slice(start, end);
}

describe('the apex certificate-authorisation record', () => {
  it('publishes with the zone rather than waiting for a cutover flag', () => {
    // Ungated, like the apex nameserver set and for the same reason: the zone is
    // inert until the registrar delegates to it, so nothing a resolver sees
    // changes before the move and everything is in force from it.
    const block = resourceBlock('caa');
    expect(block).not.toMatch(/count\s*=/);
    expect(block).not.toMatch(/apex_alias_mode/);
    expect(block).not.toMatch(/enable_platform_custom_domain/);
  });

  it('permits the authority ACM issues from', () => {
    // AWS documents four accepted values and requires the record to contain one
    // of them. Getting this wrong fails issuance rather than failing the apply.
    expect(resourceBlock('caa')).toContain('0 issue \\"amazon.com\\"');
  });

  it('refuses wildcard issuance outright rather than leaving it implied', () => {
    // `issuewild ";"` authorises nobody. Written as the same authority as the
    // issue line it was inert, granting what was already granted, and omitted
    // entirely it would have granted wildcards to that authority by default.
    const block = resourceBlock('caa');
    expect(block).toContain('0 issuewild \\";\\"');
    expect(block).not.toContain('0 issuewild \\"amazon.com\\"');
  });
});

describe('the origin certificate-authorisation record', () => {
  it('rides the same flag as the name it protects', () => {
    // Created together so no ordering can separate a name from the authority
    // permitted to issue for it. This is also what dissolves the reason the apex
    // record used to be deferred: the child set replaces its ancestor's rather
    // than adding to it, so an Amazon-only policy at the apex cannot block the
    // origin name's own issuance.
    const block = resourceBlock('origin_caa');
    expect(block).toMatch(/count\s*=\s*var\.enable_origin_record/);
    expect(resourceBlock('origin_a')).toMatch(/count\s*=\s*var\.enable_origin_record/);
  });

  it('names its own authority and refuses wildcards explicitly', () => {
    const block = resourceBlock('origin_caa');
    expect(block).toContain('0 issue \\"letsencrypt.org\\"');
    expect(block).toContain('0 issuewild \\";\\"');
  });
});
