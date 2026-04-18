import { writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface WriteAtomicOptions {
  /**
   * POSIX permission bits for the final file. Pass `0o600` for secret-ish
   * output (schemas may name secret keys, `.env` copies may contain values).
   * Ignored silently on filesystems that don't honor it.
   */
  readonly mode?: number;
}

/**
 * Writes a file atomically: write to a sibling temp file, then rename.
 * Prevents readers from observing a half-written file if the process
 * crashes or is killed mid-write.
 *
 * Note: `rename` is atomic only within a single filesystem. The temp
 * file lives next to the target, so same-FS is guaranteed.
 */
export async function writeFileAtomic(
  path: string,
  data: string,
  options: WriteAtomicOptions = {},
): Promise<void> {
  const dir = dirname(path);
  const suffix = randomBytes(6).toString('hex');
  const tmp = join(dir, `.${basename(path)}.${suffix}.tmp`);
  try {
    // Apply mode on the temp file BEFORE rename — otherwise there's a short
    // window where the final path exists with default 0644 before we chmod.
    const writeOpts =
      options.mode !== undefined
        ? { encoding: 'utf-8' as const, mode: options.mode }
        : { encoding: 'utf-8' as const };
    await writeFile(tmp, data, writeOpts);
    if (options.mode !== undefined) {
      await chmod(tmp, options.mode).catch(() => undefined);
    }
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}
