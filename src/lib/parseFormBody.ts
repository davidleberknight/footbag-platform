/**
 * The one place a controller reads a submitted form body.
 *
 * The controller boundary is the trust boundary: each form's schema, written
 * beside its handler, states the fields the form carries and their types, and
 * the handler sees only the parsed result. A urlencoded form delivers every
 * value as a string, or as an array when a key repeats, so a field read
 * without a schema can arrive in a shape the code never expected and throw.
 * A schema refuses that shape instead, and the handler answers it as the
 * form's own validation failure, at 422, with a message naming the field and
 * what was wrong with it.
 *
 * Fields the schema does not name are dropped, so a posted extra field never
 * reaches a service. Content rules (an email's format, a password's policy,
 * a field's length) stay with the services, which already own them; the
 * schema decides shape only.
 */
import { z } from 'zod';
import type { Request } from 'express';

/** Shown when the body as a whole is not a set of form fields. */
export const FORM_UNREADABLE_MESSAGE =
  'This form could not be read. Reload the page and submit it again.';

function sentMoreThanOnce(label: string): string {
  return `${label} was submitted more than once. Enter it once and try again.`;
}

function notText(label: string): string {
  return `${label} could not be read as text. Enter it again and try again.`;
}

/**
 * A single text field, named in its messages by `label` (the field's visible
 * label). Absent reads as the empty string, as a blank input does.
 */
export function formText(label: string) {
  return z.unknown().optional().transform((v, ctx): string => {
    if (v === undefined) return '';
    if (typeof v === 'string') return v;
    ctx.addIssue({ code: 'custom', message: Array.isArray(v) ? sentMoreThanOnce(label) : notText(label) });
    return z.NEVER;
  });
}

/**
 * A text field whose absence means something different from a blank value
 * (a field only some variants of a form carry). Absent stays undefined.
 */
export function formOptionalText(label: string) {
  return z.unknown().optional().transform((v, ctx): string | undefined => {
    if (v === undefined || typeof v === 'string') return v;
    ctx.addIssue({ code: 'custom', message: Array.isArray(v) ? sentMoreThanOnce(label) : notText(label) });
    return z.NEVER;
  });
}

/**
 * A field that may repeat (several inputs sharing one name). Absent reads as
 * an empty list, one value as a list of one.
 */
export function formList(label: string) {
  return z.unknown().optional().transform((v, ctx): string[] => {
    if (v === undefined) return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v) && v.every((item) => typeof item === 'string')) return v as string[];
    ctx.addIssue({ code: 'custom', message: notText(label) });
    return z.NEVER;
  });
}

/**
 * A checkbox the form pairs with a hidden "0" before it, so an unticked box
 * still posts a value and a ticked one posts both. The box comes last, so the
 * last value is its state; absent reads as `absent`.
 */
export function formCheckbox(label: string, absent: '0' | '1') {
  return formList(label).transform((values) => values[values.length - 1] ?? absent);
}

export type FormParse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      message: string;
      fieldErrors: Record<string, string>;
      /** The schema's fields that did arrive as text, for the re-render to keep. */
      submitted: Partial<Record<string, string>>;
      /** The schema's fields that arrived as several text values (a repeating
       *  field such as a list of links), kept for the re-render the same way. */
      submittedLists: Partial<Record<string, string[]>>;
    };

/**
 * Parses a submitted body against a form's schema. A refusal carries one
 * message per offending field, keyed by the field's name; `message`, every
 * field's message in form order, for a form that shows one banner; and
 * `submitted` and `submittedLists`, the fields the schema names that arrived as
 * one text value or as several, so the form comes back holding what the
 * visitor typed.
 */
export function parseFormBody<S extends z.ZodType>(
  schema: S,
  body: unknown,
): FormParse<z.output<S>> {
  const input = body ?? {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: FORM_UNREADABLE_MESSAGE, fieldErrors: {}, submitted: {}, submittedLists: {} };
  }
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (!(key in fieldErrors)) fieldErrors[key] = issue.code === 'custom' ? issue.message : FORM_UNREADABLE_MESSAGE;
  }
  const named = schema instanceof z.ZodObject ? Object.keys(schema.shape) : [];
  const submitted: Partial<Record<string, string>> = {};
  const submittedLists: Partial<Record<string, string[]>> = {};
  for (const key of named) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'string') submitted[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) submittedLists[key] = value as string[];
  }
  return { ok: false, message: Object.values(fieldErrors).join(' '), fieldErrors, submitted, submittedLists };
}

/**
 * The raw request bytes on a route mounted with a raw-body parser (the payment
 * provider's webhook, which verifies a signature over the exact bytes sent).
 */
export function rawBody(req: Request): Buffer | undefined {
  return Buffer.isBuffer(req.body) ? req.body : undefined;
}
