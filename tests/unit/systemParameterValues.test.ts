/**
 * The value parsers behind the admin system-parameters screen.
 *
 * Both are strict on purpose. A configuration value drives a job that runs far
 * from the screen that set it, and a membership price is money, so an amount
 * or a count that is not exactly what it looks like is refused at the form
 * rather than rounded, truncated, or coerced into something plausible.
 */
import { describe, it, expect } from 'vitest';
import {
  parseUsdToCents,
  formatCentsAsUsd,
  parseCountValue,
} from '../../src/services/adminSystemParametersService';

describe('parseUsdToCents', () => {
  it('reads a whole-dollar amount', () => {
    expect(parseUsdToCents('10')).toBe(1000);
  });

  it('reads an amount with cents', () => {
    expect(parseUsdToCents('12.50')).toBe(1250);
  });

  it('reads a single decimal place as tens of cents', () => {
    expect(parseUsdToCents('12.5')).toBe(1250);
  });

  it('accepts a leading currency sign and surrounding space', () => {
    expect(parseUsdToCents('  $7.05 ')).toBe(705);
  });

  it('keeps a fractional amount below one dollar', () => {
    expect(parseUsdToCents('0.99')).toBe(99);
  });

  it('refuses a third decimal place rather than rounding it away', () => {
    expect(parseUsdToCents('12.505')).toBeNull();
  });

  it('refuses a negative amount', () => {
    expect(parseUsdToCents('-5.00')).toBeNull();
  });

  it('refuses words, empty input, and thousands separators', () => {
    expect(parseUsdToCents('fifty')).toBeNull();
    expect(parseUsdToCents('')).toBeNull();
    expect(parseUsdToCents('1,000')).toBeNull();
  });

  it('round-trips through the display format', () => {
    expect(formatCentsAsUsd(parseUsdToCents('12.50')!)).toBe('$12.50');
    expect(formatCentsAsUsd(parseUsdToCents('0.05')!)).toBe('$0.05');
  });
});

describe('formatCentsAsUsd', () => {
  it('pads the cents to two places', () => {
    expect(formatCentsAsUsd(1005)).toBe('$10.05');
  });

  it('shows a whole amount with a zero cents part', () => {
    expect(formatCentsAsUsd(5000)).toBe('$50.00');
  });

  it('shows zero', () => {
    expect(formatCentsAsUsd(0)).toBe('$0.00');
  });
});

describe('parseCountValue', () => {
  it('reads a whole number', () => {
    expect(parseCountValue('30')).toBe(30);
  });

  it('reads zero, leaving the per-key floor to decide whether zero is allowed', () => {
    expect(parseCountValue('0')).toBe(0);
  });

  it('tolerates surrounding space', () => {
    expect(parseCountValue(' 90 ')).toBe(90);
  });

  it('refuses a decimal rather than truncating it', () => {
    expect(parseCountValue('7.5')).toBeNull();
  });

  it('refuses a signed value', () => {
    expect(parseCountValue('-1')).toBeNull();
    expect(parseCountValue('+1')).toBeNull();
  });

  it('refuses words and empty input', () => {
    expect(parseCountValue('ninety')).toBeNull();
    expect(parseCountValue('')).toBeNull();
    expect(parseCountValue('   ')).toBeNull();
  });
});
