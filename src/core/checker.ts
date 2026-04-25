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

/**
 * Parses optional key markers from raw .env.example content.
 * A key is optional when preceded by a line: `# optional`
 *
 * @example
 * # optional
 * SENTRY_DSN=
 */
export function parseOptionalKeys(raw: string): ReadonlySet<string> {
  const lines = raw.split('\n');
  const optionalKeys = new Set<string>();
  const INLINE_RE = /#\s*optional\b/i;

  // Next line after `# optional` must be the assignment (not blank, not a
  // full-line # comment). Otherwise the marker does not apply to a later
  // `KEY=` line. `export KEY=` is supported.
  const ASSIGN_AFTER_OPTIONAL = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    const nextRaw = lines[i + 1] ?? '';
    const nextTrim = nextRaw.trim();

    // Marker line above the key: `# optional\nKEY=` (next line is the only candidate)
    if (/^#\s*optional\s*$/i.test(line)) {
      if (nextTrim === '' || nextTrim.startsWith('#')) {
        continue;
      }
      const m = ASSIGN_AFTER_OPTIONAL.exec(nextRaw);
      if (m !== null && m[1] !== undefined) {
        optionalKeys.add(m[1]);
      }
    }

    // Inline marker: `KEY=   # optional` on the same line.
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=[^#]*(#.*)?$/.exec(line);
    if (match !== null) {
      const comment = match[2] ?? '';
      if (INLINE_RE.test(comment)) {
        const key = match[1];
        if (key !== undefined) optionalKeys.add(key);
      }
    }
  }

  return optionalKeys;
}
