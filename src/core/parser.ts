import { readFile, stat } from 'node:fs/promises';

export type EnvMap = ReadonlyMap<string, string>;

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ParserOptions {
  readonly path: string;
  /** Max file size in bytes. Default 10 MB. */
  readonly maxBytes?: number;
  /**
   * If true, expands `$VAR` and `${VAR}` references inside unquoted and
   * double-quoted values (same semantics as `dotenv-expand`, which
   * `@nestjs/config` uses by default). Single-quoted values are NEVER
   * expanded. Use `\$` to emit a literal `$`.
   *
   * Off by default to keep behavior transparent — turn it on when you
   * want parity with what your Node/NestJS app will see at runtime.
   */
  readonly expand?: boolean;
}

export interface ParseStringOptions {
  readonly expand?: boolean;
}
/**
 * Parses a .env file into an immutable key→value map.
 *
 * Supports:
 *   - `#` comments (full-line and trailing on unquoted values)
 *   - Single- and double-quoted values, including multi-line
 *   - Backslash escapes inside double-quoted values: `\n \r \t \\ \" \'`
 *   - `export KEY=value` (POSIX shell style)
 *
 * Does NOT mutate `process.env`. Does NOT perform variable interpolation
 * (intentional — interpolation changes semantics between dotenv loaders and
 * we only need comparison, not runtime loading).
 */

export async function parseEnvFile(options: ParserOptions): Promise<EnvMap> {
  const { path, maxBytes = DEFAULT_MAX_BYTES, expand = false } = options;
  /* Finds out the file size before reading. */
  const info = await stat(path);
  if (info.size > maxBytes) {
    throw new Error(`.env file is too large: ${path} ${info.size} bytes, limit ${maxBytes}`);
  }
  const raw = await readFile(path, 'utf-8');
  return parseEnvString(raw, { expand });
}

/** 
 * Shared across calls; we reset lastIndex before each use.
 * Structure: optional `export`, KEY, `=`, VALUE where VALUE is either
   - double-quoted (supporting escapes + newlines),
   - single-quoted (literal, supporting newlines),
   - or unquoted up to end-of-line / `#` comment.
 * `[ \t]*` after `=` (not `\s*`) — `\s` would eat the newline
 * terminator for empty values like `FOO=\nBAR=...`.
*/
const LINE_RE =
  /(?:^|\n)[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(?:"((?:\\.|[^"\\])*)"|'((?:[^'])*)'|([^\n#]*?))[ \t]*(?:#[^\n]*)?(?=\n|$)/g;

export function parseEnvString(raw: string, options: ParseStringOptions = {}): EnvMap {
  const result = new Map<string, string>();
  const expandable: Array<{ key: string; quoted: boolean }> = [];
  const normalized = raw.replace(/\r\n/g, '\n');

  LINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINE_RE.exec(normalized)) !== null) {
    const [, key, double, single, bare] = match;
    if (key === undefined) continue;

    let value: string;
    let quoted = false;
    if (double !== undefined) {
      value = undescapeDoubleQuoted(double);
      quoted = true;
    } else if (single !== undefined) {
      // SingeQ are literal -> never expand
      result.set(key, single);
      continue;
    } else {
      value = (bare ?? '').trim();
    }

    result.set(key, value);
    if (options.expand === true) expandable.push({ key, quoted });
  }

  if (options.expand === true) {
    const expandableKeys = new Set(expandable.map((e) => e.key));
    for (const key of expandableKeys) {
      result.set(key, resolveVar(key, result, expandableKeys, new Set()));
    }
  }

  return result;
}

// Matches `$VAR`, `${VAR}`, or `\$` escape. Bounded identifier length to avoid pathological inputs.
const VAR_RE = /\\\$|\$\{([A-Za-z_][A-Za-z0-9_]{0,127})\}|\$([A-Za-z_][A-Za-z0-9_]{0,127})/g;
const MAX_EXPAND_DEPTH = 16;

export interface ExpandOptions {
  /** When false, `${UNKNOWN}` resolves to '' instead of falling back to process.env. Default true. */
  readonly useProcessEnv?: boolean;
}

/**
 * Expands `${VAR}` references inside an already-parsed env map in place
 * (returns a new map). Used by the cascade merger — avoids re-serializing
 * through text, which corrupts values containing raw `\r`, `\0`, or escape
 * sequences.
 */
export function expandEnvMap(
  source: ReadonlyMap<string, string>,
  opts: ExpandOptions = {},
): EnvMap {
  const useProcessEnv = opts.useProcessEnv !== false;
  const out = new Map(source);
  const keys = new Set(out.keys());
  for (const key of keys) {
    out.set(key, resolveVar(key, out, keys, new Set(), 0, useProcessEnv));
  }
  return out;
}

/**
 * Resolves `${VAR}` references iteratively (dotenv-expand semantics).
 * Cycles (`A=${B}`, `B=${A}`) are broken at detection — the cycling var
 * expands to empty string rather than hanging. Depth is capped as a
 * final safety net against pathological chains.
 */

function resolveVar(
  name: string,
  env: Map<string, string>,
  expandable: ReadonlySet<string>,
  visiting: Set<string>,
  depth = 0,
  useProcessEnv = true,
): string {
  if (depth > MAX_EXPAND_DEPTH) return env.get(name) ?? '';
  if (visiting.has(name)) return '';
  const raw = env.get(name);
  if (raw === undefined) return useProcessEnv ? (process.env[name] ?? '') : '';

  visiting.add(name);
  const resolved = raw.replace(VAR_RE, (whole, braced?: string, bare?: string) => {
    if (whole === '\\$') return '$';
    const ref = braced ?? bare;
    if (ref === undefined) return whole;
    if (expandable.has(ref)) {
      return resolveVar(ref, env, expandable, visiting, depth + 1, useProcessEnv);
    }
    const fromFile = env.get(ref);
    if (fromFile !== undefined) return fromFile;
    return useProcessEnv ? (process.env[ref] ?? '') : '';
  });
  visiting.delete(name);
  env.set(name, resolved);

  return resolved;
}

function undescapeDoubleQuoted(value: string): string {
  return value.replace(/\\(.)/g, (_, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '\\':
        return '\\';
      case '"':
        return '"';
      case "'":
        return "'";
      default:
        return ch;
    }
  });
}
