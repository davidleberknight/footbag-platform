/**
 * The button a browser presses when Enter is hit in a field of a form: the
 * form's first submit button in document order, counting buttons inside the
 * form and buttons outside it that name it with `form="<id>"`. Use it to check
 * that Enter in an edit form saves rather than running some other control the
 * form owns.
 */
import { Window } from 'happy-dom';

export interface DefaultSubmit {
  /** The button's visible label. */
  label: string;
  /** True when the button overrides the form's method or action. */
  overridesForm: boolean;
}

export function defaultSubmitButton(html: string, formId: string): DefaultSubmit | null {
  const window = new Window();
  window.document.write(html);
  const form = window.document.getElementById(formId);
  if (!form) throw new Error(`no form with id ${formId} in the page`);
  const buttons = Array.from(window.document.querySelectorAll('button, input[type="submit"]'));
  const first = buttons.find((b) => {
    const type = (b.getAttribute('type') ?? 'submit').toLowerCase();
    if (type !== 'submit') return false;
    const owner = b.getAttribute('form');
    return owner !== null ? owner === formId : form.contains(b);
  });
  if (!first) return null;
  return {
    label: (first.textContent ?? '').trim() || (first.getAttribute('value') ?? ''),
    overridesForm: first.hasAttribute('formaction') || first.hasAttribute('formmethod'),
  };
}
