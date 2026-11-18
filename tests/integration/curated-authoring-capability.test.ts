/**
 * Curation services decide from the curated-authoring adapter's declared
 * capability, never from the config switch behind it.
 *
 * The switch stays on throughout this file, as on a developer machine, and only
 * the injected adapter changes. A service that still read the switch would keep
 * acting as though files were written after the database-only adapter is in
 * place, so each case below fails for it.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../../src/lib/personaGuards';

const { dbPath } = setTestEnv('3949');

let adapterModule: typeof import('../../src/adapters/curatedAuthoringAdapter');
let mediaModule: typeof import('../../src/services/curatorMediaService');
let kicksModule: typeof import('../../src/services/consecutiveKicksCurationService');
let errorsModule: typeof import('../../src/services/serviceErrors');
let tmpRoot: string;

const PERSONA_ID = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}capability_check`;

beforeAll(async () => {
  createTestDb(dbPath).close();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-authoring-capability-'));
  adapterModule = await import('../../src/adapters/curatedAuthoringAdapter');
  mediaModule = await import('../../src/services/curatorMediaService');
  kicksModule = await import('../../src/services/consecutiveKicksCurationService');
  errorsModule = await import('../../src/services/serviceErrors');
});

afterEach(() => adapterModule.resetCuratedAuthoringAdapterForTests());

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  cleanupTestDb(dbPath);
});

function useFileAdapter(): void {
  adapterModule.setCuratedAuthoringAdapterForTests(
    adapterModule.createFileCuratedAuthoringAdapter({ rootDir: tmpRoot }));
}

function useDatabaseOnlyAdapter(): void {
  adapterModule.setCuratedAuthoringAdapterForTests(
    adapterModule.createDatabaseOnlyCuratedAuthoringAdapter());
}

describe('the curated media pages follow the adapter capability', () => {
  // Defect caught: with the database-only adapter in place the curator is still
  // shown the authoring-tree form (category field, committed-tree notices),
  // because the page reads the config switch instead of the adapter.
  it('shows the authoring-tree form only when the adapter writes files', () => {
    useFileAdapter();
    expect(mediaModule.getCuratorMediaNotFoundPage('m1').content.sidecarWritesEnabled).toBe(true);
    useDatabaseOnlyAdapter();
    expect(mediaModule.getCuratorMediaNotFoundPage('m1').content.sidecarWritesEnabled).toBe(false);
  });
});

describe('the test-persona guard follows the adapter capability', () => {
  const input = {} as Parameters<typeof kicksModule.consecutiveKicksCurationService.createRow>[0];

  // Defect caught: the guard that keeps seeded test personas from rewriting the
  // committed authoring files fires, or stays silent, by the config switch
  // rather than by whether a save will actually write a file.
  it('refuses a test persona only where a save writes the authoring files', () => {
    useFileAdapter();
    expect(() => kicksModule.consecutiveKicksCurationService.createRow(input, PERSONA_ID))
      .toThrow(errorsModule.ForbiddenError);

    useDatabaseOnlyAdapter();
    let thrown: unknown = null;
    try {
      kicksModule.consecutiveKicksCurationService.createRow(input, PERSONA_ID);
    } catch (err) {
      thrown = err;
    }
    // The empty input is refused further on; what matters is that the persona
    // guard did not refuse it first.
    expect(thrown).not.toBeInstanceOf(errorsModule.ForbiddenError);
  });
});
