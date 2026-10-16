// Writes one email template's sidecar, `<curatedRoot>/email_templates/<key>.json`,
// in the exact shape the template seeder reads (scripts/seed_email_templates.py),
// so an admin edit on a developer machine is what the next seeding loads rather
// than being overwritten by it. Atomic: temp file plus rename, so a failure
// leaves the previous file whole.
import * as fs from 'fs';
import * as path from 'path';

export interface EmailTemplateSidecarData {
  templateKey: string;
  subjectTemplate: string;
  bodyTemplate: string;
  piiClassification: string;
  isEnabled: boolean;
}

export function writeEmailTemplateSidecarFile(curatedRoot: string, data: EmailTemplateSidecarData): void {
  const dir = path.join(curatedRoot, 'email_templates');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${data.templateKey}.json`);
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  const body = {
    templateKey: data.templateKey,
    subjectTemplate: data.subjectTemplate,
    bodyTemplate: data.bodyTemplate,
    piiClassification: data.piiClassification,
    isEnabled: data.isEnabled,
  };
  fs.writeFileSync(tmpPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}
