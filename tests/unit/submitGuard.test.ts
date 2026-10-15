/**
 * Unit tests for the double-submit guard at src/public/js/submit-guard.js.
 *
 * A double click on a form's submit button sends the form twice, and the member
 * sees the second response. Once a POST form submits, the guard refuses any
 * further submit of it and disables its submit controls, without dropping the
 * pressed button's name and value from the first submission. It leaves alone a
 * submit something earlier cancelled and every GET form, and a page restored
 * from the back-forward cache gets its controls back.
 *
 * happy-dom does not navigate on submit, so each case dispatches the submit
 * event itself and observes what the guard did to the event and the DOM.
 */
// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCRIPT_PATH = path.resolve(__dirname, '../../src/public/js/submit-guard.js');
const SCRIPT_SRC = fs.readFileSync(SCRIPT_PATH, 'utf8');

/** Evaluate the vanilla browser IIFE against the current happy-dom globals. */
function runScript(): void {
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT_SRC)();
}

/** Dispatch a cancelable submit as the browser would; returns whether it was prevented. */
function submit(form: HTMLFormElement, submitter: HTMLElement | null): boolean {
  const event = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter });
  form.dispatchEvent(event);
  return event.defaultPrevented;
}

function pageshow(persisted: boolean): void {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

beforeAll(() => {
  // The listeners attach to document and window once, as the deferred script
  // does on a real page; each case replaces the body underneath them.
  runScript();
});

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('submit-guard.js: double-submit guard', () => {
  it('lets the first POST submit through with its pressed button still enabled, then disables the buttons', () => {
    document.body.innerHTML = `
      <form id="f" method="POST" action="/x">
        <button id="a" type="submit" name="no_link_answer" value="never_had_one">A</button>
        <button id="b" name="no_link_answer" value="cannot_find_it">B</button>
        <input id="i" type="submit" value="Go">
        <button id="plain" type="button">Not a submit</button>
      </form>`;
    const form = byId<HTMLFormElement>('f');
    const pressed = byId<HTMLButtonElement>('a');

    expect(submit(form, pressed)).toBe(false);
    // A button disabled during the submit event is dropped from the form data,
    // which would lose the answer the member picked.
    expect(pressed.disabled).toBe(false);

    vi.runAllTimers();
    expect(pressed.disabled).toBe(true);
    expect(byId<HTMLButtonElement>('b').disabled).toBe(true);
    expect(byId<HTMLInputElement>('i').disabled).toBe(true);
    expect(byId<HTMLButtonElement>('plain').disabled).toBe(false);
  });

  it('refuses a second submit of the same form, before and after the buttons are disabled', () => {
    document.body.innerHTML = `
      <form id="f" method="post" action="/x"><button id="s">Save</button></form>`;
    const form = byId<HTMLFormElement>('f');
    const button = byId<HTMLButtonElement>('s');

    expect(submit(form, button)).toBe(false);
    expect(submit(form, button)).toBe(true);
    vi.runAllTimers();
    // An Enter key in a field submits with no submitter at all.
    expect(submit(form, null)).toBe(true);
  });

  it('leaves a submit cancelled earlier untouched, so a declined confirm can be submitted again', () => {
    document.body.innerHTML = `
      <form id="f" method="post" action="/x"><button id="s">Delete</button></form>`;
    const form = byId<HTMLFormElement>('f');
    const button = byId<HTMLButtonElement>('s');
    const decline = (e: Event): void => e.preventDefault();
    document.addEventListener('submit', decline, true);
    try {
      submit(form, button);
      vi.runAllTimers();
      expect(button.disabled).toBe(false);
    } finally {
      document.removeEventListener('submit', decline, true);
    }
    expect(submit(form, button)).toBe(false);
  });

  it('never guards a GET form, so a search or download can be repeated', () => {
    document.body.innerHTML = `
      <form id="g" method="get" action="/search"><button id="s">Search</button></form>
      <form id="d" action="/search"><button id="t">Search</button></form>`;
    for (const [formId, buttonId] of [['g', 's'], ['d', 't']]) {
      const form = byId<HTMLFormElement>(formId);
      const button = byId<HTMLButtonElement>(buttonId);
      expect(submit(form, button), `first submit of form ${formId}`).toBe(false);
      vi.runAllTimers();
      expect(button.disabled, `button of form ${formId}`).toBe(false);
      expect(submit(form, button), `second submit of form ${formId}`).toBe(false);
    }
  });

  it('decides by the pressed button when it overrides the form method', () => {
    document.body.innerHTML = `
      <form id="f" method="get" action="/x">
        <button id="look">Look</button>
        <button id="save" formmethod="post">Save</button>
      </form>`;
    const form = byId<HTMLFormElement>('f');
    expect(submit(form, byId('look'))).toBe(false);
    expect(submit(form, byId('look'))).toBe(false);
    expect(submit(form, byId('save'))).toBe(false);
    expect(submit(form, byId('save'))).toBe(true);
  });

  it('disables a submit button that sits outside the form and is associated by its form attribute', () => {
    document.body.innerHTML = `
      <form id="f" method="post" action="/x"></form>
      <button id="outside" type="submit" form="f">Save</button>`;
    const outside = byId<HTMLButtonElement>('outside');
    submit(byId('f'), outside);
    vi.runAllTimers();
    expect(outside.disabled).toBe(true);
  });

  it('guards each form on a page on its own', () => {
    document.body.innerHTML = `
      <form id="one" method="post" action="/one"><button id="s1">One</button></form>
      <form id="two" method="post" action="/two"><button id="s2">Two</button></form>`;
    submit(byId('one'), byId('s1'));
    vi.runAllTimers();
    expect(byId<HTMLButtonElement>('s2').disabled).toBe(false);
    expect(submit(byId('two'), byId('s2'))).toBe(false);
  });

  it('gives a page restored from the back-forward cache its submit controls back, and only those it took', () => {
    document.body.innerHTML = `
      <form id="f" method="post" action="/x">
        <button id="s">Buy</button>
        <button id="off" disabled>Unavailable</button>
      </form>`;
    const form = byId<HTMLFormElement>('f');
    const button = byId<HTMLButtonElement>('s');
    submit(form, button);
    vi.runAllTimers();

    pageshow(false);
    expect(button.disabled).toBe(true);
    expect(submit(form, button)).toBe(true);

    pageshow(true);
    expect(button.disabled).toBe(false);
    expect(byId<HTMLButtonElement>('off').disabled).toBe(true);
    expect(submit(form, button)).toBe(false);
  });
});
