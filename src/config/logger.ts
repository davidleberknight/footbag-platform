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

  function write(lvl: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_RANK[lvl] < minRank) return;
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
