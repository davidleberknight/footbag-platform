/**
 * Write-time cleaning of human-typed text. Each case names what a reader of
 * stored text would see if the step it covers broke: markup or control
 * characters surviving into a page, look-alike spellings comparing unequal,
 * paragraphs flattened, or real content in another script being mangled.
 */
import { describe, it, expect } from 'vitest';
import {
  cleanUserText,
  sanitizeUserText,
  INVALID_TEXT_ENCODING_MESSAGE,
  type TextShape,
} from '../../src/lib/textSanitizer';
import { ValidationError } from '../../src/services/serviceErrors';

function clean(raw: string, shape: TextShape = 'single_line'): string {
  const result = sanitizeUserText(raw, shape);
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
  return result.text;
}

describe('sanitizeUserText: encoding', () => {
  it('refuses a lone surrogate and the replacement character left by invalid bytes', () => {
    expect(sanitizeUserText('abc\uD800def', 'single_line')).toEqual({ status: 'invalid_encoding' });
    expect(sanitizeUserText('abc\uDC00', 'multi_line')).toEqual({ status: 'invalid_encoding' });
    expect(sanitizeUserText('caf�', 'notation')).toEqual({ status: 'invalid_encoding' });
  });

  it('cleanUserText refuses damaged input as an error on the named field', () => {
    let caught: unknown;
    try {
      cleanUserText('bad�', 'multi_line', 'bio');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).fieldErrors).toEqual({ bio: INVALID_TEXT_ENCODING_MESSAGE });
    expect(cleanUserText(' <b>ok</b> ', 'single_line', 'bio')).toBe('ok');
  });

  it('keeps a valid surrogate pair (emoji) and text in other scripts', () => {
    expect(clean('Footbag 😀 Москва 東京 القاهرة')).toBe('Footbag 😀 Москва 東京 القاهرة');
  });

  it('composes to NFC so a decomposed spelling equals the composed one', () => {
    expect(clean('José')).toBe('José');
  });
});

describe('sanitizeUserText: HTML', () => {
  it('removes tags, including a script element and a comment', () => {
    expect(clean('<b>Bold</b> move')).toBe('Bold move');
    expect(clean('Hi<script>alert(1)</script>there')).toBe('Hialert(1)there');
    expect(clean('a<!-- hidden -->b')).toBe('ab');
    expect(clean('x<img src=x onerror=alert(1)>y')).toBe('xy');
  });

  it('removes a tag rebuilt from the halves of another', () => {
    expect(clean('<scr<b>ipt>bad')).toBe('bad');
  });

  it('keeps a lone angle bracket that is not a tag', () => {
    expect(clean('3 < 5 and 7 > 2')).toBe('3 < 5 and 7 > 2');
    expect(clean('CLIP > OP IN > TOE', 'multi_line')).toBe('CLIP > OP IN > TOE');
  });

  it('removes entities without decoding them, and keeps a bare ampersand', () => {
    expect(clean('&lt;script&gt;x')).toBe('scriptx');
    expect(clean('a&#60;b&#x3C;c&nbsp;d')).toBe('abcd');
    expect(clean('DLO & Eggbeater')).toBe('DLO & Eggbeater');
  });

  it('leaves notation brackets alone', () => {
    expect(clean('<DEX> [SPIN] > CLIP', 'notation')).toBe('<DEX> [SPIN] > CLIP');
  });
});

describe('sanitizeUserText: control characters and whitespace', () => {
  it('removes C0, DEL and C1 controls', () => {
    expect(clean('a\u0000b\u0007c\u007Fd\u0085e\u009Ff')).toBe('abcdef');
    expect(clean('a\u0000b\u0085c', 'multi_line')).toBe('abc');
  });

  it('turns any whitespace run in a single-line field into one space', () => {
    expect(clean('  Big\t\tAdd \n Posse  ')).toBe('Big Add Posse');
  });

  it('keeps a paragraph break in a multi-line field but caps blank lines at one', () => {
    expect(clean('First para.\n\nSecond para.', 'multi_line')).toBe('First para.\n\nSecond para.');
    expect(clean('One\n\n\n\nTwo', 'multi_line')).toBe('One\n\nTwo');
    expect(clean('Line one\nLine two', 'multi_line')).toBe('Line one\nLine two');
  });

  it('collapses spaces and tabs within a line and trims line ends', () => {
    expect(clean('a  \t b   \n   c  ', 'multi_line')).toBe('a b\nc');
  });

  it('normalises CRLF and a lone CR to a newline', () => {
    expect(clean('a\r\nb\rc', 'multi_line')).toBe('a\nb\nc');
  });

  it('reduces markup-only input to empty, so a required check rejects it', () => {
    expect(clean('<p></p>  <br/>')).toBe('');
  });

  it('is stable when applied twice', () => {
    const shapes: TextShape[] = ['single_line', 'multi_line', 'notation'];
    const input = ' <i>Mixed</i>\r\n\r\n\r\n  text &amp; more\u0085 ';
    for (const shape of shapes) {
      const once = clean(input, shape);
      expect(clean(once, shape)).toBe(once);
    }
  });
});
