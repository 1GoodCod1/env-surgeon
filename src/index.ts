export type { EnvMap, ParserOptions } from './core/parser.js';
export { parseEnvString, parseEnvFile } from './core/parser.js';
export { diffEnvMaps, hasDifferences } from './core/differ.js';
export type { DiffResult, DiffEntry } from './core/differ.js';
export { readEnvCascade, defaultEnvCascade, UserError } from './utils/errors.js';

import { resolve } from 'node:path';
import { parseEnvString, parseEnvFile } from './core/parser.js';
import { diffEnvMaps } from './core/differ.js';
import { readEnvCascade, defaultEnvCascade } from './utils/errors.js';
import type { DiffResult } from './core/differ.js';

/** High-level API — thin wrappers for common use cases */

export async function diff(left: string, right: string): Promise<DiffResult> {
  const [leftEnv, rightEnv] = await Promise.all([
    parseEnvFile({ path: left }),
    parseEnvFile({ path: right }),
  ]);
  return diffEnvMaps(leftEnv, rightEnv);
}

export async function resolveEnvFile(
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
      defaultEnvCascade().map((path) => resolve(path)),
      expand,
    );
  }
  if (typeof env === 'string') {
    return parseEnvFile({ path: resolve(env), expand });
  }
  return readEnvCascade(
    env.map((path) => (path === '-' ? path : resolve(path))),
    expand,
  );
}
