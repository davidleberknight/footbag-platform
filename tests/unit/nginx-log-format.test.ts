/**
 * The nginx access log carries each request's timing.
 *
 * The origin-latency alarm reads CloudFront, which cannot say whether a slow
 * response was spent in nginx or in the app; the access log's last two fields
 * can. Appended rather than inserted, so a reader of the earlier fields keeps
 * its positions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const template = readFileSync(resolve(__dirname, '../../docker/nginx/nginx.conf.template'), 'utf8');
const mainFormat = template.match(/log_format main ([\s\S]*?);/)?.[1] ?? '';

describe('nginx log_format main', () => {
  it('ends with the request time and the upstream response time, after the original fields', () => {
    // Defect caught: a slow-response investigation with no way to place the
    // time, or the fields inserted mid-line and every earlier field shifted.
    const fields = mainFormat.replace(/'\s+'/g, '').replace(/^'|'$/g, '');
    expect(fields).toMatch(/^\$remote_addr - \$remote_user \[\$time_local\] "\$request" \$status \$body_bytes_sent "\$http_referer" "\$http_user_agent" /);
    expect(fields).toMatch(/ \$request_time \$upstream_response_time$/);
  });

  it('is the format the access log is written in', () => {
    expect(template).toMatch(/^\s*access_log \/var\/log\/nginx\/access\.log main;/m);
  });
});
