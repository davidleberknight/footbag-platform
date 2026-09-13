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

const PAGE_PATH = resolve(
  __dirname,
  '../../terraform/production/maintenance-page/maintenance.html',
);
const S3_TF = resolve(__dirname, '../../terraform/production/s3.tf');
const CLOUDFRONT_TF = resolve(__dirname, '../../terraform/production/cloudfront.tf');

const page = readFileSync(PAGE_PATH, 'utf8');
const s3Tf = readFileSync(S3_TF, 'utf8');
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
    expect(s3Tf).toMatch(/resource\s+"aws_s3_object"\s+"maintenance_page"/);
  });

  it('places it at the key the error responses ask for, in the maintenance bucket', () => {
    const block = s3Tf.slice(s3Tf.indexOf('resource "aws_s3_object" "maintenance_page"'));
    expect(block).toMatch(/bucket\s*=\s*aws_s3_bucket\.maintenance\.id/);
    expect(block).toMatch(/key\s*=\s*"maintenance\.html"/);
  });

  it('takes its content from the committed page rather than an inline copy that could drift', () => {
    const block = s3Tf.slice(s3Tf.indexOf('resource "aws_s3_object" "maintenance_page"'));
    expect(block).toMatch(/content\s*=\s*file\("\$\{path\.module\}\/maintenance-page\/maintenance\.html"\)/);
  });

  it('serves it as HTML, since a wrong content type renders the markup as text', () => {
    const block = s3Tf.slice(s3Tf.indexOf('resource "aws_s3_object" "maintenance_page"'));
    expect(block).toMatch(/content_type\s*=\s*"text\/html; charset=utf-8"/);
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
