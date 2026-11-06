import { logger } from '../config/logger';
import type { CuratedSaveReceipt } from '../adapters/curatedAuthoringAdapter';
import { ServiceUnavailableError } from './serviceErrors';

// The authoring file is written first. A save that reached only the database would
// look done and be lost at the next rebuild, so a file that cannot be written
// refuses the save; and a database that then refuses it puts the file back, so a
// refused save leaves nothing for the next rebuild to apply.
/**
 * One save that spans several files, such as a publication. A failure partway
 * takes back the files already written, so the set lands whole or not at all.
 */
export function writeAll(writes: readonly (() => CuratedSaveReceipt)[]): () => CuratedSaveReceipt {
  return () => {
    const done: CuratedSaveReceipt[] = [];
    const undoAll = () => { for (const receipt of [...done].reverse()) receipt.undo(); };
    try {
      for (const write of writes) done.push(write());
    } catch (err) {
      undoAll();
      throw err;
    }
    return { undo: undoAll };
  };
}

/**
 * The first half on its own, for a save whose database step cannot sit inside
 * one callback (a retried insert, an awaited step): the caller undoes the receipt
 * on every path that does not commit.
 */
export function writeFileOrRefuse(write: () => CuratedSaveReceipt): CuratedSaveReceipt {
  try {
    return write();
  } catch (err) {
    logger.warn('curated save refused: the authoring file could not be written', {
      errorClass: (err as Error).constructor.name,
    });
    throw new ServiceUnavailableError('The authoring file could not be written, so nothing was saved.');
  }
}

export function writeFileThenCommit(write: (() => CuratedSaveReceipt) | null, commit: () => void): void {
  const receipt = write ? writeFileOrRefuse(write) : null;
  try {
    commit();
  } catch (err) {
    receipt?.undo();
    throw err;
  }
}
