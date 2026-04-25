import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { runDiff } from '../commands/diff.js';
import { runScan } from '../commands/scan.js';
import { runCheck } from '../commands/check.js';
import { runValidate } from '../commands/validate.js';
import { runInit } from '../commands/init.js';
import { runPrint } from '../commands/print.js';
import { runUnused } from '../commands/unused.js';
import type { EnvSurgeonConfig } from '../utils/config.js';
import { mergeConfig } from '../utils/config.js';
import { resolveAutoEnv } from './auto-env.js';
import { EXIT_USAGE } from './exits.js';
import {
  asStringArray,
  cfgString,
  collect,
  flagOn,
  getFormat,
  resolveEnvPaths,
} from './helpers.js';
import { runAction } from './run-action.js';

export function registerCommands(program: Command, config: EnvSurgeonConfig): void {
  program
    .command('diff <left> <right>')
    .description('Compare two .env files and show missing, extra and different keys')
    .option(
      '--expand',
      'Expand ${VAR} references (dotenv-expand / NestJS @nestjs/config semantics)',
    )
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output, use exit code only')
    .action(
      async (
        left: string,
        right: string,
        options: { expand?: boolean; json?: boolean; silent?: boolean },
      ) => {
        const cfg = mergeConfig(config, 'diff');
        await runAction(() =>
          runDiff(resolve(left), resolve(right), {
            expand: flagOn(options.expand, cfg.expand),
            format: getFormat(options),
            silent: options.silent === true,
          }),
        );
      },
    );

  program
    .command('scan <dir>')
    .description(
      'Scan source files for process.env / import.meta.env usage and generate .env.example',
    )
    .option('--output <path>', 'Write result to file (e.g. .env.example)')
    .option(
      '--ignore <pattern>',
      'Extra glob pattern to ignore (repeatable, e.g. --ignore "**/vendor/**")',
      collect,
      [],
    )
    .option('--respect-gitignore', 'Also exclude files matched by .gitignore')
    .option(
      '--check-secrets <envPath>',
      'Also scan given .env file for likely-leaked secrets; fails if any found',
    )
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output, use exit code only')
    .action(
      async (
        dir: string,
        options: {
          output?: string;
          ignore: string[];
          respectGitignore?: boolean;
          checkSecrets?: string;
          json?: boolean;
          silent?: boolean;
        },
      ) => {
        const cfg = mergeConfig(config, 'scan');
        const outputPath = options.output ?? cfgString(cfg, 'output');
        const cfgIgnore = asStringArray(cfg.ignore) ?? [];
        const ignorePatterns = [...options.ignore, ...cfgIgnore];
        const scanOptions = {
          ...(outputPath !== undefined ? { output: resolve(outputPath) } : {}),
          ...(options.checkSecrets !== undefined ? { checkSecrets: options.checkSecrets } : {}),
          ...(ignorePatterns.length > 0 ? { ignore: ignorePatterns } : {}),
          respectGitignore: flagOn(options.respectGitignore, cfg.respectGitignore),
          format: getFormat(options),
          silent: options.silent === true,
        };
        await runAction(() => runScan(resolve(dir), scanOptions));
      },
    );

  program
    .command('check')
    .description('Check that all required variables from template exist in current env')
    .option(
      '--env <path>',
      'Path to .env file; repeatable for cascade. `-` reads stdin.',
      collect,
      [],
    )
    .option(
      '--auto-env',
      'Auto-select .env files by NODE_ENV (.env.${NODE_ENV}.local → .env.local → .env.${NODE_ENV} → .env)',
    )
    .option('--template <path>', 'Path to template file')
    .option('--strict', 'Fail if .env contains keys not present in template')
    .option('--expand', 'Expand ${VAR} references (dotenv-expand semantics)')
    .option('--fix <path>', 'Append any missing keys (as `KEY=`) to this file instead of failing')
    .option('--reporter <format>', 'Output format: text, json, junit (default: text)')
    .option('--watch', 'Re-run on file changes')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output, use exit code only')
    .action(
      async (options: {
        env: string[];
        autoEnv?: boolean;
        template?: string;
        strict?: boolean;
        expand?: boolean;
        fix?: string;
        reporter?: string;
        watch?: boolean;
        json?: boolean;
        silent?: boolean;
      }) => {
        const cfg = mergeConfig(config, 'check');
        const envPaths =
          resolveEnvPaths(options.env) ??
          resolveEnvPaths(asStringArray(cfg.env)) ??
          (flagOn(options.autoEnv, cfg.autoEnv) ? await resolveAutoEnv() : undefined);

        const template = options.template ?? cfgString(cfg, 'template') ?? '.env.example';

        const base = {
          template: resolve(template),
          strict: flagOn(options.strict, cfg.strict),
          expand: flagOn(options.expand, cfg.expand),
          ...(options.fix !== undefined ? { fix: resolve(options.fix) } : {}),
          format: getFormat(options),
          silent: options.silent === true,
        };
        const run = () => runCheck(envPaths !== undefined ? { ...base, env: envPaths } : base);

        if (options.watch === true) {
          const { watchAndRun } = await import('../utils/watch.js');
          await watchAndRun([...(envPaths ?? []), resolve(template)], run, { label: 'check' });
        } else {
          await runAction(run);
        }
      },
    );

  program
    .command('validate')
    .description('Validate .env values against a schema file (.json or .js)')
    .option(
      '--env <path>',
      'Path to .env file; repeatable for cascade. `-` reads stdin.',
      collect,
      [],
    )
    .option('--auto-env', 'Auto-select .env files by NODE_ENV')
    .option('--schema <path>', 'Path to schema file (.json or .js)')
    .option('--strict', 'Fail if .env contains keys not declared in schema')
    .option('--expand', 'Expand ${VAR} references')
    .option(
      '--no-process-env',
      'When expanding, do not fall back to process.env for unknown ${VAR} refs',
    )
    .option('--reporter <format>', 'Output format: text, json, junit (default: text)')
    .option('--watch', 'Re-run on file changes')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output, use exit code only')
    .action(
      async (options: {
        env: string[];
        autoEnv?: boolean;
        schema?: string;
        strict?: boolean;
        expand?: boolean;
        processEnv?: boolean;
        reporter?: string;
        watch?: boolean;
        json?: boolean;
        silent?: boolean;
      }) => {
        const cfg = mergeConfig(config, 'validate');
        const envPaths =
          resolveEnvPaths(options.env) ??
          resolveEnvPaths(asStringArray(cfg.env)) ??
          (flagOn(options.autoEnv, cfg.autoEnv) ? await resolveAutoEnv() : [resolve('.env')]);

        const schema = options.schema ?? cfgString(cfg, 'schema') ?? '.env.schema.json';

        const run = () =>
          runValidate({
            env: envPaths,
            schema: resolve(schema),
            strict: flagOn(options.strict, cfg.strict),
            expand: flagOn(options.expand, cfg.expand),
            useProcessEnv: options.processEnv !== false,
            format: getFormat(options),
            silent: options.silent === true,
          });

        if (options.watch === true) {
          const { watchAndRun } = await import('../utils/watch.js');
          await watchAndRun([...envPaths, resolve(schema)], run, { label: 'validate' });
        } else {
          await runAction(run);
        }
      },
    );

  program
    .command('print')
    .description('Print the effective merged env (values masked by default)')
    .option(
      '--env <path>',
      'Path to .env file; repeatable for cascade. `-` reads stdin.',
      collect,
      [],
    )
    .option('--auto-env', 'Auto-select .env files by NODE_ENV')
    .option('--expand', 'Expand ${VAR} references')
    .option(
      '--reveal',
      'Show actual values instead of masked placeholders (\u26A0 secrets in stdout)',
    )
    .option(
      '--no-process-env',
      'When expanding, do not fall back to process.env for unknown ${VAR} refs',
    )
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output, use exit code only')
    .action(
      async (options: {
        env: string[];
        autoEnv?: boolean;
        expand?: boolean;
        reveal?: boolean;
        processEnv?: boolean;
        json?: boolean;
        silent?: boolean;
      }) => {
        if (options.reveal === true && process.stdout.isTTY === true && options.silent !== true) {
          console.error(
            chalk.yellow(
              '\u26A0 --reveal is printing secret values to a terminal. Redirect output or rerun without --reveal to mask.',
            ),
          );
        }
        const envPaths =
          resolveEnvPaths(options.env) ??
          (options.autoEnv === true ? await resolveAutoEnv() : [resolve('.env')]);
        await runAction(() =>
          runPrint({
            env: envPaths,
            expand: options.expand === true,
            reveal: options.reveal === true,
            useProcessEnv: options.processEnv !== false,
            format: getFormat(options),
            silent: options.silent === true,
          }),
        );
      },
    );

  program
    .command('unused <dir>')
    .description('Report keys in .env that are not referenced by any source file')
    .option('--env <path>', '.env file to inspect', '.env')
    .option('--ignore <pattern>', 'Extra glob pattern to ignore (repeatable)', collect, [])
    .option('--respect-gitignore', 'Also exclude files matched by .gitignore')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output, use exit code only')
    .action(
      async (
        dir: string,
        options: {
          env: string;
          ignore: string[];
          respectGitignore?: boolean;
          json?: boolean;
          silent?: boolean;
        },
      ) => {
        await runAction(() =>
          runUnused({
            dir: resolve(dir),
            env: resolve(options.env),
            ...(options.ignore.length > 0 ? { ignore: options.ignore } : {}),
            respectGitignore: options.respectGitignore === true,
            format: getFormat(options),
            silent: options.silent === true,
          }),
        );
      },
    );

  program
    .command('init')
    .description('Generate a starter schema file from an existing .env')
    .option('--env <path>', 'Path to .env file to read keys from', '.env')
    .option('--output <path>', 'Output schema file path')
    .option('--format <format>', 'Schema format: json or js', 'json')
    .option('--force', 'Overwrite existing output file')
    .option('--silent', 'Suppress output')
    .action(
      async (options: {
        env: string;
        output?: string;
        format: string;
        force?: boolean;
        silent?: boolean;
      }) => {
        const cfg = mergeConfig(config, 'init');
        if (options.format !== 'json' && options.format !== 'js') {
          console.error(
            chalk.red(`error: --format must be "json" or "js", got "${options.format}"`),
          );
          process.exit(EXIT_USAGE);
        }
        const output = options.output ?? cfgString(cfg, 'output') ?? '.env.schema.json';
        await runAction(() =>
          runInit({
            env: resolve(options.env),
            output: resolve(output),
            format: options.format as 'json' | 'js',
            force: options.force === true,
            silent: options.silent === true,
          }),
        );
      },
    );
}
