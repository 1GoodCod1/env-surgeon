import { handleFatal } from './fatal.js';

export async function runAction(fn: () => Promise<number>): Promise<void> {
  try {
    const code = await fn();
    process.exit(code);
  } catch (err) {
    handleFatal(err);
  }
}
