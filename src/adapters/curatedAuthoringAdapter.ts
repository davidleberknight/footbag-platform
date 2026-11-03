/**
 * The seam between a curation screen and the committed authoring files.
 *
 * Before go-live, on a developer machine, a curator's save lands in a committed
 * file so that a database rebuild reproduces it. Everywhere else the database
 * write is the whole operation and there is no file to touch: a deployed host
 * carries no authoring tree, and after go-live the database is the only truth.
 * The backend is chosen once at startup from config, and a service never asks
 * which one it has.
 *
 * A trick's save file holds its slug and only the fields a curator has overridden,
 * with a null field marking a deliberate clear. Sources, aliases and links are saved
 * as whole records, one file each. The final freestyle loader applies these files
 * after every other input, so they win over the base inputs, and it reports each
 * value it overrides.
 *
 * A write is atomic, so a failure leaves the previous file whole. The write comes
 * before the service's database transaction and refuses the save when it fails:
 * a save that reached only the database would look done and be lost at the next
 * rebuild. The receipt lets the service put the file back if its transaction then
 * fails, so a refused save leaves nothing behind for a rebuild to apply.
 */
import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config/env';

/** The freestyle_tricks columns the trick editor writes and a save file may carry. */
export const TRICK_SAVE_FIELDS = [
  'canonical_name',
  'adds',
  'notation',
  'operational_notation',
  'trick_family',
  'base_trick',
  'category',
  'is_active',
  'sort_order',
  'review_status',
  'description',
  'short_description',
  'execution_summary',
  'learning_notes',
  'prerequisite_notes',
  'pronunciation',
  'operational_notation_source',
] as const;

export type TrickSaveField = (typeof TRICK_SAVE_FIELDS)[number];
export type TrickSaveFields = Partial<Record<TrickSaveField, string | number | null>>;

/**
 * The freestyle_ev_adjudications columns a curator's save changes. The history on
 * the row stays with the ledger, and who authored a notation is not among them: a
 * member's id does not belong in a committed file.
 */
export const RULING_SAVE_FIELDS = [
  'authored_notation',
  'notation_evidence_basis',
  'notation_derivation_method',
  'notation_convention_id',
  'notation_provenance_note',
  'ev_state',
  'hold_kind',
  'match_type',
  'final_disposition',
  'matched_existing_object',
  'published_trick_slug',
] as const;

export type RulingSaveField = (typeof RULING_SAVE_FIELDS)[number];
export type RulingSaveFields = Partial<Record<RulingSaveField, string | null>>;

/** Puts the authoring file back as it was before the save that returned this. */
export interface CuratedSaveReceipt {
  undo(): void;
}

/**
 * The saved items that are whole records rather than field overrides. Each file
 * states the record as the curator left it; `removed: true` marks a record taken
 * away, which a rebuild would otherwise bring back from a base input.
 */
export const SAVE_ITEM_KINDS = [
  'sources', 'published_tricks', 'aliases', 'source_links', 'modifier_links', 'records',
  'consecutive_records',
] as const;
export type SaveItemKind = (typeof SAVE_ITEM_KINDS)[number];
export type SaveItemBody = Record<string, string | number | boolean | null>;

export interface CuratedAuthoringAdapter {
  /** Records these fields for this trick, keeping fields saved earlier. */
  saveTrickFields(slug: string, fields: TrickSaveFields): CuratedSaveReceipt;
  /** Records these fields for this ruling, keeping fields saved earlier. */
  saveRulingFields(candidateId: string, fields: RulingSaveFields): CuratedSaveReceipt;
  /** Records one whole item, replacing any earlier save of it. */
  saveItem(kind: SaveItemKind, key: string, body: SaveItemBody): CuratedSaveReceipt;
}

const NOTHING_TO_UNDO: CuratedSaveReceipt = { undo: () => undefined };

function assertRulingShape(candidateId: string, fields: RulingSaveFields): void {
  if (!/^[a-z0-9_-]+$/.test(candidateId)) {
    throw new Error(`curated save refused: invalid ruling id ${JSON.stringify(candidateId)}`);
  }
  for (const field of Object.keys(fields)) {
    if (!(RULING_SAVE_FIELDS as readonly string[]).includes(field)) {
      throw new Error(`curated save refused: ${field} is not a ruling field a save may carry`);
    }
  }
}

