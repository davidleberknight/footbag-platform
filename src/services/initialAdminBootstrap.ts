import fs from 'node:fs';
import { config } from '../config/env';

/**
 * Read the operator-supplied initial-admin email list and return a Set of
 * normalized emails. Used by `registerMember` to auto-grant `is_admin=1`
 * on registration when the new member's email is listed.
 *
 * Two sources, in precedence order:
 *
 * 1. `FOOTBAG_INITIAL_ADMIN_EMAILS` env var (comma-separated). Populated by
 *    the deploy script on staging from `.local/initial-admins.txt` content.
 *    When present and non-blank, this is the source. Bypasses the NODE_ENV
 *    gate; setting the env var is the explicit operator opt-in.
 *
 * 2. The file at `config.initialAdminFile` (default `.local/initial-admins.txt`).
 *    Plain text, one email per line. `#` introduces a line comment. Used on
 *    local dev where the file is reachable from process CWD. Returns empty
 *    Set under `NODE_ENV === 'production'` for defense-in-depth, in case
 *    `.local/` ever lands on a real prod host.
 *
 * In both sources, emails are trimmed and lowercased to match
 * `login_email_normalized`. Read on every call: the operator may edit the
 * source between registrations and expect the next registration to pick up
 * the change.
 */
export interface InitialAdminBootstrapOptions {
  nodeEnv?: string;
  filePath?: string;
  envEmails?: string;
}

export function getInitialAdminEmails(
  opts: InitialAdminBootstrapOptions = {},
): Set<string> {
  const nodeEnv = opts.nodeEnv ?? config.nodeEnv;
  const filePath = opts.filePath ?? config.initialAdminFile;
  const envEmails = opts.envEmails ?? process.env.FOOTBAG_INITIAL_ADMIN_EMAILS;

  if (envEmails && envEmails.trim()) {
    const emails = new Set<string>();
    for (const item of envEmails.split(',')) {
      const stripped = item.trim().toLowerCase();
      if (stripped) emails.add(stripped);
    }
    return emails;
  }

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
