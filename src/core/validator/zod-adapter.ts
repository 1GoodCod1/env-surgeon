import type { EnvMap } from '../parser.js';
import type { ValidationError, ValidationResult, ValidateOptions } from './types.js';

/**
 * Minimal duck-typed shape for a Zod schema. We intentionally avoid a peer
 * import of `zod` so it stays an optional runtime dependency — users only
 * need to install it if they actually pass a Zod schema.
 */
export interface ZodLike {
  readonly _def: unknown;
  safeParse(input: unknown): ZodSafeParseResult;
}

interface ZodIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}

interface ZodSafeParseResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: { readonly issues: ReadonlyArray<ZodIssue> };
}

export function isZodSchema(value: unknown): value is ZodLike {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return '_def' in v && typeof v.safeParse === 'function';
}

/**
 * Validates an env map against a Zod object schema.
 *
 * Env values are always strings — remember to use `z.coerce.number()`,
 * `z.coerce.boolean()`, etc. for typed fields. Booleans-from-strings
 * (`"1"` / `"0"` / `"true"` / `"false"`) need a `z.preprocess` or custom
 * refinement; Zod's `z.coerce.boolean()` treats any non-empty string as
 * `true`, which is rarely what you want.
 *
 * Strict mode is controlled by the user's Zod schema (`.strict()` /
 * `.passthrough()` / `.strip()`) — there is no `strict` option here to
 * avoid two competing strictness settings.
 */
export function validateWithZod(
  env: EnvMap,
  schema: ZodLike,
  options: ValidateOptions = {},
): ValidationResult {
  void options;
  const input: Record<string, string> = {};
  for (const [k, v] of env) input[k] = v;

  const result = schema.safeParse(input);
  if (result.success) return { ok: true, errors: [] };

  const issues = result.error?.issues ?? [];
  const errors: ValidationError[] = issues.map((issue) => ({
    key: issue.path.length > 0 ? issue.path.map(String).join('.') : '<root>',
    error: issue.message,
  }));
  return { ok: false, errors };
}
