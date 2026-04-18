import type { EnvMap } from './parser.js';
import type { Schema, FieldSchema } from './validator.js';
import { writeFileAtomic } from '../utils/atomic.js';

export type SchemaFormat = 'json' | 'js';

export interface InitResult {
  readonly outputPath: string;
  readonly keysGenerated: number;
}

/**
 * Infers a field schema from an env value. Attempts to detect numbers,
 * booleans, URLs, emails, JSON, ports, and durations — falls back to string.
 */
function inferFieldSchema(value: string): FieldSchema {
  if (value === '') return { type: 'string', required: true };

  if (['true', 'false', '1', '0'].includes(value.toLowerCase())) {
    return { type: 'boolean', required: true };
  }

  if (/^\d+(ms|s|m|h|d)$/.test(value)) {
    return { type: 'duration', required: true };
  }

  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') {
    if (Number.isInteger(num) && num >= 1 && num <= 65535 && /^\d+$/.test(value)) {
      return { type: 'port', required: true };
    }
    return { type: 'number', required: true };
  }

  try {
    const url = new URL(value);
    if (
      /^https?:$/.test(url.protocol) ||
      /^(postgres|postgresql|redis|mongodb(\+srv)?|amqps?|mysql):$/.test(url.protocol)
    ) {
      return { type: 'url', required: true };
    }
  } catch {
    /* not a URL */
  }

  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) {
    return { type: 'email', required: true };
  }

  if ((value.startsWith('{') || value.startsWith('[')) && value.length > 1) {
    try {
      JSON.parse(value);
      return { type: 'json', required: true };
    } catch {
      /* not JSON */
    }
  }

  return { type: 'string', required: true };
}

/**
 * Generates a schema from an existing env map.
 * Infers types from values where possible — the user can then refine manually.
 */
export function generateSchema(env: EnvMap): Schema {
  const schema: Record<string, FieldSchema> = {};

  for (const [key, value] of env) {
    schema[key] = inferFieldSchema(value);
  }

  return schema;
}

export async function writeSchemaFile(
  schema: Schema,
  outputPath: string,
  format: SchemaFormat,
): Promise<void> {
  if (format === 'js') {
    const entries = Object.entries(schema)
      .map(([key, field]) => `  ${key}: ${JSON.stringify(field)},`)
      .join('\n');

    const content = [
      '// @ts-check',
      "/** @type {import('env-surgeon').Schema} */",
      'export default {',
      entries,
      '}',
      '',
    ].join('\n');

    // mode 0600: schemas enumerate secret keys — worth keeping off other users.
    await writeFileAtomic(outputPath, content, { mode: 0o600 });
  } else {
    await writeFileAtomic(outputPath, JSON.stringify(schema, null, 2) + '\n', { mode: 0o600 });
  }
}
