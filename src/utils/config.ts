import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UserError } from './errors.js';

/**
 * Config file values map 1:1 to CLI flags. Per-command keys override
 * the top-level shared section. CLI flags always win over the config file.
 */
export interface EnvSurgeonConfig {
  readonly env?: string | ReadonlyArray<string>;
  readonly template?: string;
  readonly schema?: string;
  readonly expand?: boolean;
  readonly strict?: boolean;
  readonly autoEnv?: boolean;
  readonly check?: Partial<Omit<EnvSurgeonConfig, 'check' | 'validate' | 'diff' | 'scan' | 'init'>>;
  readonly validate?: Partial<
    Omit<EnvSurgeonConfig, 'check' | 'validate' | 'diff' | 'scan' | 'init'>
  >;
  readonly diff?: Partial<Omit<EnvSurgeonConfig, 'check' | 'validate' | 'diff' | 'scan' | 'init'>>;
  readonly scan?: {
    readonly output?: string;
    readonly ignore?: ReadonlyArray<string>;
    readonly respectGitignore?: boolean;
  };
  readonly init?: { readonly output?: string; readonly format?: 'json' | 'js' };
}

const CONFIG_FILENAMES = [
  'env-surgeon.config.js',
  'env-surgeon.config.mjs',
  'env-surgeon.config.cjs',
  'env-surgeon.config.json',
  '.env-surgeonrc.json',
];

// Files that mark a project boundary. We stop walking up when we hit one of
// these — otherwise a hostile `env-surgeon.config.json` planted in `/tmp` or
// a user's home dir would be picked up by any `env-surgeon` invocation
// running somewhere below it.
const PROJECT_BOUNDARIES = ['package.json', '.git', 'pnpm-workspace.yaml', 'deno.json'];

/**
 * Walks up from `cwd` looking for a config file. Stops at the first match,
 * at a project boundary (package.json / .git / …) that doesn't also contain
 * a config, or at the filesystem root. Returns `null` when nothing is found.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<{
  path: string;
  config: EnvSurgeonConfig;
} | null> {
  let dir = resolve(cwd);
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate)) {
        return { path: candidate, config: await readConfig(candidate, cwd) };
      }
    }
    const hitBoundary = PROJECT_BOUNDARIES.some((marker) => existsSync(resolve(dir, marker)));
    if (hitBoundary) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function readConfig(path: string, cwd: string): Promise<EnvSurgeonConfig> {
  const ext = path.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      return validateConfigShape(parsed, path);
    } catch (err) {
      if (err instanceof UserError) throw err;
      throw new UserError(`Failed to parse config ${path}: ${(err as Error).message}`);
    }
  }

  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
    // Resolve symlinks before bounding: a symlink inside cwd pointing to
    // /tmp/evil.js would otherwise pass a string-only `relative()` check
    // and execute arbitrary code at startup.
    const realPath = safeRealpath(path);
    const realCwd = safeRealpath(resolve(cwd));
    const rel = relative(realCwd, realPath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new UserError(
        `Refusing to load JS config outside project root: ${path}\nMove it under ${cwd} or use JSON.`,
      );
    }
    const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
    const parsed = mod.default ?? mod;
    return validateConfigShape(parsed, path);
  }

  throw new UserError(`Unknown config extension: ${path}`);
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function isStringOrStringArray(v: unknown): boolean {
  return typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
}

const TOP_STRING_FIELDS = ['template', 'schema'] as const;
const TOP_BOOL_FIELDS = ['expand', 'strict', 'autoEnv'] as const;
const SUB_COMMANDS = ['check', 'validate', 'diff', 'scan', 'init'] as const;

function validateConfigShape(value: unknown, path: string): EnvSurgeonConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UserError(`Invalid config shape in ${path}: expected an object`);
  }
  const o = value as Record<string, unknown>;

  if (o.env !== undefined && !isStringOrStringArray(o.env)) {
    throw new UserError(`Invalid config in ${path}: "env" must be a string or array of strings`);
  }
  for (const f of TOP_STRING_FIELDS) {
    if (o[f] !== undefined && typeof o[f] !== 'string') {
      throw new UserError(`Invalid config in ${path}: "${f}" must be a string`);
    }
  }
  for (const f of TOP_BOOL_FIELDS) {
    if (o[f] !== undefined && typeof o[f] !== 'boolean') {
      throw new UserError(`Invalid config in ${path}: "${f}" must be a boolean`);
    }
  }
  for (const cmd of SUB_COMMANDS) {
    const sub = o[cmd];
    if (sub !== undefined && (typeof sub !== 'object' || sub === null || Array.isArray(sub))) {
      throw new UserError(`Invalid config in ${path}: "${cmd}" must be an object`);
    }
  }
  return value as EnvSurgeonConfig;
}

/**
 * Flattens top-level + per-command config into a single record. Per-command
 * keys take precedence. CLI flags still override this merged result.
 */
export function mergeConfig(
  base: EnvSurgeonConfig,
  command: 'check' | 'validate' | 'diff' | 'scan' | 'init',
): Record<string, unknown> {
  const { check, validate, diff, scan, init, ...shared } = base;
  const perCommand: Record<string, unknown> = { check, validate, diff, scan, init }[command] ?? {};
  return { ...shared, ...perCommand };
}
