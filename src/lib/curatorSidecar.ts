import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, parse } from 'path';
import { ValidationError } from '../services/serviceErrors';

export const SIDECAR_CAPTION_MAX_LEN = 500;
export const SIDECAR_TAG_MAX_LEN = 100;

export interface CuratorSidecar {
  caption: string | null;
  tags: string[];
  isAvatar?: boolean;
  poster?: string | null;
}

export function sidecarPathForSource(sourceFilename: string): string {
  const parsed = parse(sourceFilename);
  return `${parsed.name}.meta.json`;
}

export function readSidecar(dirPath: string, sourceFilename: string): CuratorSidecar {
  const sidecarPath = join(dirPath, sidecarPathForSource(sourceFilename));
  if (!existsSync(sidecarPath)) {
    throw new ValidationError(`Sidecar missing: ${sidecarPathForSource(sourceFilename)}`);
  }
  let raw: string;
  try {
    raw = readFileSync(sidecarPath, 'utf-8');
  } catch (err) {
    throw new ValidationError(`Sidecar read failed: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ValidationError(`Sidecar JSON parse failed: ${(err as Error).message}`);
  }
  return validateSidecarShape(parsed, sourceFilename);
}

export function writeSidecar(
  dirPath: string,
  sourceFilename: string,
  data: CuratorSidecar,
): void {
  const validated = validateSidecarShape(data, sourceFilename);
  const sidecarPath = join(dirPath, sidecarPathForSource(sourceFilename));
  writeFileSync(sidecarPath, JSON.stringify(validated, null, 2) + '\n', 'utf-8');
}

export function deleteSidecar(dirPath: string, sourceFilename: string): void {
  const sidecarPath = join(dirPath, sidecarPathForSource(sourceFilename));
  if (existsSync(sidecarPath)) {
    unlinkSync(sidecarPath);
  }
}

function validateSidecarShape(value: unknown, sourceFilename: string): CuratorSidecar {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`Sidecar must be a JSON object: ${sourceFilename}`);
  }
  const obj = value as Record<string, unknown>;

  let caption: string | null;
  if (obj.caption === null || obj.caption === undefined) {
    caption = null;
  } else if (typeof obj.caption === 'string') {
    if (obj.caption.length > SIDECAR_CAPTION_MAX_LEN) {
      throw new ValidationError(
        `Sidecar caption exceeds ${SIDECAR_CAPTION_MAX_LEN} chars: ${sourceFilename}`,
      );
    }
    caption = obj.caption;
  } else {
    throw new ValidationError(`Sidecar caption must be string or null: ${sourceFilename}`);
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError(`Sidecar tags must be an array: ${sourceFilename}`);
  }
  const tags: string[] = [];
  for (const t of obj.tags) {
    if (typeof t !== 'string') {
      throw new ValidationError(`Sidecar tag must be a string: ${sourceFilename}`);
    }
    if (t.length > SIDECAR_TAG_MAX_LEN) {
      throw new ValidationError(
        `Sidecar tag exceeds ${SIDECAR_TAG_MAX_LEN} chars: ${sourceFilename}`,
      );
    }
    tags.push(t);
  }

  let isAvatar: boolean | undefined;
  if (obj.isAvatar !== undefined) {
    if (typeof obj.isAvatar !== 'boolean') {
      throw new ValidationError(`Sidecar isAvatar must be boolean: ${sourceFilename}`);
    }
    isAvatar = obj.isAvatar;
  }

  let poster: string | null | undefined;
  if (obj.poster !== undefined) {
    if (obj.poster === null || typeof obj.poster === 'string') {
      poster = obj.poster;
    } else {
      throw new ValidationError(`Sidecar poster must be string or null: ${sourceFilename}`);
    }
  }

  return { caption, tags, ...(isAvatar !== undefined && { isAvatar }), ...(poster !== undefined && { poster }) };
}
