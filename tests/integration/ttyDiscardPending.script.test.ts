/**
 * The terminal drain: a line typed before a question is shown never answers it.
 *
 * A confirmation read from the terminal takes whatever line the terminal holds,
 * and that includes a line typed while the run was still busy or pasted along
 * with the command. An operator's stray "no" then declines a question in no
 * time, and a waiting "APPLY" accepts one nobody read. `tty_discard_pending`
 * throws that input away immediately before a prompt is printed.
 *
 * The cases run the helper under a real pseudo-terminal, because what they
 * test is how a terminal holds input, and no file or pipe stands in for that.
 * The pending bytes are written into the terminal before the child process
 * exists, so they are queued by construction rather than by a delay, and the
 * answer that belongs to the prompt is written only once the prompt's read is
 * waiting on the terminal.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { requireToolInCI } from '../fixtures/toolAvailability';
import { HAS_PTY_DRIVER, spawnAtTerminal } from '../fixtures/ptySession';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TERMINAL_LIB = path.join(REPO_ROOT, 'scripts', 'lib', 'terminal.sh');
/** `setsid` gives a run no controlling terminal, the condition of a scheduled job. */
const HAS_SETSID = requireToolInCI('setsid', '--version');

/** The calling convention of a real prompt: errexit on, drain, prompt, read. */
const BODY = [
  'set -euo pipefail',
  `source ${JSON.stringify(TERMINAL_LIB)}`,
  'before="$(stty -g </dev/tty)"',
  'tty_discard_pending',
  'after="$(stty -g </dev/tty)"',
  "printf 'PROMPT> ' >/dev/tty",
  'answer=""',
  'IFS= read -r answer </dev/tty || answer=""',
  'modes=changed; [[ "$before" == "$after" ]] && modes=same',
  'printf "ANSWER=[%s] MODES=%s\\n" "$answer" "$modes"',
].join('\n');

function atTerminal(pending: string, typed: string): { status: number | null; answer: string; modes: string; out: string } {
  const res = spawnAtTerminal(BODY, { typeAhead: pending, typed });
  const out = res.stdout;
  const m = out.match(/ANSWER=\[([^\]\r\n]*)\] MODES=(\w+)/);
  return { status: res.status, answer: m ? m[1] : '<no answer line>', modes: m ? m[2] : '', out: out + res.stderr };
}

describe.skipIf(!HAS_PTY_DRIVER)('tty_discard_pending: only what is typed after the prompt answers it', () => {
  it('discards a whole line typed before the prompt, and the line typed after it is the answer', () => {
    // Defect caught: an APPLY typed ahead, before the operator has read what
    // is being confirmed, accepts a production confirmation.
    const r = atTerminal('APPLY\n', 'later\n');
    expect(r.status, r.out).toBe(0);
    expect(r.answer, r.out).toBe('later');
  });

  it('discards a half-typed word, so a later Enter alone does not complete it into the answer', () => {
    // Defect caught: the terminal holds an unfinished line where an
    // availability check cannot see it; "APPLY" typed without Enter survives
    // the drain and a bare Enter at the prompt then confirms with it.
    const r = atTerminal('APPLY', '\n');
    expect(r.status, r.out).toBe(0);
    expect(r.answer, r.out).toBe('');
  });

  it('discards every queued line, however much more than one read takes', () => {
    // Defect caught: a drain that reads once leaves the rest of a large paste
    // queued, and its last line answers the prompt. One read takes at most
    // 4096 bytes, so the queue here is built past that; each line stays under
    // the 4095-byte limit a Linux terminal puts on one line.
    const r = atTerminal(`${'x'.repeat(3000)}\n${'y'.repeat(3000)}\nAPPLY\n`, 'later\n');
    expect(r.status, r.out).toBe(0);
    expect(r.answer, r.out).toBe('later');
  });

  it('with nothing pending keeps the real answer and leaves the terminal modes as it found them', () => {
    // Defect caught: the drain swallowing the answer the operator types at the
    // prompt, so no confirmation can ever succeed, or leaving the terminal out
    // of line mode, so the answer is not echoed or edited normally.
    const r = atTerminal('', 'APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(r.answer, r.out).toBe('APPLY');
    expect(r.modes, r.out).toBe('same');
  });

  it('leaves the terminal modes unchanged after draining pending input as well', () => {
    // Defect caught: the mode switch that lets the drain see a half-typed
    // line staying in force after it, so the operator's answer is read a
    // character at a time instead of as a line.
    const r = atTerminal('APP', 'APPLY\n');
    expect(r.answer, r.out).toBe('APPLY');
    expect(r.modes, r.out).toBe('same');
  });
});

describe.skipIf(!HAS_SETSID)('tty_discard_pending without a terminal', () => {
  it('returns success under errexit, so the caller reaches its own refusal', () => {
    // Defect caught: a prompting script run with no terminal (a scheduled job,
    // an agent session) dying at the drain with no message, instead of
    // reaching the refusal that says why it will not ask.
    const res = spawnSync(
      'setsid',
      ['--wait', 'bash', '-c', `set -euo pipefail; source ${JSON.stringify(TERMINAL_LIB)}; tty_discard_pending; echo reached-refusal`],
      { encoding: 'utf8', input: 'APPLY\n', ...SPAWN_GUARD },
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('reached-refusal');
  });
});
