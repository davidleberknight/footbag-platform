/**
 * Run a command at a pseudo-terminal and type each answer only when it is asked for.
 *
 * Use this whenever a suite drives a script that prompts on its terminal: a
 * typed APPLY, a yes or no, a secret read at the keyboard. Do not queue the
 * answers on a pty up front (`script -qec` with `input:`). Every prompt in the
 * tree throws away what is already waiting on the terminal before it asks, so
 * that a line typed ahead never answers a question nobody has read; answers
 * queued before the first prompt are thrown away the same way, and the run
 * then sees no answer at all.
 *
 * When an answer is due is decided by the terminal itself, never by a delay
 * or by matching prompt text. The next answer is typed at the moment a
 * process of the run is asleep reading a line from the terminal: one read()
 * call on the terminal, still unfinished on both sides of a moment when the
 * terminal is in line mode with nothing already waiting. The drain reads with
 * line mode off, so it never counts as asking; a read on a
 * pipe (a command substitution) or a file is not on the terminal, so it does
 * not either. After an answer is typed, the next one waits for that read to
 * have returned, so two answers are never queued together. Once the answers
 * are used up, each further question gets end of input, as a terminal does
 * when the operator presses Ctrl-D.
 *
 * `typeAhead` is the deliberate opposite: bytes put on the terminal before the
 * command starts, for a case proving they are discarded rather than read. To
 * type ahead in the middle of a run, give `typed` as a list: each item is typed
 * whole at one question, so an item of two lines answers that question and
 * leaves its second line waiting ahead of the next one.
 *
 * The command runs under bash with the terminal as its stdin, stdout and
 * stderr and as its controlling terminal; stdout is everything the terminal
 * showed (the terminal ends lines with CR LF). The driver gives up and kills
 * the whole run a few seconds inside the shared spawn bound, reporting on
 * stderr how many answers were never typed, so a prompt that is never
 * answered fails as itself rather than as a killed spawn.
 *
 * Linux only: it reads each process's current system call from /proc.
 */
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from './spawnGuard';
import { requireToolInCI } from './toolAvailability';

/** Availability of the driver's interpreter, for a suite's `skipIf`. */
export const HAS_PTY_DRIVER = requireToolInCI('python3', '--version');

/** How far inside the spawn bound the driver gives up, so its report is what a hang shows. */
const DRIVER_MARGIN_MS = 3_000;

const DRIVER = String.raw`
import fcntl, json, os, platform, select, signal, struct, sys, termios, time

cfg = json.loads(bytes.fromhex(sys.argv[1]).decode('utf-8'))
answers = [bytes.fromhex(a) for a in cfg['answers']]
deadline = time.monotonic() + cfg['deadlineMs'] / 1000.0
READ = {'x86_64': 0, 'aarch64': 63}.get(platform.machine())
if READ is None or not os.path.exists('/proc/self/syscall'):
    sys.stderr.write('pty driver: cannot see system calls on ' + platform.machine() + '\n')
    sys.exit(125)

master, slave = os.openpty()
slave_name = os.ttyname(slave)
type_ahead = bytes.fromhex(cfg['typeAhead'])
if type_ahead:
    os.write(master, type_ahead)
pid = os.fork()
if pid == 0:
    os.setsid()
    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
    for fd in (0, 1, 2):
        os.dup2(slave, fd)
    os.close(master)
    if slave > 2:
        os.close(slave)
    os.execvp('bash', ['bash', '-c', cfg['command']])


def session_members():
    found = []
    for entry in os.listdir('/proc'):
        if not entry.isdigit():
            continue
        try:
            with open('/proc/' + entry + '/stat') as f:
                stat = f.read()
        except OSError:
            continue
        if int(stat[stat.rindex(')') + 2:].split()[3]) == pid:
            found.append(int(entry))
    return found


def terminal_reader():
    # (pid, reads completed so far) of a run process asleep in read() on the
    # terminal; the count changes once that read returns.
    for p in session_members():
        try:
            with open('/proc/%d/syscall' % p) as f:
                parts = f.read().split()
            if len(parts) < 2 or parts[0] != str(READ):
                continue
            target = os.readlink('/proc/%d/fd/%d' % (p, int(parts[1], 16)))
            if target not in (slave_name, '/dev/tty'):
                continue
            with open('/proc/%d/io' % p) as f:
                reads = next(l for l in f if l.startswith('syscr:')).split()[1]
            return (p, reads)
        except (OSError, ValueError, StopIteration):
            continue
    return None


def asking():
    # The same unfinished read seen before and after the terminal is found in
    # line mode with nothing waiting: the drain switches line mode off before
    # its own read and back on after it, so one read call cannot be the
    # drain's and span a moment of line mode.
    before = terminal_reader()
    if before is None:
        return None
    if not termios.tcgetattr(slave)[3] & termios.ICANON:
        return None
    if struct.unpack('i', fcntl.ioctl(slave, termios.FIONREAD, b'\0\0\0\0'))[0]:
        return None
    return before if terminal_reader() == before else None


out = b''
answered = None
status = None
while True:
    if time.monotonic() > deadline:
        try:
            os.killpg(pid, signal.SIGKILL)
        except OSError:
            pass
        sys.stdout.buffer.write(out)
        sys.stderr.write('pty driver: gave up after %dms; %d answer(s) never asked for\n' % (cfg['deadlineMs'], len(answers)))
        sys.exit(124)
    ready, _, _ = select.select([master], [], [], 0.005)
    if ready:
        try:
            out += os.read(master, 65536)
        except OSError:
            pass
        continue
    if status is not None:
        break
    done, st = os.waitpid(pid, os.WNOHANG)
    if done:
        status = st
        continue
    reader = asking()
    if reader is not None and reader != answered:
        answered = reader
        os.write(master, answers.pop(0) if answers else termios.tcgetattr(slave)[6][termios.VEOF])

sys.stdout.buffer.write(out)
code = os.waitstatus_to_exitcode(status)
sys.exit(128 - code if code < 0 else code)
`;

export interface PtySessionOptions {
  /** What the operator types: one line per question, in order; or a list of what is typed at each question. */
  typed?: string | string[];
  /** Bytes already waiting on the terminal before the command starts. */
  typeAhead?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** A longer spawn bound, for a suite whose own bound is longer than the shared one. */
  timeout?: number;
}

export interface PtySessionResult {
  /** The command's exit status; 124, as `timeout(1)` uses, when the driver gave up waiting. */
  status: number | null;
  /** Everything the terminal showed. */
  stdout: string;
  /** The driver's own complaints only; the command's stderr is on the terminal. */
  stderr: string;
}

/** Splits typed input into the lines a person enters one at a time. */
function lines(typed: string): string[] {
  return typed.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex');

/** Runs `command` under `bash -c` at a pseudo-terminal, typing each line of `typed` when asked. */
export function spawnAtTerminal(command: string, opts: PtySessionOptions = {}): PtySessionResult {
  const bound = { ...SPAWN_GUARD, timeout: opts.timeout ?? SPAWN_GUARD.timeout };
  const config = {
    command,
    answers: (Array.isArray(opts.typed) ? opts.typed : lines(opts.typed ?? '')).map(hex),
    typeAhead: hex(opts.typeAhead ?? ''),
    deadlineMs: bound.timeout - DRIVER_MARGIN_MS,
  };
  const res = spawnSync('python3', ['-I', '-c', DRIVER, hex(JSON.stringify(config))], {
    encoding: 'utf-8',
    env: opts.env ?? process.env,
    cwd: opts.cwd,
    ...bound,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: `${res.stderr ?? ''}${res.error ? String(res.error) : ''}` };
}
