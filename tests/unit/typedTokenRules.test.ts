/**
 * The server-side rules for typed hashtags and slugs, held in one module so every
 * form applies them the same way, and the one explanation a person reads states
 * the same numbers the server enforces.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { TOKEN_RULES, tagRuleRefusal, assertTypedTags, checkTypedSlug } from '../../src/services/typedTokenRules';
import { ValidationError } from '../../src/services/serviceErrors';

const tagOfLength = (n: number) => `#${'a'.repeat(n - 1)}`;

describe('a single hashtag', () => {
  it('passes a folded hashtag at the length limit and refuses one past it', () => {
    expect(tagRuleRefusal(tagOfLength(TOKEN_RULES.tagMaxLength))).toBeNull();
    expect(tagRuleRefusal(tagOfLength(TOKEN_RULES.tagMaxLength + 1))).not.toBeNull();
  });

  // Folding would silently drop the part with no a to z form, so the whole
  // hashtag is refused, whether that part is all of it or only some.
  it('refuses a hashtag holding letters with no a to z form, whole or in part', () => {
    expect(tagRuleRefusal('#日本')).not.toBeNull();
    expect(tagRuleRefusal('#tokyo東京')).not.toBeNull();
    expect(tagRuleRefusal('#tokyo')).toBeNull();
  });

  it('refuses a value that is not in the stored hashtag form', () => {
    expect(tagRuleRefusal('#bad-tag')).not.toBeNull();
    expect(tagRuleRefusal('noprefix')).not.toBeNull();
  });
});

describe('a hashtag list', () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => `#t${i}`);

  it('allows the per-item limit and refuses one more, naming the count', () => {
    expect(() => assertTypedTags(list(TOKEN_RULES.tagsPerItem))).not.toThrow();
    expect(() => assertTypedTags(list(TOKEN_RULES.tagsPerItem + 1)))
      .toThrow(new RegExp(String(TOKEN_RULES.tagsPerItem + 1)));
  });

  it('names every refused hashtag and reports it against the given field', () => {
    try {
      assertTypedTags(['#ok', '#日本', '#reserved'], {
        field: 'criteriaTags',
        refuse: (t) => (t === '#reserved' ? `${t} is reserved` : null),
      });
      expect.unreachable('a list with refused hashtags must throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const e = err as ValidationError;
      expect(e.message).toContain('#日本');
      expect(e.message).toContain('#reserved');
      expect(e.message).not.toContain('#ok ');
      expect(Object.keys(e.fieldErrors ?? {})).toEqual(['criteriaTags']);
    }
  });
});

describe('a typed slug', () => {
  it('folds a profile URL and holds it to its length bounds on both sides', () => {
    expect(checkTypedSlug('Zoë Müller', 'profile')).toEqual({ ok: true, slug: 'zoe_muller' });
    expect(checkTypedSlug('a'.repeat(TOKEN_RULES.profileUrlMinLength), 'profile').ok).toBe(true);
    expect(checkTypedSlug('a'.repeat(TOKEN_RULES.profileUrlMinLength - 1), 'profile').ok).toBe(false);
    expect(checkTypedSlug('a'.repeat(TOKEN_RULES.profileUrlMaxLength), 'profile').ok).toBe(true);
    expect(checkTypedSlug('a'.repeat(TOKEN_RULES.profileUrlMaxLength + 1), 'profile').ok).toBe(false);
  });

  it('holds a club hashtag to its bounds, counting its #club_ prefix', () => {
    const room = TOKEN_RULES.clubHashtagMaxLength - '#club_'.length;
    expect(checkTypedSlug('a'.repeat(room), 'club').ok).toBe(true);
    expect(checkTypedSlug('a'.repeat(room + 1), 'club').ok).toBe(false);
    expect(checkTypedSlug('a', 'club').ok).toBe(false);
  });

  it('refuses a slug with letters that have no a to z form', () => {
    expect(checkTypedSlug('日本', 'profile').ok).toBe(false);
    expect(checkTypedSlug('ni_hao_你好', 'club').ok).toBe(false);
  });
});

// The explanation a person reads under each field states the rules; a number
// changed in the module and not in the explanation would tell people the wrong
// limit.
describe('the explanation of the rules', () => {
  const help = readFileSync(path.join(__dirname, '../../src/views/partials/hashtag-slug-help.hbs'), 'utf8');

  it('states the same limits the server enforces', () => {
    expect(help).toContain(`at most ${TOKEN_RULES.tagMaxLength} characters`);
    expect(help).toContain(`at most ${TOKEN_RULES.tagsPerItem} hashtags`);
    expect(help).toContain(`${TOKEN_RULES.profileUrlMinLength} to ${TOKEN_RULES.profileUrlMaxLength} characters`);
    expect(help).toContain(`at least ${TOKEN_RULES.clubHashtagMinLength} characters after #club_`);
  });
});
