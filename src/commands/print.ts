import { readEnvCascade } from '../utils/errors.js';
import { maskValue } from '../utils/mask.js';
import type { OutputFormat } from '../utils/output.js';

export interface PrintCommandOptions {
  readonly env: ReadonlyArray<string>;
  readonly expand?: boolean;
  readonly reveal?: boolean;
  readonly useProcessEnv?: boolean;
  readonly format: OutputFormat;
  readonly silent: boolean;
}

/**
 * Prints the effective merged env (useful for debugging cascades).
 * Values are masked by default — pass `--reveal` explicitly to see them.
 */
export async function runPrint(options: PrintCommandOptions): Promise<number> {
  const merged = await readEnvCascade(options.env, options.expand === true, {
    useProcessEnv: options.useProcessEnv !== false,
  });
  const entries = Array.from(merged.entries()).sort(([a], [b]) => a.localeCompare(b));

  if (options.silent) return 0;

  const reveal = options.reveal === true;
  const render = (v: string): string => (reveal ? v : maskValue(v));

  if (options.format === 'json') {
    const obj: Record<string, string> = {};
    for (const [k, v] of entries) obj[k] = render(v);
    console.log(JSON.stringify(obj, null, 2));
    return 0;
  }

  for (const [k, v] of entries) {
    console.log(`${k}=${render(v)}`);
  }
  return 0;
}
