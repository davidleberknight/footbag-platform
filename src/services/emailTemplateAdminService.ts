/**
 * Admin email-template editor service.
 *
 * Owns: shaping and validation for the admin email-template list and edit
 * pages over `email_templates`, and the audited update write. Edit-only by
 * design: no template creation or deletion — a template's existence, merge
 * fields, and send site are code (`emailTemplateRegistry.ts` plus the calling
 * service), while its wording, enabled flag, and PII classification are data
 * an admin may edit. Does not own rendering or sending (`emailService`) or
 * seeding (`scripts/seed_email_templates.py`).
 *
 * Required patterns: every save appends one `audit_entries` row
 * (`email_template.updated`) in the same transaction as the update.
 * Validation enforces the template contract: non-empty subject and body,
 * logic-less single-brace `{token}` syntax, the token set exactly equal to
 * the variant's declared merge-field set (an omitted required token would
 * silently send a broken email, for example a verification email with no
 * link; an unknown token would reach members as literal braces), and the
 * classification enum. Disabling a template suppresses that email type at
 * send time; the edit page carries warning copy, strongest for restricted
 * (credential-link) templates.
 */
import { emailTemplates, transaction, type EmailTemplateRow } from '../db/db';
import { appendAuditEntry } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';
import {
  emailTemplateMergeFields,
  type EmailPiiClass,
} from './emailTemplateRegistry';
import type { PageViewModel } from '../types/page';

const CLASSIFICATIONS: EmailPiiClass[] = ['public', 'internal', 'confidential', 'restricted'];
const SUBJECT_MAX = 300;
const BODY_MAX = 20000;

export interface EmailTemplateListRowViewModel {
  templateKey: string;
  subjectTemplate: string;
  classification: string;
  enabledLabel: string;
  isDisabled: boolean;
  updatedAtDisplay: string;
  editHref: string;
}

export interface EmailTemplateListContent {
  rows: EmailTemplateListRowViewModel[];
  totalCount: number;
  disabledCount: number;
  hasDisabled: boolean;
}

export interface EmailTemplateEditFields {
  subjectTemplate: string;
  bodyTemplate: string;
  piiClassification: string;
  isEnabled: boolean;
}

export interface EmailTemplateEditContent {
  templateKey: string;
  formAction: string;
  fields: EmailTemplateEditFields;
  mergeFieldList: string[];
  hasMergeFields: boolean;
  classificationOptions: Array<{ value: string; label: string; selected: boolean }>;
  isRestricted: boolean;
  backHref: string;
  saved: boolean;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
}

export interface EmailTemplateEditInput {
  subjectTemplate?: string;
  bodyTemplate?: string;
  piiClassification?: string;
  isEnabled?: boolean;
}

interface EditPageOptions {
  saved?: boolean;
  submitted?: EmailTemplateEditInput;
  fieldErrors?: Record<string, string>;
}

function tsDisplay(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ');
}

const TOKEN_RE = /\{([a-z][a-zA-Z0-9]*)\}/g;

// Mechanical template-text validation, mirroring the seeder's sidecar checks:
// single well-formed braces, camelCase tokens, no conditional syntax; then the
// strict registry contract: the used token set equals the declared set.
function validateTemplateText(
  field: string,
  label: string,
  text: string,
  declared: readonly string[],
  errors: Record<string, string>,
): void {
  if (text.includes('{{') || text.includes('}}')) {
    errors[field] = `${label}: templates are plain text with single-brace {token} merge fields; doubled braces are not supported.`;
    return;
  }
  let depth = 0;
  for (const ch of text) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth > 1 || depth < 0) {
      errors[field] = `${label}: unbalanced or nested braces.`;
      return;
    }
  }
  if (depth !== 0) {
    errors[field] = `${label}: unclosed '{'.`;
    return;
  }
  for (const m of text.matchAll(/\{([^}]*)\}/g)) {
    const token = m[1] ?? '';
    if (!/^[a-z][a-zA-Z0-9]*$/.test(token)) {
      errors[field] = `${label}: malformed merge token {${token}}.`;
      return;
    }
    if (!declared.includes(token)) {
      errors[field] = `${label}: unknown merge field {${token}}. Allowed: ${declared.length ? declared.map((t) => `{${t}}`).join(' ') : '(none)'}.`;
      return;
    }
  }
}

function shapeRow(row: EmailTemplateRow): EmailTemplateListRowViewModel {
  return {
    templateKey: row.template_key,
    subjectTemplate: row.subject_template,
    classification: row.pii_classification,
    enabledLabel: row.is_enabled ? 'enabled' : 'disabled',
    isDisabled: !row.is_enabled,
    updatedAtDisplay: tsDisplay(row.updated_at),
    editHref: `/admin/email-templates/${row.template_key}/edit`,
  };
}

