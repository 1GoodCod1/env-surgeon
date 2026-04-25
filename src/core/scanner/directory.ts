import { readFile, stat } from 'node:fs/promises';
import { DEFAULT_EXTENSIONS, DEFAULT_MAX_FILE_BYTES, SCAN_BATCH_SIZE } from './constants.js';
import { extractEnvVars } from './extract.js';
import type { ScanOptions, ScanResult } from './types.js';

function toUnixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

async function processInBatches<T>(
  items: ReadonlyArray<string>,
  batchSize: number,
  fn: (item: string) => Promise<T>,
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
  readonly vars: ReadonlySet<string> | null;
}

async function scanFile(file: string, maxBytes: number): Promise<FileScan> {
  try {
    const info = await stat(file);
    if (info.size > maxBytes) {
      return { file, vars: null };
    }
    const source = await readFile(file, 'utf-8');
    return { file, vars: extractEnvVars(source) };
  } catch {
    return { file, vars: null };
  }
}

/**
 * Scans source files for env variable usage.
 * Supports: process.env.X, process.env['X'], import.meta.env.X, Deno.env.get('X')
 *
 * Does NOT follow symlinks — a symlink pointing outside the project could
 * be used to exfiltrate secrets on CI. Files exceeding `maxFileBytes` are skipped.
 */
export async function scanDirectory(options: ScanOptions): Promise<ScanResult> {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const maxBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const pattern = `${toUnixPath(options.dir)}/**/*.{${extensions.join(',')}}`;

  // Lazy import — `fast-glob` pulls ~30 transitive modules and adds ~40 ms
  // to CLI startup. Only the `scan` command needs it, so keep it out of
  // the hot path for `check` / `validate` / `diff` (prestart hooks).
  const { default: fg } = await import('fast-glob');
  const ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/coverage/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.svelte-kit/**',
    '**/.astro/**',
    '**/.turbo/**',
    '**/.cache/**',
    '**/.vercel/**',
    '**/.output/**',
    '**/.git/**',
    ...(options.ignore ?? []),
  ];
  const files = await fg(pattern, {
    ignore: ignorePatterns,
    absolute: true,
    followSymbolicLinks: false,
    dot: false,
    ...(options.respectGitignore === true ? { ignoreFiles: ['.gitignore'] } : {}),
  });

  // Sort input before scanning so glob's filesystem-dependent ordering
  // doesn't leak into output. Matters for deterministic JSON / snapshot tests.
  const sortedFiles = [...files].sort();
  const perFile = await processInBatches(sortedFiles, SCAN_BATCH_SIZE, (f) =>
    scanFile(f, maxBytes),
  );

  const occurrences = new Map<string, string[]>();
  const skipped: string[] = [];

  for (const { file, vars } of perFile) {
    if (vars === null) {
      skipped.push(file);
      continue;
    }
    for (const varName of vars) {
      const existing = occurrences.get(varName);
      if (existing === undefined) {
        occurrences.set(varName, [file]);
      } else {
        existing.push(file);
      }
    }
  }

  for (const list of occurrences.values()) list.sort();
  skipped.sort();
  const variables = Array.from(occurrences.keys()).sort();

  return {
    variables,
    occurrences: occurrences as ReadonlyMap<string, ReadonlyArray<string>>,
    skipped,
  };
}
