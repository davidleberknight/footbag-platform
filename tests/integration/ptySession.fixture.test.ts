/**
 * The prompt-waiting terminal: each answer is typed only once its question is asked.
 *
 * Every suite that drives a prompting script answers it through this fixture,
 * and every prompt in the tree throws away input already waiting before it
 * asks. A fixture that typed early would have its answers thrown away, and the
 * suites built on it would prove nothing about the prompts they drive.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

import { HAS_PTY_DRIVER, spawnAtTerminal } from '../fixtures/ptySession';

const TERMINAL_LIB = path.join(__dirname, '..', '..', 'scripts', 'lib', 'terminal.sh');

/** A question asked the way the scripts ask one: drain, prompt, read a line. */
const ask = (name: string) =>
  `tty_discard_pending; printf '${name}? ' >/dev/tty; IFS= read -r ${name} </dev/tty || ${name}='<eof>'`;

const lib = `source ${JSON.stringify(TERMINAL_LIB)}`;

describe.skipIf(!HAS_PTY_DRIVER)('spawnAtTerminal', () => {
  it('types each answer only after its question is asked, so a drain before each question keeps it', () => {
    // Defect caught: the fixture queuing every answer up front, where the
    // drain before the second question throws the second answer away and the
    // suites migrated onto it see questions answered by nothing.
    const r = spawnAtTerminal(
      [lib, ask('first'), ask('second'), ask('third'), 'echo "GOT=[$first|$second|$third]"'].join('\n'),
      { typed: 'one\ntwo\nthree\n' },
    );
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('GOT=[one|two|three]');
  });

  it('answers a line read on stdin as well as one read from the terminal device', () => {
    // Defect caught: only reads that opened the terminal by its device name
    // being recognised as questions, so a secret read on the script's own
    // stdin (which is the terminal) waits until the driver gives up.
    const r = spawnAtTerminal(
      [lib, 'IFS= read -r -s secret || secret="<eof>"', ask('confirm'), 'echo "GOT=[$secret|$confirm]"'].join('\n'),
      { typed: 'hunter2\nAPPLY\n' },
    );
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('GOT=[hunter2|APPLY]');
  });

  it('gives end of input to a question asked after the answers run out', () => {
    // Defect caught: a question with no answer left blocking until the spawn
    // bound kills the run, so a refusal case reports a timeout instead of the
    // script's own handling of a declined prompt.
    const r = spawnAtTerminal([lib, ask('first'), ask('second'), 'echo "GOT=[$first|$second]"'].join('\n'), {
      typed: 'only\n',
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('GOT=[only|<eof>]');
  });

  it('types a list item whole at one question, leaving its later lines waiting ahead of the next', () => {
    // Defect caught: a mid-run type-ahead split back into one line per
    // question, so a case proving a later prompt discards it passes against a
    // prompt with no drain.
    const r = spawnAtTerminal(
      [lib, 'IFS= read -r first </dev/tty', 'IFS= read -r second </dev/tty', ask('third'), 'echo "GOT=[$first|$second|$third]"'].join('\n'),
      { typed: ['one\ntwo\nAHEAD\n', 'three\n'] },
    );
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('GOT=[one|two|three]');
  });

  it('puts typeAhead on the terminal before the command starts, where a read with no drain takes it', () => {
    // Defect caught: type-ahead delivered late or not at all, so a case
    // proving the drain discards it passes against a prompt with no drain.
    const r = spawnAtTerminal('IFS= read -r early </dev/tty; echo "GOT=[$early]"', { typeAhead: 'AHEAD\n' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('GOT=[AHEAD]');
  });

  it('reports the command exit status and passes the environment and working directory through', () => {
    // Defect caught: a refusal exit read as success, or a stub seam set in
    // the environment never reaching the script under test.
    const r = spawnAtTerminal('echo "SEAM=[$PTY_SESSION_SEAM] DIR=[$PWD]"; exit 7', {
      env: { ...process.env, PTY_SESSION_SEAM: 'stub' },
      cwd: '/',
    });
    expect(r.status, r.stdout + r.stderr).toBe(7);
    expect(r.stdout).toContain('SEAM=[stub] DIR=[/]');
  });
});
