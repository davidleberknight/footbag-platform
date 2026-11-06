// One email template's sidecar, `<curatedRoot>/email_templates/<key>.json`, in the
// exact shape the template seeder reads (scripts/seed_email_templates.py), so an
// admin edit on a developer machine is what the next seeding loads rather than
// being overwritten by it. The curated authoring adapter writes it.
import * as path from 'path';

export interface EmailTemplateSidecarData {
  templateKey: string;
  subjectTemplate: string;
  bodyTemplate: string;
  piiClassification: string;
  isEnabled: boolean;
}

export function emailTemplateSidecarPath(curatedRoot: string, templateKey: string): string {
  return path.join(curatedRoot, 'email_templates', `${templateKey}.json`);
}

export function formatEmailTemplateSidecar(data: EmailTemplateSidecarData): string {
  const body = {
    templateKey: data.templateKey,
    subjectTemplate: data.subjectTemplate,
    bodyTemplate: data.bodyTemplate,
    piiClassification: data.piiClassification,
    isEnabled: data.isEnabled,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}
