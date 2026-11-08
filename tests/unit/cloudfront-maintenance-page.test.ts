/**
 * The static page CloudFront falls back to when the origin fails, and the wiring
 * that makes it reachable.
 *
 * This page is the platform's only automatic public signal during an outage, and
 * every one of its failure modes is silent. CloudFront's rule when a custom error
 * page is missing is to hand the viewer whatever status it got from the bucket
 * holding that page, and an access-controlled bucket with no list permission
 * answers 403 for a key that is not there. So a page that is not placed does not
 * degrade to a plain CloudFront error: it converts every origin 5xx into a 403
 * carrying the storage service's XML, and nothing reveals that until the first
 * real outage. Terraform placing the object is what closes that, and the first
 * assertions here are what keep it placed.
 *
 * The wording is the other silent failure. This page and the one-time cutover
 * migration notice were once the same artifact serving both jobs, and the notice
 * has since moved into the viewer-request edge function. A page still carrying
 * migration wording would, at the first outage after launch, tell members the
 * site is migrating and to come back in a few days. The vocabulary assertions
 * exist so the two cannot drift back together.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hclBlocks, onProvider } from '../fixtures/hclBlocks';

const PAGE_PATH = resolve(
  __dirname,
  '../../terraform/production/maintenance-page/maintenance.html',
);
const S3_TF = resolve(__dirname, '../../terraform/production/s3.tf');
const STAGING_S3_TF = resolve(__dirname, '../../terraform/staging/s3.tf');
const CLOUDFRONT_TF = resolve(__dirname, '../../terraform/production/cloudfront.tf');

const page = readFileSync(PAGE_PATH, 'utf8');
const s3Tf = readFileSync(S3_TF, 'utf8');
const stagingS3Tf = readFileSync(STAGING_S3_TF, 'utf8');
const cloudfrontTf = readFileSync(CLOUDFRONT_TF, 'utf8');

describe('maintenance page: the artifact', () => {
  it('is a complete HTML document with a body a reader can act on', () => {
    expect(page).toMatch(/^<!DOCTYPE html>/);
    expect(page).toContain('</html>');
    expect(page).toMatch(/<h1>[^<]+<\/h1>/);
    expect(page).toMatch(/<p>[\s\S]*?<\/p>/);
  });

  it('is self-contained, so an outage cannot cost it its styling', () => {
    // It is served while the origin is down. A stylesheet, script, image or font
    // fetched from anywhere else is a second thing that has to be working at the
    // worst possible moment, and the page has to survive without it.
    expect(page).not.toMatch(/<link\b/i);
    expect(page).not.toMatch(/<script\b/i);
    expect(page).not.toMatch(/<img\b/i);
    expect(page).not.toMatch(/https?:\/\//i);
  });

  it('sends no noindex directive, in a meta tag or anywhere else', () => {
    // The page is served as 503 and a 503 body is not indexed, so the directive
    // buys nothing. A crawler that does act on it removes the site's URLs from
    // search results, and unlike the one-time cutover notice this page can be
    // served at any moment for the life of the site.
    expect(page.toLowerCase()).not.toContain('noindex');
  });
});

describe('maintenance page: it is the outage page, not the migration notice', () => {
  it.each(['migrating', 'migration', 'go live', 'goes live', 'check back in a few days'])(
    'carries none of the cutover vocabulary: %s',
    (phrase) => {
      expect(page.toLowerCase()).not.toContain(phrase);
    },
  );

  it('says it is temporary and tells the reader what to do', () => {
    const text = page.toLowerCase();
    expect(text).toContain('temporarily unavailable');
    expect(text).toContain('try again');
  });
});

describe('maintenance page: Terraform places the object', () => {
  it('declares the page as a managed object, so it cannot be absent', () => {
    expect(s3Tf).toMatch(/resource\s+"aws_s3_object"\s+"maintenance_page_html"/);
  });

  it('places it at the key the error responses ask for, in the maintenance bucket', () => {
    const block = s3Tf.slice(s3Tf.indexOf('resource "aws_s3_object" "maintenance_page_html"'));
    expect(block).toMatch(/bucket\s*=\s*aws_s3_bucket\.maintenance_page\.id/);
    expect(block).toMatch(/key\s*=\s*"maintenance\.html"/);
  });

  it('takes its content from the committed page rather than an inline copy that could drift', () => {
    const block = s3Tf.slice(s3Tf.indexOf('resource "aws_s3_object" "maintenance_page_html"'));
    expect(block).toMatch(/content\s*=\s*file\("\$\{path\.module\}\/maintenance-page\/maintenance\.html"\)/);
  });

  it('serves it as HTML, since a wrong content type renders the markup as text', () => {
    const block = s3Tf.slice(s3Tf.indexOf('resource "aws_s3_object" "maintenance_page_html"'));
    expect(block).toMatch(/content_type\s*=\s*"text\/html; charset=utf-8"/);
  });
});

describe('maintenance page: held outside the primary region', () => {
  // The page stands in for an origin that has failed, and a regional outage is
  // the failure it most has to survive. A bucket back in the primary region
  // fails along with the origin, and CloudFront then has no page to serve.
  const trees = [
    { tree: 'production', source: s3Tf },
    { tree: 'staging', source: stagingS3Tf },
  ];

  it.each(trees)('$tree: every maintenance S3 resource is on the us-west-2 provider', ({ source }) => {
    const maintenance = hclBlocks(source, 'resource').filter(
      (b) => b.type.startsWith('aws_s3_') && b.name.startsWith('maintenance'),
    );
    // Positive control: an empty list would pass the loop below by construction.
    expect(maintenance.map((b) => b.type)).toContain('aws_s3_bucket');
    for (const b of maintenance) {
      expect(onProvider(b, 'aws.us_west_2'), `${b.type}.${b.name} is not in us-west-2`).toBe(true);
    }
  });

  it('production: CloudFront reads the page from that us-west-2 bucket', () => {
    const bucket = hclBlocks(s3Tf, 'resource').find(
      (b) => b.type === 'aws_s3_bucket' && b.name.startsWith('maintenance')
        && onProvider(b, 'aws.us_west_2'),
    );
    expect(bucket, 'no maintenance bucket in us-west-2').toBeDefined();
    const origin = cloudfrontTf.match(
      /origin\s*\{[^}]*origin_id\s*=\s*"s3-maintenance"[^}]*\}/,
    );
    expect(origin, 'no s3-maintenance origin').not.toBeNull();
    expect(origin![0]).toContain(`aws_s3_bucket.${bucket!.name}.bucket_regional_domain_name`);
    // Signed with the access control the bucket policy's grant is written for;
    // another one is a 403 from the bucket at the moment the page is needed.
    expect(origin![0]).toMatch(
      /origin_access_control_id\s*=\s*aws_cloudfront_origin_access_control\.maintenance\[0\]\.id/,
    );
  });

  it.each(trees)('$tree: the bucket keeps the private baseline every other bucket has', ({ source }) => {
    // Served only through CloudFront, so nothing about it is public and nothing
    // is readable over plaintext; the move to a new region must not shed either.
    const resources = hclBlocks(source, 'resource');
    const block = resources.find(
      (b) => b.type === 'aws_s3_bucket_public_access_block' && b.name.startsWith('maintenance'),
    );
    expect(block, 'no public-access block').toBeDefined();
    for (const flag of ['block_public_acls', 'block_public_policy', 'ignore_public_acls', 'restrict_public_buckets']) {
      expect(block!.body, `${flag} is not true`).toMatch(new RegExp(`^\\s*${flag}\\s*=\\s*true\\s*$`, 'm'));
    }
    const policy = resources.find(
      (b) => b.type === 'aws_s3_bucket_policy' && b.name.startsWith('maintenance'),
    )!;
    const docName = policy.body.match(/data\.aws_iam_policy_document\.([a-z_0-9]+)\.json/)![1];
    const doc = hclBlocks(source, 'data').find((b) => b.name === docName)!;
    const deny = doc.body.slice(doc.body.indexOf('DenyPlaintextAccess'));
    expect(deny).toMatch(/^\s*effect\s*=\s*"Deny"/m);
    expect(deny).toMatch(/variable\s*=\s*"aws:SecureTransport"\s*values\s*=\s*\["false"\]/);
  });

  it('production: the read grant names that same bucket, so the origin it reads is not a 403', () => {
    const bucket = hclBlocks(s3Tf, 'resource').find(
      (b) => b.type === 'aws_s3_bucket' && b.name.startsWith('maintenance'),
    )!;
    const policy = hclBlocks(s3Tf, 'resource').find(
      (b) => b.type === 'aws_s3_bucket_policy' && b.name.startsWith('maintenance'),
    )!;
    const docName = policy.body.match(/data\.aws_iam_policy_document\.([a-z_0-9]+)\.json/)![1];
    const doc = hclBlocks(s3Tf, 'data').find((b) => b.name === docName)!;
    const grant = doc.body.slice(doc.body.indexOf('AllowCloudFrontServicePrincipalRead'));
    expect(grant).toContain(`aws_s3_bucket.${bucket.name}.arn`);
    // Read only, by CloudFront only: the page is fetched, never written, through
    // this grant.
    expect(grant).toMatch(/effect\s*=\s*"Allow"/);
    expect(grant).toMatch(/actions\s*=\s*\["s3:GetObject"\]/);
    expect(grant).toMatch(/identifiers\s*=\s*\["cloudfront\.amazonaws\.com"\]/);
  });
});

describe('maintenance page: every origin failure routes to it', () => {
  // Leaving any of the four out means that failure mode alone shows an unbranded
  // page naming the CDN, which reads as the whole site being broken rather than
  // briefly unavailable. 500 is an unhandled server error, 502 and 503 are the
  // origin unreachable or refusing, 504 is the origin no longer answering in time.
  it.each([500, 502, 503, 504])('maps origin %i to the page', (code) => {
    const pattern = new RegExp(
      `custom_error_response\\s*\\{[^}]*error_code\\s*=\\s*${code}[^}]*` +
        `response_code\\s*=\\s*503[^}]*response_page_path\\s*=\\s*"/maintenance\\.html"`,
    );
    expect(cloudfrontTf).toMatch(pattern);
  });

  it('adds 403 and 404 while a planned window is on, and only then', () => {
    // During a deliberate window the default behaviour points at the bucket, which
    // answers 403 for every key that is not the page. Without these a visitor
    // asking for any other path meets a bare storage-service error. Off, the app's
    // own 403s and 404s must reach viewers untouched, so these are gated.
    expect(cloudfrontTf).toMatch(
      /dynamic\s+"custom_error_response"\s*\{[\s\S]*?for_each\s*=\s*var\.enable_planned_maintenance\s*\?\s*\[403,\s*404\]\s*:\s*\[\]/,
    );
  });
});
