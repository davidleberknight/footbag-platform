/**
 * Strip single-use token segments from a request URL so debug-level request
 * logs never capture an unconsumed email-verify or password-reset token. A
 * leaked debug log would otherwise let a reader replay the token and take
 * over the associated account or password change.
 */
export function redactTokenPaths(url: string): string {
  return url
    .replace(/^\/verify\/[^/?#]+/, '/verify/[redacted]')
    .replace(/^\/password\/reset\/[^/?#]+/, '/password/reset/[redacted]');
}
