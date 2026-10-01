/**
 * The host's answer to "which environment are you", for a test's stand-in ssh.
 *
 * Every operator script asks the host it reached which environment it records
 * before changing or reporting anything (require_host_is in
 * scripts/lib/host-env-remote.sh), and refuses a host whose answer is missing or
 * names the other environment. The same answer carries the address the host
 * records it serves. A stub ssh that does not model the answer stops every run
 * at the question, so each stub puts this line first.
 *
 * The question is recognisable on the command line alone, so the stub answers
 * it without reading the stream: the stream it drains carries only the password
 * and the one-line read, never anything the test inspects, and the stub exits
 * before any session it records, so session counts are unchanged.
 *
 * With no argument the stand-in host is the one its alias names and serves
 * `hostUrlForAlias(alias)`, which is the ordinary case. A test about the
 * refusal or the address passes what the host should report instead: an
 * environment (the other one, or an empty string for a host that records none)
 * and an address (an empty string for none).
 */
export function hostUrlForAlias(alias: string): string {
  return `https://${alias}.example.invalid`;
}

export function hostIdentityAnswer(recorded?: string, url = ''): string {
  const values =
    recorded === undefined
      ? [
        '  r=""; u=""',
        '  for a in "$@"; do',
        '    case "$a" in',
        `      footbag-staging) r=staging; u=${hostUrlForAlias('footbag-staging')} ;;`,
        `      footbag-production) r=production; u=${hostUrlForAlias('footbag-production')} ;;`,
        '    esac',
        '  done',
      ]
      : [`  r=${JSON.stringify(recorded)}; u=${JSON.stringify(url)}`];
  return [
    'case "$*" in *footbag-host-identity*)',
    '  cat >/dev/null',
    ...values,
    '  echo "---FOOTBAG-HOST-ENV---"',
    '  printf "%s\\n" "$r"',
    '  echo "---FOOTBAG-HOST-URL---"',
    '  printf "%s\\n" "$u"',
    '  echo "---FOOTBAG-END---"',
    '  exit 0 ;;',
    'esac',
  ].join('\n');
}
