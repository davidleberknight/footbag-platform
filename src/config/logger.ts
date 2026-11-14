/**
 * Structured logger for the Footbag platform.
 *
 * A thin wrapper around console.log/error with no external dependencies.
 * Production and staging emit one newline-delimited JSON object per line so the
 * log pipeline can parse fields; development emits a compact human-readable line
 * instead, so a local dev session is scannable. Errors go to stderr, everything
 * else to stdout. Log level is compared by severity so that e.g. LOG_LEVEL=warn
 * suppresses info and debug output. Level and format are read from the config
 * singleton.
 *
 * Logs never carry a raw email address, token, password or secret. Callers log
 * only the fields an operator needs; as a backstop, every message and metadata
 * value passes through redact() before it is written, so one careless caller
 * cannot put such a value into the retained log.
 */
import { config } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function normalizeLevel(level: string): LogLevel {
  const lower = level.toLowerCase();
  if (lower in LEVEL_RANK) return lower as LogLevel;
  return 'info';
}

// Value shapes that are never written. The account-token shape is 32 random
// bytes in base64url: 43 characters standing alone, mixing upper and lower
// case. Record ids (a prefix plus a UUID), slugs and hex hashes are all one
// case or another length, so they are left intact.
const REDACTIONS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '[redacted-email]'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[redacted]'],
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+/g, '[redacted]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted]'],
  [
    /(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]{0,42}[A-Z])(?=[A-Za-z0-9_-]{0,42}[a-z])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
    '[redacted]',
  ],
];

// Metadata keys whose whole value is withheld, matched case-insensitively
// anywhere in the key (so `newPassword` and `Set-Cookie` are covered).
const SECRET_KEY = /pass(?:word|wd)|secret|cookie|authorization|signature/i;

function redactString(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) return redactString(`${value.name}: ${value.message}`);
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(inner);
    }
    return out;
  }
  return value;
}

// Compact rendering of one meta value for the human-readable format: bare for
// simple scalars, quoted when it contains whitespace, JSON for objects.
function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return /\s/.test(value) ? JSON.stringify(value) : value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatPretty(lvl: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  const time = new Date().toISOString().slice(11, 19); // HH:MM:SS
  let line = `${time} ${lvl.toUpperCase().padEnd(5)} ${msg}`;
  if (meta && Object.keys(meta).length > 0) {
    const pairs = Object.entries(meta)
      .map(([key, value]) => `${key}=${formatMetaValue(value)}`)
      .join(' ');
    line += `  ${pairs}`;
  }
  return line;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(level: string, pretty = false): Logger {
  const minRank = LEVEL_RANK[normalizeLevel(level)];

  function write(lvl: LogLevel, rawMsg: string, rawMeta?: Record<string, unknown>): void {
    if (LEVEL_RANK[lvl] < minRank) return;
    const msg = redactString(rawMsg);
    const meta = rawMeta === undefined ? undefined : (redact(rawMeta) as Record<string, unknown>);
    const output = pretty
      ? formatPretty(lvl, msg, meta)
      : JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg, ...meta });
    if (lvl === 'error') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info:  (msg, meta) => write('info',  msg, meta),
    warn:  (msg, meta) => write('warn',  msg, meta),
    error: (msg, meta) => write('error', msg, meta),
  };
}

export const logger: Logger = createLogger(
  config.logLevel,
  config.footbagEnv === 'development',
);
