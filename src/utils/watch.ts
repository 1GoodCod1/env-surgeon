import { watch as fsWatch, type FSWatcher, existsSync } from 'node:fs';

/**
 * Attaches a watcher to a single file, re-attaching on `rename` events so
 * editors and our own atomic writes (write-to-temp + rename) don't silently
 * stop notifications. Without this, `fs.watch` binds to an inode that dies
 * on atomic replace, and subsequent edits are never seen on Linux/macOS.
 */
function watchSingle(file: string, trigger: () => void): () => void {
  let watcher: FSWatcher | null = null;
  let closed = false;
  let reattachTimer: ReturnType<typeof setTimeout> | null = null;

  const attach = (): void => {
    if (closed || !existsSync(file)) return;
    try {
      watcher = fsWatch(file, (eventType) => {
        trigger();
        if (eventType === 'rename') {
          // Target was atomically replaced — old fd is stale. Re-attach after
          // a short delay so the new file is fully settled.
          watcher?.close();
          watcher = null;
          reattachTimer = setTimeout(attach, 50);
        }
      });
    } catch {
      // File may be on a filesystem that can't be watched (e.g. some network
      // mounts). We silently skip rather than crash — worst case the user
      // sees stale results and Ctrl-C's out.
    }
  };

  attach();
  return () => {
    closed = true;
    if (reattachTimer !== null) clearTimeout(reattachTimer);
    watcher?.close();
  };
}

/**
 * Watches a list of files and re-runs the callback on every change.
 * Never exits — callers should handle SIGINT if cleanup is needed.
 */
export async function watchAndRun(
  files: ReadonlyArray<string>,
  callback: () => Promise<number>,
  opts: { label?: string } = {},
): Promise<never> {
  const { default: chalk } = await import('chalk');
  const label = opts.label ?? 'check';
  const DEBOUNCE_MS = 300;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const closers: Array<() => void> = [];

  const run = async () => {
    if (running) return;
    running = true;
    try {
      console.log(chalk.gray(`\n[watch] Running ${label}...\n`));
      const code = await callback();
      console.log(
        chalk.gray(`\n[watch] ${code === 0 ? 'Passed' : 'Failed'} — watching for changes...\n`),
      );
    } catch (err) {
      console.error(
        chalk.red(`[watch] Error: ${err instanceof Error ? err.message : String(err)}`),
      );
    } finally {
      running = false;
    }
  };

  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), DEBOUNCE_MS);
  };

  for (const file of files) {
    closers.push(watchSingle(file, trigger));
  }

  process.on('SIGINT', () => {
    for (const close of closers) close();
    process.exit(0);
  });

  await run();

  return new Promise(() => {});
}
