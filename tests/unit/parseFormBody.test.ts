/**
 * The form-body parser every controller reads its body through.
 *
 * Contract: a text field arrives as a string or is absent (read as ''); a
 * repeated or non-text value is refused with a message naming the field by its
 * label and saying what was wrong; fields the schema does not name are dropped;
 * a body that is not a set of fields is refused as a whole.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { parseFormBody, formText, formList, formCheckbox, rawBody, FORM_UNREADABLE_MESSAGE } from '../../src/lib/parseFormBody';

const schema = z.object({
  email: formText('Email address'),
  password: formText('Password'),
  links: formList('Link'),
});

describe('parseFormBody', () => {
  // Defect caught: a blank or missing field is refused, or a well-formed form
  // loses a value, so a visitor filling the form normally is turned away.
  it('reads a well-formed body, absent text as empty and a single repeatable value as a list of one', () => {
    const r = parseFormBody(schema, { email: 'a@example.com', links: 'https://x.example' });
    expect(r).toEqual({ ok: true, data: { email: 'a@example.com', password: '', links: ['https://x.example'] } });
  });

  // Defect caught: a posted privileged field rides through to the service
  // (mass assignment).
  it('drops every field the schema does not name', () => {
    const r = parseFormBody(schema, { email: 'a@example.com', is_admin: '1', tier: '3', id: 'member_x' });
    expect(r.ok && Object.keys(r.data).sort()).toEqual(['email', 'links', 'password']);
  });

  // Defect caught: a repeated or non-text field passes through and throws in
  // the service (a 500), or is refused with a message that does not say which
  // field or what was wrong.
  it.each<[string, unknown, string]>([
    ['repeated', ['a@example.com', 'b@example.com'], 'Email address was submitted more than once. Enter it once and try again.'],
    ['a number', 7, 'Email address could not be read as text. Enter it again and try again.'],
    ['an object', { toString: 1 }, 'Email address could not be read as text. Enter it again and try again.'],
    ['a boolean', true, 'Email address could not be read as text. Enter it again and try again.'],
  ])('refuses a text field sent as %s, naming it', (_label, value, message) => {
    const r = parseFormBody(schema, { email: value, password: 'pw' });
    const submittedLists = Array.isArray(value) ? { email: value } : {};
    expect(r).toEqual({ ok: false, message, fieldErrors: { email: message }, submitted: { password: 'pw' }, submittedLists });
  });

  // Defect caught: a refused form comes back blank, erasing what the visitor
  // typed, or echoes back a posted field the form does not carry.
  it('keeps the named fields that arrived as text, and only those, for the re-render', () => {
    const r = parseFormBody(schema, { email: ['a', 'b'], password: 'pw', is_admin: '1' });
    expect(r.ok === false && r.submitted).toEqual({ password: 'pw' });
  });

  // Defect caught: a refused form with a repeating field (a list of links)
  // comes back with those rows blank, or keeps a list holding a non-text item,
  // or echoes a repeated field the form does not carry.
  it('keeps the named fields that arrived as several text values, and only those', () => {
    const r = parseFormBody(schema, { email: ['a', 'b'], links: ['https://x.example', ''], extra: ['1', '2'] });
    expect(r.ok === false && r.submittedLists).toEqual({ email: ['a', 'b'], links: ['https://x.example', ''] });
    const bad = parseFormBody(schema, { email: ['a', 'b'], links: ['a', { x: 1 }] });
    expect(bad.ok === false && bad.submittedLists).toEqual({ email: ['a', 'b'] });
  });

  // Defect caught: a form with two bad fields reports only one, so the visitor
  // fixes it and is refused again.
  it('reports every offending field, in form order', () => {
    const r = parseFormBody(schema, { email: ['a', 'b'], password: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors)).toEqual(['email', 'password']);
    expect(r.message).toBe(
      'Email address was submitted more than once. Enter it once and try again. '
      + 'Password could not be read as text. Enter it again and try again.',
    );
  });

  // Defect caught: a repeatable field accepts a nested value that a service
  // then mishandles.
  it('accepts a repeated list field of text and refuses one holding a non-text item', () => {
    expect(parseFormBody(schema, { links: ['a', 'b'] })).toMatchObject({ ok: true, data: { links: ['a', 'b'] } });
    expect(parseFormBody(schema, { links: ['a', { x: 1 }] })).toEqual({
      ok: false,
      message: 'Link could not be read as text. Enter it again and try again.',
      fieldErrors: { links: 'Link could not be read as text. Enter it again and try again.' },
      submitted: {},
      submittedLists: {},
    });
  });

  // Defect caught: a body that is not a set of fields (a JSON array or string)
  // throws instead of being refused.
  it.each<[string, unknown]>([['an array', ['x']], ['a string', 'email=x']])(
    'refuses a body that is %s as a whole',
    (_label, body) => {
      expect(parseFormBody(schema, body)).toEqual({ ok: false, message: FORM_UNREADABLE_MESSAGE, fieldErrors: {}, submitted: {}, submittedLists: {} });
    },
  );

  // Defect caught: a ticked box (posted as its hidden 0 then its 1) reads as
  // unticked, or an absent box reads as something other than its stated default.
  it('reads a checkbox paired with a hidden 0 by its last value, and an absent one as its default', () => {
    const boxes = z.object({ on: formCheckbox('Show it', '0'), off: formCheckbox('Hide it', '1') });
    expect(parseFormBody(boxes, { on: ['0', '1'], off: '0' })).toEqual({ ok: true, data: { on: '1', off: '0' } });
    expect(parseFormBody(boxes, {})).toEqual({ ok: true, data: { on: '0', off: '1' } });
  });

  // Defect caught: a request with no parsed body (no form fields at all) throws.
  it('reads a missing body as an empty form', () => {
    expect(parseFormBody(schema, undefined)).toEqual({ ok: true, data: { email: '', password: '', links: [] } });
  });
});

describe('rawBody', () => {
  // Defect caught: the webhook verifies a signature over a parsed object, or
  // accepts a non-byte body as bytes.
  it('returns the bytes only when the body is a Buffer', () => {
    const buf = Buffer.from('{"id":"evt"}');
    expect(rawBody({ body: buf } as never)).toBe(buf);
    expect(rawBody({ body: { id: 'evt' } } as never)).toBeUndefined();
  });
});
