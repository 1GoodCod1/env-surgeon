import { readFile, stat } from 'node:fs/promises';
import { DEFAULT_EXTENSIONS, DEFAULT_MAX_FILE_BYTES, SCAN_BATCH_SIZE } from './constants.js';
import { ScanOptions, ScanResult } from './types.js';
import { extractEnvVars } from './extract.js';

function toUnixPath(path: string): string {
  return path.replace(/\\/g, '/');
}

async function processInBatches<T>(
  items: ReadonlyArray<T>,
  batchSize: number,
  fn: (item: T) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

interface FileScan {
  readonly file: string;
  readonly variables: ReadonlySet<string> | null;
}

async function scanFile(file: string, maxBytes: number): Promise<FileScan> {
  try {
    const info = await stat(file);
    if (info.size > maxBytes) {
      return { file, variables: null };
    }
    const source = await readFile(file, 'utf-8');
    return { file, variables: extractEnvVars(source) };
  } catch {
    return { file, variables: null };
  }
}

/**
 * Scans source files for env variable usage.
 * Supports: process.env.X, process.env['X'], import.meta.env.X, Deno.env.get('X')
 *
 * Does NOT follow symlinks — a symlink pointing outside the project could
 * be used to exfiltrate secrets on CI. Files exceeding `maxFileBytes` are skipped.
 */

// TODO: Implement scanDirectory function
