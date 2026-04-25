export type { EnvMap, ParserOptions } from './core/parser.js';
export type { SchemaFormat } from './core/init.js';
export { generateSchema, writeSchemaFile } from './core/init.js';
export type { DiffResult, DiffEntry } from './core/differ.js';
export type { ScanResult, ScanOptions } from './core/scanner.js';
export type {
  ValidationResult,
  ValidationError,
  FieldSchema,
  FieldType,
  Schema,
  ZodLike,
  LoadedSchema,
} from './core/validator.js';
export type { CheckResult, CheckOptions } from './core/checker.js';

export { parseEnvFile, parseEnvString } from './core/parser.js';
export { diffEnvMaps, hasDifferences } from './core/differ.js';
export { scanDirectory, extractEnvVars, generateExampleFile } from './core/scanner.js';
export {
  loadSchema,
  validateEnvMap,
  isZodSchema,
  validateWithZod,
  loadSchemaAuto,
  validateAuto,
} from './core/validator.js';
export { checkEnv, parseOptionalKeys } from './core/checker.js';

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseEnvFile, parseEnvString } from './core/parser.js';
import { diffEnvMaps } from './core/differ.js';
import { scanDirectory } from './core/scanner.js';
import { validateEnvMap, isZodSchema, validateWithZod, type ZodLike } from './core/validator.js';
import { checkEnv, parseOptionalKeys } from './core/checker.js';
import { readEnvCascade, defaultEnvCascade } from './utils/errors.js';
export { readEnvCascade, defaultEnvCascade, UserError } from './utils/errors.js';
import type { DiffResult } from './core/differ.js';
import type { ScanResult } from './core/scanner.js';
import type { ValidationResult, Schema } from './core/validator.js';
import type { CheckResult } from './core/checker.js';

/** High-level API — thin wrappers for common use cases */

export async function diff(leftPath: string, rightPath: string): Promise<DiffResult> {
  const [left, right] = await Promise.all([
    parseEnvFile({ path: resolve(leftPath) }),
    parseEnvFile({ path: resolve(rightPath) }),
  ]);
  return diffEnvMaps(left, right);
}

export async function scan(dir: string): Promise<ScanResult> {
  return scanDirectory({ dir: resolve(dir) });
}

export interface CheckFileOptions {
  /** Single path, array of paths (cascade), or `"auto"` to use NODE_ENV-based selection. */
  readonly env?: string | ReadonlyArray<string> | 'auto';
  readonly template: string;
  readonly expand?: boolean;
  readonly strict?: boolean;
}

export async function check(options: CheckFileOptions): Promise<CheckResult> {
  const templateRaw = await readFile(resolve(options.template), 'utf-8');
  const template = parseEnvString(templateRaw);
  const optionalKeys = parseOptionalKeys(templateRaw);

  const current = await resolveEnv(options.env, options.expand === true);

  return checkEnv({ current, template }, optionalKeys, options.strict === true);
}

async function resolveEnv(
  env: string | ReadonlyArray<string> | 'auto' | undefined,
  expand: boolean,
): Promise<ReadonlyMap<string, string>> {
  if (env === undefined) {
    return new Map<string, string>(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
  }
  if (env === 'auto') {
    return readEnvCascade(
      defaultEnvCascade().map((p) => resolve(p)),
      expand,
    );
  }
  if (typeof env === 'string') {
    return parseEnvFile({ path: resolve(env), expand });
  }
  return readEnvCascade(
    env.map((p) => (p === '-' ? p : resolve(p))),
    expand,
  );
}

export interface ValidateFileOptions {
  readonly env: string | ReadonlyArray<string> | 'auto';
  readonly schema: string | Schema | ZodLike;
  readonly expand?: boolean;
  readonly strict?: boolean;
}

export async function validate(options: ValidateFileOptions): Promise<ValidationResult> {
  const envMap = await resolveEnv(options.env, options.expand === true);

  if (typeof options.schema !== 'string') {
    if (isZodSchema(options.schema)) {
      return validateWithZod(envMap, options.schema, { strict: options.strict === true });
    }
    return validateEnvMap(envMap, options.schema, { strict: options.strict === true });
  }

  const { loadSchemaAuto, validateAuto } = await import('./core/validator.js');
  const loaded = await loadSchemaAuto(resolve(options.schema), { allowedRoot: process.cwd() });
  return validateAuto(envMap, loaded, { strict: options.strict === true });
}
