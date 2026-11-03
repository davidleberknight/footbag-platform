import { logger } from '../config/logger';
import type { CuratedSaveReceipt } from '../adapters/curatedAuthoringAdapter';
import { ServiceUnavailableError } from './serviceErrors';

// The authoring file is written first. A save that reached only the database would
// look done and be lost at the next rebuild, so a file that cannot be written
// refuses the save; and a database that then refuses it puts the file back, so a
// refused save leaves nothing for the next rebuild to apply.
export function writeFileThenCommit(write: (() => CuratedSaveReceipt) | null, commit: () => void): void {
  let receipt: CuratedSaveReceipt | null = null;
  if (write) {
    try {
      receipt = write();
    } catch (err) {
      logger.warn('curated save refused: the authoring file could not be written', {
        errorClass: (err as Error).constructor.name,
      });
      throw new ServiceUnavailableError('The authoring file could not be written, so nothing was saved.');
    }
  }
  try {
    commit();
  } catch (err) {
    receipt?.undo();
    throw err;
  }
}
