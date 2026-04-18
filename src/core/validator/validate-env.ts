import type { EnvMap } from '../parser.js';
import { maskValue } from '../../utils/mask.js';
import { MAX_PATTERN_LENGTH, MAX_VALUE_LENGTH } from './constants.js';
import type {
  FieldSchema,
  Schema,
  ValidateOptions,
  ValidationError,
  ValidationResult,
} from './types.js';

/**
 * Validates an env map against a schema.
 * Error messages mask values to avoid leaking secrets into CI logs.
 */
export function validateEnvMap(
  env: EnvMap,
  schema: Schema,
  options: ValidateOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];

  if (options.strict === true) {
    for (const key of env.keys()) {
      if (!Object.prototype.hasOwnProperty.call(schema, key)) {
        errors.push({ key, error: 'not declared in schema (strict mode)' });
      }
    }
  }

  for (const [key, fieldSchema] of Object.entries(schema)) {
    const rawValue = env.get(key) ?? fieldSchema.default;
    const isRequired = fieldSchema.required !== false;

    if (rawValue === undefined || rawValue === '') {
      if (isRequired) {
        errors.push({ key, error: 'required but missing or empty' });
      }
      continue;
    }

    if (rawValue.length > MAX_VALUE_LENGTH) {
      errors.push({ key, error: `value exceeds ${MAX_VALUE_LENGTH} byte limit` });
      continue;
    }

    const typeError = validateType(key, rawValue, fieldSchema);
    if (typeError !== null) {
      errors.push(typeError);
      continue;
    }

    const constraintError = validateConstraints(key, rawValue, fieldSchema);
    if (constraintError !== null) {
      errors.push(constraintError);
    }
  }

  return { errors, ok: errors.length === 0 };
}

function validateType(key: string, value: string, schema: FieldSchema): ValidationError | null {
  switch (schema.type) {
    case 'number': {
      if (value.trim() === '' || Number.isNaN(Number(value))) {
        return { key, error: `expected number, got ${maskValue(value)}` };
      }
      return null;
    }
    case 'boolean': {
      if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
        return { key, error: `expected boolean (true/false/1/0), got ${maskValue(value)}` };
      }
      return null;
    }
    case 'url': {
      try {
        new URL(value);
        return null;
      } catch {
        return { key, error: `expected valid URL, got ${maskValue(value)}` };
      }
    }
    case 'email': {
      if (!isValidEmail(value)) {
        return { key, error: `expected valid email, got ${maskValue(value)}` };
      }
      return null;
    }
    case 'json': {
      try {
        JSON.parse(value);
        return null;
      } catch {
        return { key, error: `expected valid JSON, got ${maskValue(value)}` };
      }
    }
    case 'port': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        return { key, error: `expected TCP port (1–65535), got ${maskValue(value)}` };
      }
      return null;
    }
    case 'duration': {
      if (!DURATION_RE.test(value.trim())) {
        return { key, error: `expected duration (e.g. 30s, 5m, 2h), got ${maskValue(value)}` };
      }
      return null;
    }
    case 'secret': {
      const minLen = schema.min ?? 16;
      if (value.length < minLen) {
        return { key, error: `secret shorter than ${minLen} chars` };
      }
      const minEnt = schema.minEntropy ?? 3.0;
      const ent = shannonEntropy(value);
      if (ent < minEnt) {
        return {
          key,
          error: `secret entropy ${ent.toFixed(2)} < ${minEnt} bits/char (looks low-randomness)`,
        };
      }
      return null;
    }
    case 'array': {
      const sep = schema.separator ?? ',';
      const items = value
        .split(sep)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const itemType = schema.itemType ?? 'string';
      for (const item of items) {
        if (itemType === 'number' && Number.isNaN(Number(item))) {
          return { key, error: `array item "${maskValue(item)}" is not a number` };
        }
        if (itemType === 'url') {
          try {
            new URL(item);
          } catch {
            return { key, error: `array item "${maskValue(item)}" is not a URL` };
          }
        }
        if (itemType === 'email' && !isValidEmail(item)) {
          return { key, error: `array item "${maskValue(item)}" is not an email` };
        }
      }
      return null;
    }
    case 'string':
      return null;
  }
}

const DURATION_RE = /^\d+(ms|s|m|h|d)$/;

function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// Bounded quantifiers — no nested unbounded groups, safe from catastrophic backtracking.
// Not fully RFC 5322 (that requires a parser, not a regex), but rejects obvious garbage
// while staying linear in input length.
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;

function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;
  return EMAIL_RE.test(value);
}

function validateConstraints(
  key: string,
  value: string,
  schema: FieldSchema,
): ValidationError | null {
  if (schema.pattern !== undefined) {
    if (schema.pattern.length > MAX_PATTERN_LENGTH) {
      return {
        key,
        error: `pattern exceeds ${MAX_PATTERN_LENGTH} char limit (possible ReDoS)`,
      };
    }
    let regex: RegExp;
    try {
      regex = new RegExp(schema.pattern);
    } catch {
      return { key, error: `invalid pattern in schema: "${schema.pattern}"` };
    }
    if (!regex.test(value)) {
      return { key, error: `does not match pattern ${schema.pattern}` };
    }
  }

  const allowed = schema.enum ?? schema.oneOf;
  if (allowed !== undefined && !allowed.includes(value)) {
    return { key, error: `must be one of [${allowed.join(', ')}], got ${maskValue(value)}` };
  }

  if (schema.type === 'number' || schema.type === 'port') {
    const num = Number(value);
    if (schema.min !== undefined && num < schema.min) {
      return { key, error: `must be >= ${schema.min}, got ${num}` };
    }
    if (schema.max !== undefined && num > schema.max) {
      return { key, error: `must be <= ${schema.max}, got ${num}` };
    }
  }

  if (schema.type === 'string') {
    if (schema.min !== undefined && value.length < schema.min) {
      return { key, error: `length must be >= ${schema.min}, got ${value.length}` };
    }
    if (schema.max !== undefined && value.length > schema.max) {
      return { key, error: `length must be <= ${schema.max}, got ${value.length}` };
    }
  }

  return null;
}
