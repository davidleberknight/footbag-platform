/**
 * The line the OpenSSH client prints when a connection offering only password
 * and keyboard-interactive login is refused, captured from a real run of
 * `harden-sshd.sh --target staging --apply` against the staging host on
 * 2026-10-18. The host address is replaced by a documentation address; nothing
 * else is changed.
 *
 * harden-sshd.sh reads the offered methods out of this line, wording OpenSSH
 * never promised to keep, so its refusal cases parse this sample rather than one
 * written from memory. The real daemon offers GSSAPI methods beside publickey,
 * which a hand-written "(publickey)" never exercised. Recapture it from the same
 * run, which prints the line whole, when the hosts' OpenSSH changes.
 */
export const REAL_PASSWORD_REFUSAL =
  'footbag@203.0.113.40: Permission denied (publickey,gssapi-keyex,gssapi-with-mic).';

/** The captured line with its offered-method list replaced, for the cases where
 *  the daemon still offers a method it should not. */
export function refusalOffering(methods: string): string {
  return REAL_PASSWORD_REFUSAL.replace(/\([^)]*\)/, `(${methods})`);
}