// A key names a file, like a slug does, so the same refusal applies on both backends.
function assertItemShape(kind: SaveItemKind, key: string): void {
  if (!(SAVE_ITEM_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`curated save refused: unknown item kind ${JSON.stringify(kind)}`);
  }
  if (!/^[a-z0-9_-]+$/.test(key)) {
    throw new Error(`curated save refused: invalid item key ${JSON.stringify(key)}`);
  }
}

// A slug names a file, so a value that could leave the folder is refused. Both
// backends refuse it, so a defect here shows on every machine, not only on the one
// that writes files.
function assertSaveShape(slug: string, fields: TrickSaveFields): void {
  if (!/^[a-z0-9_-]+$/.test(slug)) {
    throw new Error(`curated save refused: invalid trick slug ${JSON.stringify(slug)}`);
  }
  for (const field of Object.keys(fields)) {
    if (!(TRICK_SAVE_FIELDS as readonly string[]).includes(field)) {
      throw new Error(`curated save refused: ${field} is not a trick field a save may carry`);
    }
  }
}

function writeAtomically(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
}

export function createFileCuratedAuthoringAdapter(opts: { rootDir: string }): CuratedAuthoringAdapter {
  return {
    saveTrickFields(slug, fields) {
      assertSaveShape(slug, fields);
      return mergeFields(path.join(opts.rootDir, 'tricks', `${slug}.json`), { slug }, fields);
    },
    saveRulingFields(candidateId, fields) {
      assertRulingShape(candidateId, fields);
      return mergeFields(
        path.join(opts.rootDir, 'rulings', `${candidateId}.json`), { candidate_id: candidateId }, fields,
      );
    },
    saveItem(kind, key, body) {
      assertItemShape(kind, key);
      const filePath = path.join(opts.rootDir, kind, `${key}.json`);
      const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
      writeAtomically(filePath, `${JSON.stringify(body, null, 2)}\n`);
      return receiptFor(filePath, before);
    },
  };
}

function mergeFields(
  filePath: string,
  target: Record<string, string>,
  fields: Record<string, string | number | null | undefined>,
): CuratedSaveReceipt {
  const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  const saved = before === null ? {} : (JSON.parse(before) as { fields: typeof fields }).fields;
  const merged = { ...saved, ...fields };
  const ordered = Object.fromEntries(Object.keys(merged).sort().map((key) => [key, merged[key]]));
  writeAtomically(filePath, `${JSON.stringify({ ...target, fields: ordered }, null, 2)}\n`);
  return receiptFor(filePath, before);
}

function receiptFor(filePath: string, before: string | null): CuratedSaveReceipt {
  return {
    undo() {
      if (before === null) fs.rmSync(filePath, { force: true });
      else writeAtomically(filePath, before);
    },
  };
}

export function createDatabaseOnlyCuratedAuthoringAdapter(): CuratedAuthoringAdapter {
  return {
    saveTrickFields(slug, fields) {
      assertSaveShape(slug, fields);
      return NOTHING_TO_UNDO;
    },
    saveRulingFields(candidateId, fields) {
      assertRulingShape(candidateId, fields);
      return NOTHING_TO_UNDO;
    },
    saveItem(kind, key) {
      assertItemShape(kind, key);
      return NOTHING_TO_UNDO;
    },
  };
}

function resolveSavesRoot(): string {
  if (config.curatorSavesDirOverride) return config.curatorSavesDirOverride;
  // A test that reached the committed tree would rewrite real inputs.
  if (config.nodeEnv === 'test') {
    throw new Error('curated saves need CURATOR_SAVES_DIR under test; the committed inputs are never a test target');
  }
  return path.join(process.cwd(), 'freestyle', 'inputs', 'curator_saves');
}

let singleton: CuratedAuthoringAdapter | null = null;

export function getCuratedAuthoringAdapter(): CuratedAuthoringAdapter {
  if (singleton) return singleton;
  singleton = config.allowCuratedSidecarWrites
    ? createFileCuratedAuthoringAdapter({ rootDir: resolveSavesRoot() })
    : createDatabaseOnlyCuratedAuthoringAdapter();
  return singleton;
}

export function setCuratedAuthoringAdapterForTests(adapter: CuratedAuthoringAdapter): void {
  singleton = adapter;
}

export function resetCuratedAuthoringAdapterForTests(): void {
  singleton = null;
}
