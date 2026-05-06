/**
 * Unit tests for the initial-admin bootstrap helper.
 *
 * The helper reads a gitignored email-list file at registration time and
 * returns the set of emails that should be auto-promoted to is_admin=1.
 * Production refusal is a hard gate (defense-in-depth even if the file is
 * inadvertently shipped to a prod host).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { getInitialAdminEmails } from '../../src/services/initialAdminBootstrap';

let tmpDir: string;
let listPath: string;

// Isolate from any FOOTBAG_INITIAL_ADMIN_EMAILS that may leak in from the
// developer's shell or CI runner — file-source tests below assume the env
// var is unset.
const ORIGINAL_ENV_EMAILS = process.env.FOOTBAG_INITIAL_ADMIN_EMAILS;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'initial-admin-test-'));
  listPath = path.join(tmpDir, 'admins.txt');
  delete process.env.FOOTBAG_INITIAL_ADMIN_EMAILS;
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  if (ORIGINAL_ENV_EMAILS !== undefined) {
    process.env.FOOTBAG_INITIAL_ADMIN_EMAILS = ORIGINAL_ENV_EMAILS;
  }
});

describe('getInitialAdminEmails', () => {
  it('returns empty set when file does not exist', () => {
    const emails = getInitialAdminEmails({ nodeEnv: 'development', filePath: listPath });
    expect(emails.size).toBe(0);
  });

  it('returns emails from a well-formed file', () => {
    fs.writeFileSync(listPath, 'alice@example.com\nbob@example.com\n', 'utf8');
    const emails = getInitialAdminEmails({ nodeEnv: 'development', filePath: listPath });
    expect(emails.has('alice@example.com')).toBe(true);
    expect(emails.has('bob@example.com')).toBe(true);
    expect(emails.size).toBe(2);
  });

  it('strips comments and blank lines', () => {
    fs.writeFileSync(
      listPath,
      '# header comment\n\nalice@example.com\nbob@example.com  # owner\n\n',
      'utf8',
    );
    const emails = getInitialAdminEmails({ nodeEnv: 'development', filePath: listPath });
    expect(emails.size).toBe(2);
    expect(emails.has('alice@example.com')).toBe(true);
    expect(emails.has('bob@example.com')).toBe(true);
  });

  it('lowercases emails to match login_email_normalized', () => {
    fs.writeFileSync(listPath, 'Alice@Example.COM\n', 'utf8');
    const emails = getInitialAdminEmails({ nodeEnv: 'development', filePath: listPath });
    expect(emails.has('alice@example.com')).toBe(true);
    expect(emails.has('Alice@Example.COM')).toBe(false);
  });

  it('returns empty set when NODE_ENV=production even if file present and valid', () => {
    fs.writeFileSync(listPath, 'alice@example.com\n', 'utf8');
    const emails = getInitialAdminEmails({ nodeEnv: 'production', filePath: listPath });
    expect(emails.size).toBe(0);
  });

  it('returns empty set on read error (e.g. directory passed instead of file)', () => {
    const emails = getInitialAdminEmails({ nodeEnv: 'development', filePath: tmpDir });
    expect(emails.size).toBe(0);
  });
});

describe('getInitialAdminEmails — env var source', () => {
  it('returns env var emails when FOOTBAG_INITIAL_ADMIN_EMAILS is non-blank', () => {
    const emails = getInitialAdminEmails({
      nodeEnv: 'development',
      filePath: listPath,
      envEmails: 'alice@example.com,bob@example.com',
    });
    expect(emails.size).toBe(2);
    expect(emails.has('alice@example.com')).toBe(true);
    expect(emails.has('bob@example.com')).toBe(true);
  });

  it('env var takes precedence over file', () => {
    fs.writeFileSync(listPath, 'fileonly@example.com\n', 'utf8');
    const emails = getInitialAdminEmails({
      nodeEnv: 'development',
      filePath: listPath,
      envEmails: 'envonly@example.com',
    });
    expect(emails.has('envonly@example.com')).toBe(true);
    expect(emails.has('fileonly@example.com')).toBe(false);
    expect(emails.size).toBe(1);
  });

  it('env var bypasses NODE_ENV=production gate', () => {
    fs.writeFileSync(listPath, 'fileonly@example.com\n', 'utf8');
    const emails = getInitialAdminEmails({
      nodeEnv: 'production',
      filePath: listPath,
      envEmails: 'alice@example.com',
    });
    expect(emails.has('alice@example.com')).toBe(true);
    expect(emails.size).toBe(1);
  });

  it('empty env var string falls through to file path', () => {
    fs.writeFileSync(listPath, 'fileonly@example.com\n', 'utf8');
    const emails = getInitialAdminEmails({
      nodeEnv: 'development',
      filePath: listPath,
      envEmails: '',
    });
    expect(emails.has('fileonly@example.com')).toBe(true);
    expect(emails.size).toBe(1);
  });

  it('whitespace-only env var falls through to file path', () => {
    fs.writeFileSync(listPath, 'fileonly@example.com\n', 'utf8');
    const emails = getInitialAdminEmails({
      nodeEnv: 'development',
      filePath: listPath,
      envEmails: '   ',
    });
    expect(emails.has('fileonly@example.com')).toBe(true);
  });

  it('normalizes whitespace, case, and trailing/empty fields in env var value', () => {
    const emails = getInitialAdminEmails({
      nodeEnv: 'production',
      filePath: listPath,
      envEmails: ' Alice@Example.COM , bob@example.com ,, ',
    });
    expect(emails.size).toBe(2);
    expect(emails.has('alice@example.com')).toBe(true);
    expect(emails.has('bob@example.com')).toBe(true);
  });

  it('reads from process.env.FOOTBAG_INITIAL_ADMIN_EMAILS when opts.envEmails undefined', () => {
    process.env.FOOTBAG_INITIAL_ADMIN_EMAILS = 'envvar@example.com';
    const emails = getInitialAdminEmails({
      nodeEnv: 'production',
      filePath: listPath,
    });
    expect(emails.has('envvar@example.com')).toBe(true);
    expect(emails.size).toBe(1);
  });
});
