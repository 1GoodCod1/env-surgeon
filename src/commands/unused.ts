import { scanDirectory } from '../core/scanner.js';
import { parseEnvFile } from '../core/parser.js';
import type { OutputFormat } from '../utils/output.js';

export interface UnusedCommandOptions {
  readonly dir: string;
  readonly env: string;
  readonly ignore?: ReadonlyArray<string>;
  readonly respectGitignore?: boolean;
  readonly format: OutputFormat;
  readonly silent: boolean;
}

/**
 * Finds keys declared in `.env` but not referenced anywhere in the source.
 * Inverse of `scan`: catches dead config that builds up over time.
 */
export async function runUnused(options: UnusedCommandOptions): Promise<number> {
  const [scanResult, envMap] = await Promise.all([
    scanDirectory({
      dir: options.dir,
      respectGitignore: options.respectGitignore === true,
      ...(options.ignore !== undefined && options.ignore.length > 0
        ? { ignore: options.ignore }
        : {}),
    }),
    parseEnvFile({ path: options.env }),
  ]);

  const referenced = new Set(scanResult.variables);
  const unused = Array.from(envMap.keys())
    .filter((k) => !referenced.has(k))
    .sort();

  if (!options.silent) {
    if (options.format === 'json') {
      console.log(JSON.stringify({ unused }, null, 2));
    } else {
      const { default: chalk } = await import('chalk');
      if (unused.length === 0) {
        console.log(chalk.green('✓ No unused keys'));
      } else {
        console.log(chalk.yellow(`\n${unused.length} unused key(s) in ${options.env}:`));
        for (const key of unused) console.log(chalk.yellow(`  - ${key}`));
        console.log('');
      }
    }
  }

  return unused.length === 0 ? 0 : 1;
}
