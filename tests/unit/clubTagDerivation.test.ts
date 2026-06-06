import { describe, it, expect } from 'vitest';
import {
  deriveClubTag,
  slugifyClubText,
  stripRedundantSuffix,
  extractPrimaryCity,
} from '../../src/services/clubTag';

const never = () => false;

// The expected tags below were produced by the data pipeline's tag
// generator for the same inputs; byte parity keeps platform-promoted clubs
// consistent in hashtag form with pipeline-pre-populated siblings.
describe('deriveClubTag pipeline parity', () => {
  it('city-first when a distinct city exists', () => {
    expect(deriveClubTag('Austin Footbag Club', 'USA', 'Austin', never)).toBe('#club_austin');
  });

  it('strips a leading "The" and the redundant footbag-club suffix from the name slug', () => {
    expect(deriveClubTag('The Portland Footbag Club', 'USA', 'Portland', never)).toBe('#club_portland');
  });

  it('folds accents to ascii', () => {
    expect(deriveClubTag('Club de Footbag de Montréal', 'Canada', 'Montréal', never)).toBe('#club_montreal');
  });

  it('maps letters whose decomposition never reaches ascii', () => {
    expect(deriveClubTag('Łódź Footbag', 'Poland', 'Łódź', never)).toBe('#club_lodz');
  });

  it('falls back to the name slug when city equals country', () => {
    expect(deriveClubTag('Singapore Footbag', 'Singapore', 'Singapore', never)).toBe('#club_singapore');
  });

  it('falls back to the name slug when the city is empty', () => {
    expect(deriveClubTag('Wanderers FC', 'UK', '', never)).toBe('#club_wanderers');
  });

  it('uses only the primary city from multi-city values and drops parentheticals', () => {
    expect(deriveClubTag('Prairie Footbag (est. 1999)', 'Canada', 'Calgary / Edmonton', never)).toBe('#club_calgary');
  });

  it('cascades city -> country_city -> country_city_name -> numeric suffix as tags get taken', () => {
    const taken = new Set<string>();
    const next = () => {
      const tag = deriveClubTag('Austin Footbag Club', 'USA', 'Austin', (t) => taken.has(t));
      taken.add(tag);
      return tag;
    };
    expect(next()).toBe('#club_austin');
    expect(next()).toBe('#club_usa_austin');
    expect(next()).toBe('#club_usa_austin_austin');
    expect(next()).toBe('#club_usa_austin_austin_2');
    expect(next()).toBe('#club_usa_austin_austin_3');
  });
});

describe('slug helpers', () => {
  it('slugifyClubText collapses non-alphanumerics and trims underscores', () => {
    expect(slugifyClubText('  San José -- Foot Bag!  ')).toBe('san_jose_foot_bag');
    expect(slugifyClubText('')).toBe('');
  });

  it('stripRedundantSuffix removes the longest matching suffix but never empties the slug', () => {
    expect(stripRedundantSuffix('portland_footbag_club')).toBe('portland');
    expect(stripRedundantSuffix('footbag_club')).toBe('footbag');
    expect(stripRedundantSuffix('_club')).toBe('_club');
    expect(stripRedundantSuffix('no_suffix_here')).toBe('no_suffix_here');
  });

  it('extractPrimaryCity handles separators and empty input', () => {
    expect(extractPrimaryCity('Calgary / Edmonton')).toBe('Calgary');
    expect(extractPrimaryCity('Minneapolis and St. Paul')).toBe('Minneapolis');
    expect(extractPrimaryCity('')).toBe('');
  });
});
