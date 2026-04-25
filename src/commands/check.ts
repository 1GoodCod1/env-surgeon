import { parseEnvString } from '../core/parser.js';
import { checkEnv, parseOptionalKeys } from '../core/checker.js';
import { printCheck } from '../utils/output.js';
import { readEnvCascade, readTextFile } from '../utils/errors.js';
import { writeFileAtomic } from '../utils/atomic.js';
import { existsSync, readFileSync } from 'node:fs';
import type { OutputFormat } from '../utils/output.js';

export interface CheckCommandOptions {
  /**
   * Zero or more paths. When empty, falls back to `process.env`.
   * Multiple paths cascade (earlier paths win) — same semantics as
   * `@nestjs/config` `envFilePath: [...]` and Next.js `.env.*` chain.
   * The token `-` reads from stdin.
   */
  readonly env?: ReadonlyArray<string>;
  readonly template: string;
  readonly strict: boolean;
  readonly expand?: boolean;
  readonly format: OutputFormat;
  readonly silent: boolean;
  /**
   * When set, appends missing keys (as `KEY=`) to this file instead of
   * failing. Only writes — never overwrites existing values.
   */
  readonly fix?: string;
}

export async function runCheck(options: CheckCommandOptions): Promise<number> {
  const templateRaw = await readTextFile(options.template);
  const template = parseEnvString(templateRaw);
  const optionalKeys = parseOptionalKeys(templateRaw);

  const current =
    options.env !== undefined && options.env.length > 0
      ? await readEnvCascade(options.env, options.expand === true)
      : processEnvAsMap();

  const result = checkEnv({ current, template }, optionalKeys, options.strict);

  printCheck(result, options);

  if (options.fix !== undefined && result.missing.length > 0) {
    const existing = existsSync(options.fix) ? readFileSync(options.fix, 'utf-8') : '';
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    const added = result.missing.map((k) => `${k}=`).join('\n') + '\n';
    // 0600: we're writing into an env file that may accumulate secrets.
    await writeFileAtomic(options.fix, existing + sep + added, { mode: 0o600 });
    if (!options.silent) {
      const { default: chalk } = await import('chalk');
      console.log(chalk.green(`✓ Appended ${result.missing.length} key(s) to ${options.fix}\n`));
    }
    return 0;
  }

  return result.ok ? 0 : 1;
}

/**
 * npm/yarn/pnpm inject ~50 `npm_*` vars into the child process env.
 * Including them in a strict-mode check produces false-positive "extra key"
 * errors. We strip well-known tooling prefixes before comparing.
 */
const TOOLING_PREFIXES = ['npm_', 'NPM_', 'YARN_', 'PNPM_', 'BUN_', 'VOLTA_'];
const TOOLING_EXACT = new Set([
  'INIT_CWD',
  'NODE',
  'NODE_EXE',
  '_',
  'PWD',
  'SHLVL',
  'OLDPWD',
  'COLOR',
  'COLORTERM',
]);

function isToolingVar(key: string): boolean {
  if (TOOLING_EXACT.has(key)) return true;
  return TOOLING_PREFIXES.some((p) => key.startsWith(p));
}

function processEnvAsMap(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (isToolingVar(key)) continue;
    map.set(key, value);
  }

  return map;
}
