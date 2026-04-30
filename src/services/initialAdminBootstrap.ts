import fs from 'node:fs';
import { config } from '../config/env';

/**
 * Read the operator-supplied initial-admin email list and return a Set of
 * normalized emails. Used by `registerMember` to auto-grant `is_admin=1`
 * on registration when the new member's email is listed.
 *
 * The file is plain text, one email per line. `#` introduces a line comment.
 * Blank lines and comment-only lines are ignored. Emails are trimmed and
 * lowercased to match `login_email_normalized`.
 *
 * Returns an empty Set in any of these cases:
 *  - `NODE_ENV === 'production'` (defense-in-depth; production must use the
 *    canonical bootstrap mechanism, not this dev-grade file)
 *  - the file does not exist or is unreadable
 *  - the file is empty or contains only blanks/comments
 *
 * Read on every call: the operator may edit the file between registrations
 * and expect the next registration to pick up the change. Registrations are
 * rare enough that disk I/O cost is negligible.
 */
export interface InitialAdminBootstrapOptions {
  nodeEnv?: string;
  filePath?: string;
}

export function getInitialAdminEmails(
  opts: InitialAdminBootstrapOptions = {},
): Set<string> {
  const nodeEnv = opts.nodeEnv ?? config.nodeEnv;
  const filePath = opts.filePath ?? config.initialAdminFile;

  if (nodeEnv === 'production') {
    return new Set();
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return new Set();
  }

  const emails = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const stripped = line.split('#', 1)[0]?.trim();
    if (!stripped) continue;
    emails.add(stripped.toLowerCase());
  }
  return emails;
}
