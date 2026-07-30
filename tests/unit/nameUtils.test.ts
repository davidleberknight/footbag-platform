import { describe, it, expect } from 'vitest';
import { matchReservedNameWord } from '../../src/services/nameUtils';

describe('reserved-name matching', () => {
  it('returns null for nothing to check', () => {
    expect(matchReservedNameWord('')).toBeNull();
    expect(matchReservedNameWord(null)).toBeNull();
    expect(matchReservedNameWord(undefined)).toBeNull();
    expect(matchReservedNameWord('   ')).toBeNull();
  });

  it('matches a role word wherever it sits in the name', () => {
    expect(matchReservedNameWord('Admin Smith')).toBe('Admin');
    expect(matchReservedNameWord('Bob Admin')).toBe('Admin');
    expect(matchReservedNameWord('Bob Admin Smith')).toBe('Admin');
  });

  it('matches every role word and every platform word', () => {
    for (const word of ['admin', 'administrator', 'system', 'support', 'moderator', 'staff']) {
      expect(matchReservedNameWord(`Chris ${word}`)).toBe(word);
    }
    for (const word of ['ifpa', 'footbag', 'official']) {
      expect(matchReservedNameWord(`Chris ${word}`)).toBe(word);
    }
  });

  it('ignores case', () => {
    expect(matchReservedNameWord('IFPA Support')).toBe('IFPA');
    expect(matchReservedNameWord('Footbag OFFICIAL')).toBe('Footbag');
    expect(matchReservedNameWord('MoDeRaToR Jones')).toBe('MoDeRaToR');
  });

  it('sees through accents', () => {
    expect(matchReservedNameWord('Ádmin Smith')).toBe('Ádmin');
    expect(matchReservedNameWord('Chris Supþort')).toBeNull();
    expect(matchReservedNameWord('Chris Süpport')).toBe('Süpport');
  });

  it('sees through digit-for-letter substitutions', () => {
    expect(matchReservedNameWord('Adm1n Smith')).toBe('Adm1n');
    expect(matchReservedNameWord('Chris Supp0rt')).toBe('Supp0rt');
    expect(matchReservedNameWord('M0derator Jones')).toBe('M0derator');
    expect(matchReservedNameWord('4dm1n Smith')).toBe('4dm1n');
    expect(matchReservedNameWord('Chris 0fficial')).toBe('0fficial');
    expect(matchReservedNameWord('$upport Jones')).toBe('$upport');
  });

  it('separates words on the punctuation that joins name parts', () => {
    expect(matchReservedNameWord('Smith-Admin')).toBe('Admin');
    expect(matchReservedNameWord("O'Admin")).toBe('Admin');
    expect(matchReservedNameWord('Chris A. Admin')).toBe('Admin');
    expect(matchReservedNameWord('ifpa_official_smith')).toBe('ifpa');
  });

  it('accepts a real name that merely contains a reserved word', () => {
    expect(matchReservedNameWord('Ana Stafford')).toBeNull();
    expect(matchReservedNameWord('Jane Footbagger')).toBeNull();
    expect(matchReservedNameWord('Lee Administrative')).toBeNull();
    expect(matchReservedNameWord('Sam Officiality')).toBeNull();
    expect(matchReservedNameWord('Cyrus Wasadmin')).toBeNull();
    expect(matchReservedNameWord('xXFootbagMasterXx')).toBeNull();
  });

  it('accepts ordinary names in any writing system', () => {
    expect(matchReservedNameWord('André Müller')).toBeNull();
    expect(matchReservedNameWord('你好 世界')).toBeNull();
    expect(matchReservedNameWord('Дмитрий Иванов')).toBeNull();
    expect(matchReservedNameWord('David Mockingbird')).toBeNull();
  });
});
