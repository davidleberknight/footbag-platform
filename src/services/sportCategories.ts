/**
 * The footbag sports a competition belongs to, and their names: the one home
 * the event page, the organizer's competition form, the results upload and
 * the administrator's results correction all read.
 *
 * Sideline games appear only on past events, so the organizer's form and the
 * results upload offer the five current sports; the administrator's
 * correction, which edits past results, offers all six.
 */
export const SPORT_LABELS = {
  net: 'Net',
  freestyle: 'Freestyle',
  golf: 'Golf',
  consecutives: 'Consecutives',
  x_square: 'X-Square',
  sideline: 'Sideline',
} as const;

export type SportCategory = keyof typeof SPORT_LABELS;

/** The sports an organizer adds a competition in, or an upload names. */
export const CURRENT_SPORTS: readonly SportCategory[] = ['net', 'freestyle', 'golf', 'consecutives', 'x_square'];

/** Every sport a recorded competition may carry. */
export const ALL_SPORTS: readonly SportCategory[] = [...CURRENT_SPORTS, 'sideline'];

/** A sport's name, or the stored value when it is not one of the sports. */
export function sportLabel(category: string): string {
  return (SPORT_LABELS as Record<string, string>)[category] ?? category;
}

/** The sports as form options. */
export function sportOptions(sports: readonly SportCategory[]): Array<{ value: string; label: string }> {
  return sports.map((s) => ({ value: s, label: SPORT_LABELS[s] }));
}
