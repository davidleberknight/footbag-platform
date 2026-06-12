/**
 * Beginner-facing descriptions of the judged freestyle competition formats.
 *
 * Prose only. The prevalence of each format (how many documented events ran
 * it) is computed live in the service from event_disciplines, so the page
 * never carries a hand-frozen count that drifts from the archive. Official
 * IFPA rules wording is supplied separately and is not part of this module;
 * these are plain introductions for a newcomer.
 *
 * `match` lists the lowercase substrings that identify a format in a
 * discipline name, used by the live prevalence query.
 */

export interface CompetitionFormat {
  key:   string;
  name:  string;
  blurb: string;
  match: readonly string[];
}

export const COMPETITION_FORMATS: readonly CompetitionFormat[] = [
  {
    key:   'routines',
    name:  'Routines',
    blurb:
      'Choreographed performances set to music. A competitor builds a timed run that ' +
      'combines difficulty, variety, and showmanship, and judges score the add count ' +
      'attempted, the cleanliness of execution, and the overall artistry.',
    match: ['routine'],
  },
  {
    key:   'shred30',
    name:  '30 Second Shred',
    blurb:
      'A thirty second burst of the hardest tricks a player can land. Short and intense: ' +
      'the goal is to pack as much difficulty as possible into half a minute without a drop.',
    match: ['shred'],
  },
  {
    key:   'sick3',
    name:  'Sick 3',
    blurb:
      'Competitors nominate three tricks in advance and attempt to land each one cleanly. ' +
      'The format rewards self-declared difficulty, with no room to fall back on an easier ' +
      'trick if one fails.',
    match: ['sick 3', 'sick3', 'sick-3', 'sick three'],
  },
  {
    key:   'sick-trick',
    name:  'Sick Trick',
    blurb:
      'A single best-trick contest. Each player attempts the hardest individual trick they ' +
      'can land cleanly, and the highest add count that sticks wins.',
    match: ['sick trick', 'best trick'],
  },
  {
    key:   'circle',
    name:  'Circle',
    blurb:
      'Players take turns in a shared circle, trading tricks and building on one another. ' +
      'Part jam and part contest, it rewards consistency and variety in a fast, social setting.',
    match: ['circle'],
  },
  {
    key:   'battle',
    name:  'Battle',
    blurb:
      'Two players go head to head, alternating attempts while a judge or the crowd picks the ' +
      'winner of each round. Bracket-style elimination decides the champion.',
    match: ['battle'],
  },
  {
    key:   'request',
    name:  'Request',
    blurb:
      'Specific tricks are called out and the player must land them on demand. It tests range ' +
      'and reliability across the whole vocabulary rather than a single rehearsed run.',
    match: ['request'],
  },
];
