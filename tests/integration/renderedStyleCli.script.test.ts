/**
 * scripts/rendered-style.ts — the command a session or a maintainer runs to
 * judge a page or prove a stylesheet refactor.
 *
 * Its exit status is what a loop or a person acts on: judge exits nonzero when
 * a capture breaks a rule and zero when it is clean, and diff with
 * --fail-on-change exits nonzero exactly when the two captures differ. A tool
 * that printed findings but exited zero would let a dead-CSS deletion that moved
 * a layout pass as "no change". The commands that drive a browser are proven by
 * the rendered-style browser check, which uses the same capture code.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { buildCapture, el } from '../fixtures/renderedStyleCapture';

const SCRIPT = join(process.cwd(), 'scripts/rendered-style.ts');
let dir: string;
const file = (name: string) => join(dir, name);

function run(...args: string[]) {
  const res = spawnSync('npx', ['tsx', SCRIPT, ...args], { cwd: process.cwd(), encoding: 'utf8', ...SPAWN_GUARD });
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

beforeAll(() => {
  dir = createScratchDir('rendered-style-cli');
  const clean = buildCapture(el('main', {}, el('p', { text: 'Body text' })));
  const grey = buildCapture(el('main', {}, el('p', { text: 'Body text', style: { color: 'rgb(170, 170, 170)' } })));
  writeFileSync(file('clean.json'), JSON.stringify(clean));
  writeFileSync(file('clean-again.json'), JSON.stringify(clean));
  writeFileSync(file('grey.json'), JSON.stringify(grey));
});

afterAll(() => removeScratch(dir));

describe('npm run style', () => {
  it('judge fails a capture that breaks a rule and passes a clean one', () => {
    // A judge that exited zero on findings would let a session report a broken page as clean.
    const bad = run('judge', file('grey.json'));
    expect(bad.status, bad.out).toBe(1);
    expect(bad.out).toContain('contrast-low');
    const good = run('judge', file('clean.json'));
    expect(good.status, good.out).toBe(0);
  });

  it('diff --fail-on-change fails exactly when the two captures differ', () => {
    // This exit status is the proof a dead-CSS deletion changed nothing; it must not pass a real change.
    const same = run('diff', file('clean.json'), file('clean-again.json'), '--fail-on-change');
    expect(same.status, same.out).toBe(0);
    expect(same.out).toContain('no change');
    const changed = run('diff', file('clean.json'), file('grey.json'), '--fail-on-change');
    expect(changed.status, changed.out).toBe(1);
    expect(changed.out).toContain('color');
  });

  it('refuses an unknown command and a malformed width rather than guessing', () => {
    // A typo that silently measured nothing would read as a clean result.
    expect(run('jduge', file('clean.json')).status).toBe(2);
    expect(run('url', '/', '--width', 'wide').status).toBe(2);
  });
});
