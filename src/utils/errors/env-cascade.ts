import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnvMap } from '../../core/parser.js';
import { readEnvFile } from './env-read.js';

/**
 * Reads multiple env files and merges them with right-to-left precedence
 * (matching `@nestjs/config` and Next.js cascade semantics: earlier paths win).
 * Any path may be `-` to read from stdin.
 *
 * When `expand` is true, interpolation runs on the MERGED result — so
 * `${VAR}` in `.env.local` can reference a value declared in `.env`.
 * Expanding per-file would defeat the point of cascading.
 */
export async function readEnvCascade(
  paths: ReadonlyArray<string>,
  expand = false,
  opts: { readonly useProcessEnv?: boolean } = {},
): Promise<EnvMap> {
  // Parse each file WITHOUT expansion first — we need the literal values
  // so that cross-file references resolve correctly after merging.
  const maps = await Promise.all(paths.map((p) => readEnvFile(p, false)));
  const merged = new Map<string, string>();
  for (let i = maps.length - 1; i >= 0; i--) {
    const map = maps[i];
    if (map === undefined) continue;
    for (const [k, v] of map) merged.set(k, v);
  }

  if (!expand) return merged;

  // Directly expand on the merged map — previous implementation re-serialized
  // and re-parsed, which mangled values containing `\r`, `\0` or escape
  // sequences. See parser.ts for expansion semantics (cycles, depth cap).
  const { expandEnvMap } = await import('../../core/parser.js');
  return expandEnvMap(merged, { useProcessEnv: opts.useProcessEnv !== false });
}

/**
 * NODE_ENV-aware default selection (mirrors Next.js/dotenv-cli conventions):
 *   1. `.env.${NODE_ENV}.local` (if exists, never in test mode)
 *   2. `.env.local` (skipped when NODE_ENV=test — matches Next.js)
 *   3. `.env.${NODE_ENV}`
 *   4. `.env`
 * Returns the full cascade of files that actually exist, in precedence order.
 * If none exist, returns `['.env']` so the caller emits a clear "File not found".
 */
export function defaultEnvCascade(cwd: string = process.cwd()): string[] {
  const nodeEnv = process.env.NODE_ENV ?? '';
  const candidates: string[] = [];
  if (nodeEnv !== '' && nodeEnv !== 'test') {
    candidates.push(`.env.${nodeEnv}.local`);
  }
  if (nodeEnv !== 'test') candidates.push('.env.local');
  if (nodeEnv !== '') candidates.push(`.env.${nodeEnv}`);
  candidates.push('.env');

  const found = candidates.filter((f) => existsSync(resolve(cwd, f)));
  return found.length > 0 ? found : ['.env'];
}
