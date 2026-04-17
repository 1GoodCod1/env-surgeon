import { readFile, stat } from 'node:fs/promises';
import { isNodeError } from './node-error.js';
import { UserError } from './user-error.js';

const DEFAULT_MAX_TEXT_BYTES = 10 * 1024 * 1024;

export async function readTextFile(
  path: string,
  maxBytes = DEFAULT_MAX_TEXT_BYTES,
): Promise<string> {
  try {
    const info = await stat(path);
    if (info.size > maxBytes) {
      throw new UserError(`File too large: ${path} (${info.size} bytes, limit ${maxBytes})`);
    }
    return await readFile(path, 'utf-8');
  } catch (err) {
    if (err instanceof UserError) throw err;
    if (isNodeError(err) && err.code === 'ENOENT') {
      throw new UserError(`File not found: ${path}`);
    }
    if (isNodeError(err) && err.code === 'EACCES') {
      throw new UserError(`Permission denied: ${path}`);
    }
    throw err;
  }
}
