import type { EnvMap } from './parser.js';

export interface CheckOptions {
  readonly current: EnvMap;
  readonly template: EnvMap;
}

export interface CheckResult {
  readonly ok: boolean;
  readonly missing: ReadonlyArray<string>;
  readonly present: ReadonlyArray<string>;
  readonly optional: ReadonlyArray<string>;
  readonly extra: ReadonlyArray<string>;
}

/**
 * Checks that all required keys from template exist in current env.
 *
 * A key in the template is considered optional when its value contains
 * the comment `# optional` on the line above it. We encode this by
 * convention: keys whose value is empty AND whose key appears in the
 * optional set are skipped.
 *
 * The caller is responsible for parsing the optional keys from comments
 * and passing them via `optionalKeys`.
 */
export function checkEnv(
  options: CheckOptions,
  optionalKeys: ReadonlySet<string> = new Set(),
  strict = false,
): CheckResult {
  const missing: string[] = [];
  const present: string[] = [];
  const optional: string[] = [];
  const extra: string[] = [];

  for (const key of options.template.keys()) {
    if (optionalKeys.has(key)) {
      optional.push(key);
      continue;
    }

    const value = options.current.get(key);
    if (value !== undefined && value !== '') {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  if (strict) {
    for (const key of options.current.keys()) {
      if (!options.template.has(key) && !optionalKeys.has(key)) {
        extra.push(key);
      }
    }
  }

  return {
    ok: missing.length === 0 && extra.length === 0,
    missing: missing.sort(),
    present: present.sort(),
    optional: optional.sort(),
    extra: extra.sort(),
  };
}
