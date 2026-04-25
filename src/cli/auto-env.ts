import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultEnvCascade } from '../utils/errors.js';

/**
 * Resolves `--auto-env` to real paths. If nothing exists on disk,
 * prints a stderr warning so a silent CI step doesn't validate against
 * a non-existent env.
 */
export async function resolveAutoEnv(): Promise<string[]> {
  const cascade = defaultEnvCascade();
  const anyExists = cascade.some((f) => existsSync(resolve(f)));
  if (!anyExists) {
    const hint = process.env.NODE_ENV !== undefined ? ` (NODE_ENV=${process.env.NODE_ENV})` : '';
    console.error(
      chalk.yellow(
        `warning: --auto-env found no .env files${hint}; falling back to ${cascade[0] ?? '.env'}`,
      ),
    );
  }
  return cascade.map((p) => resolve(p));
}