export const emailTemplateAdminService = {
  getTemplateListPage(): PageViewModel<EmailTemplateListContent> {
    const rows = (emailTemplates.listAll.all() as EmailTemplateRow[]).map(shapeRow);
    const disabledCount = rows.filter((r) => r.isDisabled).length;
    return {
      seo: { title: 'Email Templates', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_email_templates', title: 'Email Templates' },
      content: {
        rows,
        totalCount: rows.length,
        disabledCount,
        hasDisabled: disabledCount > 0,
      },
    };
  },

  // Edit page for one template. Returns null for an unknown key (controller
  // maps to 404). `opts` re-renders after a save (saved banner) or a
  // validation failure (submitted values plus per-field errors).
  getTemplateEditPage(templateKey: string, opts: EditPageOptions = {}): PageViewModel<EmailTemplateEditContent> | null {
    const row = emailTemplates.getByKey.get(templateKey) as EmailTemplateRow | undefined;
    if (!row) return null;

    const sub = opts.submitted;
    const fields: EmailTemplateEditFields = {
      subjectTemplate: sub ? (sub.subjectTemplate ?? '') : row.subject_template,
      bodyTemplate: sub ? (sub.bodyTemplate ?? '') : row.body_template,
      piiClassification: sub ? (sub.piiClassification ?? '') : row.pii_classification,
      isEnabled: sub ? (sub.isEnabled ?? false) : row.is_enabled === 1,
    };

    const mergeFieldList = (emailTemplateMergeFields(templateKey) ?? []).map((t) => `{${t}}`);
    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);

    return {
      seo: { title: 'Email Templates', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_email_template_edit', title: row.template_key },
      content: {
        templateKey: row.template_key,
        formAction: `/admin/email-templates/${row.template_key}/edit`,
        fields,
        mergeFieldList,
        hasMergeFields: mergeFieldList.length > 0,
        classificationOptions: CLASSIFICATIONS.map((c) => ({
          value: c,
          label: c,
          selected: c === fields.piiClassification,
        })),
        isRestricted: row.pii_classification === 'restricted',
        backHref: '/admin/email-templates',
        saved: opts.saved === true,
        fieldErrors,
        errorList,
        hasErrors: errorList.length > 0,
      },
    };
  },

  // Update one template's editable fields, then append one audit entry, in a
  // single transaction. Throws NotFoundError for an unknown key and
  // ValidationError (with per-field messages) on bad input.
  updateTemplate(templateKey: string, input: EmailTemplateEditInput, actorMemberId: string): void {
    const current = emailTemplates.getByKey.get(templateKey) as EmailTemplateRow | undefined;
    if (!current) throw new NotFoundError(`No email template "${templateKey}"`);

    const subject = (input.subjectTemplate ?? '').trim();
    const body = (input.bodyTemplate ?? '').replace(/\r\n/g, '\n').trim();
    const classification = input.piiClassification ?? '';
    const isEnabled = input.isEnabled === true;

    const errors: Record<string, string> = {};
    if (!subject) errors.subjectTemplate = 'Subject: required.';
    else if (subject.length > SUBJECT_MAX) errors.subjectTemplate = `Subject: at most ${SUBJECT_MAX} characters.`;
    if (!body) errors.bodyTemplate = 'Body: required.';
    else if (body.length > BODY_MAX) errors.bodyTemplate = `Body: at most ${BODY_MAX} characters.`;
    if (!CLASSIFICATIONS.includes(classification as EmailPiiClass)) {
      errors.piiClassification = 'Classification: choose one of the listed values.';
    }

    const declared = emailTemplateMergeFields(templateKey) ?? [];
    if (!errors.subjectTemplate) validateTemplateText('subjectTemplate', 'Subject', subject, declared, errors);
    if (!errors.bodyTemplate) validateTemplateText('bodyTemplate', 'Body', body, declared, errors);
    // Every declared merge field must appear somewhere in the message: an
    // omitted {verifyUrl} would send a verification email with no link.
    if (!errors.subjectTemplate && !errors.bodyTemplate) {
      const used = new Set(
        [...subject.matchAll(TOKEN_RE), ...body.matchAll(TOKEN_RE)].map((m) => m[1] ?? ''),
      );
      const missing = declared.filter((t) => !used.has(t));
      if (missing.length) {
        errors.bodyTemplate = `Body: the message must use every merge field; missing ${missing.map((t) => `{${t}}`).join(' ')}.`;
      }
    }
    if (Object.keys(errors).length) {
      throw new ValidationError('Some fields need attention.', { fieldErrors: errors });
    }

    const changedFields: string[] = [];
    if (subject !== current.subject_template) changedFields.push('subject_template');
    if (body !== current.body_template) changedFields.push('body_template');
    if ((isEnabled ? 1 : 0) !== current.is_enabled) changedFields.push('is_enabled');
    if (classification !== current.pii_classification) changedFields.push('pii_classification');

    const now = new Date().toISOString();
    transaction(() => {
      emailTemplates.updateByKey.run(
        subject, body, isEnabled ? 1 : 0, classification, now, actorMemberId, templateKey,
      );
      appendAuditEntry({
        actionType: 'email_template.updated',
        category: 'content',
        actorType: 'admin',
        actorMemberId,
        entityType: 'email_template',
        entityId: templateKey,
        metadata: { changedFields },
      });
    });
  },
};
