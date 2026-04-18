import { diffEnvMaps, hasDifferences } from '../core/differ.js';
import { printDiff } from '../utils/output.js';
import { readEnvFile } from '../utils/errors.js';
import type { OutputFormat } from '../utils/output.js';

export interface DiffCommandOptions {
  readonly expand?: boolean;
  readonly format: OutputFormat;
  readonly silent: boolean;
}

export async function runDiff(
  leftPath: string,
  rightPath: string,
  options: DiffCommandOptions,
): Promise<number> {
  const expand = options.expand === true;
  const [left, right] = await Promise.all([
    readEnvFile(leftPath, expand),
    readEnvFile(rightPath, expand),
  ]);

  const result = diffEnvMaps(left, right);

  printDiff(result, leftPath, rightPath, options);

  return hasDifferences(result) ? 1 : 0;
}
