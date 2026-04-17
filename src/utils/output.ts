import chalk from 'chalk';
import type { DiffResult } from '../core/differ.js';

export type OutputFormat = 'text' | 'json' | 'junit';

export interface OutputOptions {
  readonly format: OutputFormat;
  readonly silent: boolean;
}

export function printDiff(
  result: DiffResult,
  leftPath: string,
  rightPath: string,
  opts: OutputOptions,
): void {
  if (opts.silent) return;

  if (opts.format === 'json') {
    // Never serialize raw left/right — CI logs are forever. Expose only that
    // the values differ + their masked sizes. Consumers who genuinely need
    // the values can read the two .env files directly.
    const safe = {
      ...result,
      different: result.different.map((e) => ({
        key: e.key,
        left: maskValue(e.left), //TODO: maskValue function
        right: maskValue(e.right), //TODO: maskValue function
      })),
    };
    console.log(JSON.stringify(safe, null, 2));
    return;
  }

  if (result.missing.length === 0 && result.extra.length === 0 && result.different.length === 0) {
    console.log(chalk.green('✓ No differences found'));
    return;
  }

  if (result.missing.length > 0) {
    console.log(chalk.red(`\nMissing in ${rightPath}:`));
    for (const key of result.missing) {
      console.log(chalk.red(`  ✗ ${key}`));
    }
  }

  if (result.extra.length > 0) {
    console.log(chalk.yellow(`\nExtra in ${rightPath} (not in ${leftPath}):`));
    for (const key of result.extra) {
      console.log(chalk.yellow(`  + ${key}`));
    }
  }

  if (result.different.length > 0) {
    console.log(chalk.cyan('\nDifferent values:'));
    for (const entry of result.different) {
      const masked = (v: string) => (v.length > 0 ? '***' : '(empty)');
      console.log(
        chalk.cyan(`  ~ ${entry.key}`) +
          chalk.gray(
            ` (${leftPath}: ${masked(entry.left)} | ${rightPath}: ${masked(entry.right)})`,
          ),
      );
    }
  }

  console.log('');
}

// TODO: CheckResult type, checkResultToJUnit function
export function printCheck(result: CheckResult, opts: OutputOptions): void {
  if (opts.silent) return;

  if (opts.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (opts.format === 'junit') {
    process.stdout.write(checkResultToJUnit(result));
    return;
  }

  for (const key of result.present) {
    console.log(chalk.green(`  ✓ ${key}`));
  }

  for (const key of result.optional) {
    console.log(chalk.gray(`  ○ ${key}`) + chalk.gray(' (optional)'));
  }

  for (const key of result.missing) {
    console.log(chalk.red(`  ✗ ${key}`) + chalk.red('  → MISSING'));
  }

  for (const key of result.extra) {
    console.log(chalk.yellow(`  + ${key}`) + chalk.yellow('  → NOT IN TEMPLATE'));
  }

  if (result.ok) {
    console.log(chalk.green('\n✓ All required variables are set\n'));
  } else {
    const parts: string[] = [];
    if (result.missing.length > 0) parts.push(`${result.missing.length} missing`);
    if (result.extra.length > 0) parts.push(`${result.extra.length} extra`);
    console.log(chalk.red(`\n${parts.join(', ')} variable(s)\n`));
  }
}

// TODO: ValidationResult type, validationResultToJUnit function
export function printValidation(result: ValidationResult, opts: OutputOptions): void {
  if (opts.silent) return;

  if (opts.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (opts.format === 'junit') {
    process.stdout.write(validationResultToJUnit(result));
    return;
  }

  for (const error of result.errors) {
    console.log(chalk.red(`  ✗ ${error.key}`) + chalk.gray(`  → ${error.error}`));
  }

  if (result.ok) {
    console.log(chalk.green('\n✓ Validation passed\n'));
  } else {
    console.log(chalk.red(`\n${result.errors.length} validation error(s)\n`));
  }
}

// TODO: ScanResult type, scanResultToJUnit function
export function printScan(result: ScanResult, opts: OutputOptions): void {
  if (opts.silent) return;

  if (opts.format === 'json') {
    console.log(JSON.stringify({ variables: result.variables, skipped: result.skipped }, null, 2));
    return;
  }

  for (const variable of result.variables) {
    const files = result.occurrences.get(variable) ?? [];
    console.log(
      chalk.cyan(`  ${variable}`) +
        chalk.gray(` (${files.length} file${files.length !== 1 ? 's' : ''})`),
    );
  }

  console.log(chalk.green(`\n✓ Found ${result.variables.length} unique variable(s)`));

  if (result.skipped.length > 0) {
    console.log(
      chalk.yellow(
        `⚠  ${result.skipped.length} file(s) skipped (too large or unreadable) — use --json to see the list`,
      ),
    );
  }
  console.log('');
}
