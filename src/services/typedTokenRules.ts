/**
 * The server-side rules for anything a person types that becomes a hashtag or a
 * slug, in one place so every form applies and words them the same way.
 *
 * Folding itself is `slugify.ts` (the one rule). This module judges the result:
 *   - A tag or slug holding a letter or digit with no a to z form is refused, never
 *     folded, because folding would drop part of what was written.
 *   - A tag is at most 100 characters; an item or tag set carries at most 30 tags.
 *   - A profile URL is 2 to 70 characters; a club hashtag is at least 2, and with
 *     its `#club_` at most 100.
 * Domain rules stay with the services that own them: reserved tags (passed in as
 * `refuse`), role words and the family name on a profile URL, uniqueness.
 */
import { ValidationError } from './serviceErrors';
import { hasUnconvertibleLetters, slugifyForTag } from './slugify';

export const TOKEN_RULES = {
  tagMaxLength: 100,
  tagsPerItem: 30,
  profileUrlMinLength: 2,
  profileUrlMaxLength: 70,
  clubHashtagMinLength: 2,
  clubHashtagMaxLength: 100,
} as const;

// A tag in its saved form: the author's capitals are kept for display.
const STORED_TAG = /^#[A-Za-z0-9_]+$/;

/** Why one stored-form tag breaks a rule, or null when it keeps them all. */
export function tagRuleRefusal(tag: string): string | null {
  if (hasUnconvertibleLetters(tag)) {
    return `${tag} cannot be used: a hashtag needs letters a to z or digits, and these letters have no a to z form.`;
  }
  if (tag.length > TOKEN_RULES.tagMaxLength) {
    return `${tag.slice(0, 40)}… is longer than ${TOKEN_RULES.tagMaxLength} characters, the most a hashtag can be.`;
  }
  if (!STORED_TAG.test(tag)) {
    return `${tag} cannot be used: a hashtag uses only the letters a to z, digits and underscores.`;
  }
  return null;
}

/**
 * Refuse a tag list that breaks any rule, naming every tag that does. `refuse`
 * adds the caller's reserved tags (the curator marker, uploader tags); `field`
 * names the form field the refusal is shown against.
 */
export function assertTypedTags(
  tags: string[],
  opts: { field?: string; refuse?: (tag: string) => string | null } = {},
): void {
  const problems: string[] = [];
  if (tags.length > TOKEN_RULES.tagsPerItem) {
    problems.push(`At most ${TOKEN_RULES.tagsPerItem} hashtags can be added at once; this has ${tags.length}.`);
  }
  for (const tag of tags) {
    const problem = tagRuleRefusal(tag) ?? opts.refuse?.(tag) ?? null;
    if (problem) problems.push(problem);
  }
  if (problems.length === 0) return;
  const message = problems.join(' ');
  throw new ValidationError(message, opts.field ? { fieldErrors: { [opts.field]: message } } : undefined);
}

/**
 * A typed slug folded by the one rule, or the reason it is refused: letters with
 * no a to z form, or a length outside the kind's bounds after folding.
 */
export function checkTypedSlug(
  typed: string,
  kind: 'profile' | 'club',
): { ok: true; slug: string } | { ok: false; message: string } {
  const what = kind === 'profile' ? 'Your profile URL' : 'The hashtag';
  if (hasUnconvertibleLetters(typed)) {
    return { ok: false, message: `${what} needs letters a to z or digits, and these letters have no a to z form.` };
  }
  const slug = slugifyForTag(typed);
  if (kind === 'profile') {
    if (slug.length < TOKEN_RULES.profileUrlMinLength) {
      return { ok: false, message: `Profile URL must be at least ${TOKEN_RULES.profileUrlMinLength} characters.` };
    }
    if (slug.length > TOKEN_RULES.profileUrlMaxLength) {
      return { ok: false, message: `Profile URL must be ${TOKEN_RULES.profileUrlMaxLength} characters or fewer.` };
    }
  } else {
    if (slug.length < TOKEN_RULES.clubHashtagMinLength) {
      return { ok: false, message: 'The hashtag needs at least 2 characters after #club_.' };
    }
    if (`#club_${slug}`.length > TOKEN_RULES.clubHashtagMaxLength) {
      return { ok: false, message: 'The hashtag is too long. Including #club_, it must be 100 characters or fewer.' };
    }
  }
  return { ok: true, slug };
}
