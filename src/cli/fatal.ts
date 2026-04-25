import chalk from 'chalk';
import { UserError } from '../utils/errors.js';
import { EXIT_INTERNAL, EXIT_USAGE } from './exits.js';

export function handleFatal(err: unknown): never {
  if (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: string }).code === 'string' &&
    (err as { code: string }).code.startsWith('commander.')
  ) {
    process.exit((err as { exitCode?: number }).exitCode ?? EXIT_USAGE);
  }
  if (err instanceof UserError) {
    console.error(chalk.red(`error: ${err.message}`));
    process.exit(EXIT_USAGE);
  }
  console.error(
    chalk.red('internal error:'),
    err instanceof Error ? (err.stack ?? err.message) : String(err),
  );
  process.exit(EXIT_INTERNAL);
}
