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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'initial-admin-test-'));
  listPath = path.join(tmpDir, 'admins.txt');
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
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
