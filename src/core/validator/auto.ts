import { readFile, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import type { EnvMap } from '../parser.js';
import { UserError } from '../../utils/errors.js';
import {
  isSchema,
  VALID_TYPES,
  type LoadSchemaOptions,
  type Schema,
  type ValidateOptions,
  type ValidationResult,
} from './types.js';
import { validateEnvMap } from './validate-env.js';
import { isZodSchema, validateWithZod, type ZodLike } from './zod-adapter.js';

/**
 * Schema shape returned by {@link loadSchemaAuto} — either the JSON-style
 * field-by-field declaration, or a Zod object schema. The caller uses the
 * discriminator to pick a validator, but can also just pass the whole thing
 * to {@link validateAuto} and let it dispatch.
 */
export type LoadedSchema =
  | { readonly kind: 'json'; readonly schema: Schema }
  | { readonly kind: 'zod'; readonly schema: ZodLike };

/**
 * Loads a schema from JSON or JS/TS-compiled-to-JS, auto-detecting whether
 * the default export is a Zod schema or our native JSON schema.
 *
 * Security: JS schemas execute as code via dynamic `import()`. Callers should
 * pass `allowedRoot` (typically `process.cwd()`) to refuse scripts outside
 * the project tree. The loader also rejects non-file URL schemes and
 * follows symlinks on both sides of the containment check.
 */
export async function loadSchemaAuto(
  schemaPath: string,
  options: LoadSchemaOptions = {},
): Promise<LoadedSchema> {
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(schemaPath) &&
    !schemaPath.toLowerCase().startsWith('file:') &&
    !/^[a-zA-Z]:[\\/]/.test(schemaPath)
  ) {
    throw new Error(
      `Refusing to load schema from non-file URL: ${schemaPath}\nOnly local paths are allowed.`,
    );
  }

  const ext = schemaPath.split('.').pop()?.toLowerCase();
  const absolutePath = isAbsolute(schemaPath) ? schemaPath : resolve(schemaPath);

  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
    const allowedRoot = options.allowedRoot;
    if (allowedRoot !== undefined) {
      const rootResolved = resolve(allowedRoot);
      const [realPath, realRoot] = await Promise.all([
        realpath(absolutePath).catch(() => absolutePath),
        realpath(rootResolved).catch(() => rootResolved),
      ]);
      const rel = relative(realRoot, realPath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(
          `Refusing to load JS schema outside project root: ${schemaPath}\n` +
            `JS schemas execute as code; move the file under ${allowedRoot} or use a JSON schema.`,
        );
      }
    }

    let mod: { default?: unknown; schema?: unknown };
    try {
      mod = (await import(pathToFileURL(absolutePath).href)) as {
        default?: unknown;
        schema?: unknown;
      };
    } catch (err) {
      const code =
        err !== null && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      const message = err instanceof Error ? err.message : String(err);

      if (
        code === 'ERR_REQUIRE_ESM' ||
        /Cannot use import statement outside a module/i.test(message)
      ) {
        throw new UserError(
          `Failed to load schema: ${schemaPath} uses ESM syntax in a CommonJS context.\n` +
            `Rename it to .mjs, or add "type": "module" to the nearest package.json.`,
        );
      }
      if (err instanceof SyntaxError) {
        throw new UserError(`Failed to load schema ${schemaPath}: ${message}`);
      }
      if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND' || code === 'ENOENT') {
        throw new UserError(`Failed to load schema ${schemaPath}: ${message}`);
      }
      throw new UserError(`Failed to load schema ${schemaPath}: ${message}`);
    }
    const parsed = mod.default ?? mod.schema ?? mod;

    if (isZodSchema(parsed)) return { kind: 'zod', schema: parsed };
    if (isSchema(parsed)) return { kind: 'json', schema: parsed };

    throw new Error(
      `Invalid schema file: ${schemaPath}\n` +
        `Default export must be either a Zod schema (z.object({...})) ` +
        `or an object where each key has a valid "type" field ` +
        `(one of: ${Array.from(VALID_TYPES).join(', ')}).`,
    );
  }

  const raw = await readFile(absolutePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in schema file ${schemaPath}: ${message}`, { cause: err });
  }
  if (!isSchema(parsed)) {
    throw new Error(
      `Invalid schema file: ${schemaPath}\n` +
        `Expected an object where each key has a valid "type" field ` +
        `(one of: ${Array.from(VALID_TYPES).join(', ')}).`,
    );
  }
  return { kind: 'json', schema: parsed };
}

/**
 * Dispatches validation to the right backend based on the loaded schema kind.
 * Use this when you do not know ahead of time whether the user supplied a
 * JSON schema or a Zod schema.
 */
export function validateAuto(
  env: EnvMap,
  loaded: LoadedSchema,
  options: ValidateOptions = {},
): ValidationResult {
  if (loaded.kind === 'zod') return validateWithZod(env, loaded.schema, options);
  return validateEnvMap(env, loaded.schema, options);
}
