/**
 * Who may issue a certificate for a name under the domain, and when that becomes
 * true.
 *
 * A certificate-authorisation record is the only control that reaches a name the
 * project does not serve. Roughly forty legacy names are mirrored into the zone
 * and resolve to hosts IFPA does not control, and they stand until the
 * post-cutover cleanup; any of them can answer an HTTP challenge for its own
 * footbag.org name. Certificate transparency shows that has already happened
 * once, for rimu2.footbag.org in 2015 and 2016, under exactly this record shape.
 * With a valid certificate such a host answers over HTTPS under the domain, and
 * the archive's access cookies carry the parent-domain scope by necessity, so
 * they reach it.
 *
 * Two properties therefore matter here, and neither is visible in a plan:
 *
 * WHEN. The apex record is ungated, so it publishes with the zone. It used to
 * wait for the alias flip, the last step of the cutover, which left the whole
 * pre-launch window with no issuance restriction at all while those names were
 * already resolving. A certificate obtained in that window stays valid for its
 * full life -- up to 200 days under the current maximum -- so closing the window
 * late does not shorten the exposure it already allowed.
 *
 * WHAT. Absent an issuewild set, RFC 8659 says the issue set governs wildcard
 * requests too. So a record carrying only an issue line authorises wildcards,
 * and the refusal has to be written rather than omitted. The origin record's own
 * comment claimed the opposite for a while, which is how a record that looks
 * narrower than it is survives review.
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
