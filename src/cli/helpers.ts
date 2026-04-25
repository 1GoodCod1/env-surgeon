import chalk from 'chalk';
import { resolve } from 'node:path';
import type { OutputFormat } from '../utils/output.js';
import { EXIT_USAGE } from './exits.js';

export function resolveEnvPaths(values: ReadonlyArray<string> | undefined): string[] | undefined {
  if (values === undefined || values.length === 0) return undefined;
  return values.map((v) => (v === '-' ? '-' : resolve(v)));
}

export function collect(value: string, previous: string[] = []): string[] {
  return previous.concat([value]);
}

export function asStringArray(v: unknown): string[] | undefined {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  return undefined;
}

/** `true` iff CLI flag is set OR config has the flag set. CLI always wins. */
export function flagOn(cliVal: boolean | undefined, cfgVal: unknown): boolean {
  return cliVal === true || cfgVal === true;
}

export function cfgString(cfg: Record<string, unknown>, key: string): string | undefined {
  const v = cfg[key];
  return typeof v === 'string' ? v : undefined;
}

const VALID_REPORTERS = new Set<OutputFormat>(['text', 'json', 'junit']);

export function getFormat(options: { json?: boolean; reporter?: string }): OutputFormat {
  if (options.reporter !== undefined) {
    if (!VALID_REPORTERS.has(options.reporter as OutputFormat)) {
      console.error(
        chalk.red(
          `error: --reporter must be one of: text, json, junit (got "${options.reporter}")`,
        ),
      );
      process.exit(EXIT_USAGE);
    }
    return options.reporter as OutputFormat;
  }
  return options.json === true ? 'json' : 'text';
}
