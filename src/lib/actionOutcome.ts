/**
 * The controller half of "a repeat reports the first outcome".
 *
 * A state-changing service method ends one of four ways: its action happened
 * (`advance`), this actor's own earlier submit already made it happen
 * (`own_repeat`), the state already held from someone else's act
 * (`already_held`), or it was refused. Every ending that changed nothing still
 * redirects 303 with a message, so a double click, a back-button re-post or a
 * second tab never shows an error for an action that succeeded.
 *
 * The tone follows the reader: their own repeat repeats the first submit's
 * success, because they did cause that change; a state they found already in
 * place is informational, because they changed nothing; a refusal is a refusal.
 */
import type { Request, Response } from 'express';
import { writeFlash, type FlashKind } from './flashCookie';
import { outcomePayload, type OutcomeTone } from './outcomeNotice';

export type ActionEnding = 'advance' | 'own_repeat' | 'already_held' | 'refused';

const TONE: Record<ActionEnding, OutcomeTone> = {
  advance: 'ok',
  own_repeat: 'ok',
  already_held: 'info',
  refused: 'no',
};

export function toneForEnding(ending: ActionEnding): OutcomeTone {
  return TONE[ending];
}

/** Flash the ending's message in its tone and redirect 303 to the page that
 *  owns the resulting state. */
export function redirectWithOutcome(
  req: Request,
  res: Response,
  opts: { flash: FlashKind; to: string; ending: ActionEnding; text: string },
): void {
  writeFlash(res, req, opts.flash, outcomePayload(toneForEnding(opts.ending), opts.text));
  res.redirect(303, opts.to);
}
