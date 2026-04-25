import { scanDirectory, generateExampleFile } from '../core/scanner.js';
import { printScan } from '../utils/output.js';
import { parseEnvFile } from '../core/parser.js';
import { scanMapForSecrets } from '../utils/secrets.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OutputFormat } from '../utils/output.js';

export interface ScanCommandOptions {
  readonly output?: string;
  readonly ignore?: ReadonlyArray<string>;
  readonly respectGitignore?: boolean;
  readonly format: OutputFormat;
  readonly silent: boolean;
  /** When set, also scans this .env file for likely-leaked secrets. */
  readonly checkSecrets?: string;
}

export async function runScan(dir: string, options: ScanCommandOptions): Promise<number> {
  const result = await scanDirectory({
    dir,
    respectGitignore: options.respectGitignore === true,
    ...(options.ignore !== undefined && options.ignore.length > 0
      ? { ignore: options.ignore }
      : {}),
  });

  printScan(result, options);

  if (options.output !== undefined) {
    await generateExampleFile(result.variables, options.output);

    if (!options.silent) {
      const { default: chalk } = await import('chalk');
      console.log(chalk.green(`✓ Written to ${options.output}\n`));
    }
  }

  if (options.checkSecrets !== undefined) {
    const path = resolve(options.checkSecrets);
    if (existsSync(path)) {
      const map = await parseEnvFile({ path });
      const hits = scanMapForSecrets(map);
      if (hits.length > 0) {
        if (!options.silent) {
          const { default: chalk } = await import('chalk');
          console.error(
            chalk.red(`\n⚠ ${hits.length} likely secret(s) in ${options.checkSecrets}:`),
          );
          for (const h of hits) console.error(chalk.red(`  ${h.key} → ${h.kind}`));
          console.error(
            chalk.gray(
              '  (these values look like real credentials; strip them from committed files)\n',
            ),
          );
        }
        return 1;
      }
    }
  }

  return 0;
}
