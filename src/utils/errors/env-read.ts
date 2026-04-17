import { readFile, stat } from 'node:fs/promises';
import type { EnvMap } from '../../core/parser.js';
import { parseEnvString } from '../../core/parser.js';
import { isVaultFile, decryptVault } from '../vault.js';
import { isNodeError } from './node-error.js';
import { UserError } from './user-error.js';

const STDIN_TOKEN = '-';
const STDIN_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Reads stdin to a string, with a byte cap. Throws `UserError` if stdin is a TTY
 * (nothing piped) so the user gets a clear message instead of hanging forever.
 */
async function readStdin(maxBytes: number): Promise<string> {
  if (process.stdin.isTTY) {
    throw new UserError(
      'Expected env content on stdin (use `-` to read from a pipe, e.g. `vault kv get ... | env-surgeon check --env -`)',
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buf = chunk instanceof Buffer ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > maxBytes) {
      throw new UserError(`stdin exceeds ${maxBytes} byte limit`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function readEnvFile(path: string, expand = false): Promise<EnvMap> {
  if (path === STDIN_TOKEN) {
    const raw = await readStdin(STDIN_MAX_BYTES);
    return parseEnvString(raw, { expand });
  }
  try {
    const info = await stat(path);
    if (info.size > STDIN_MAX_BYTES) {
      throw new UserError(`File too large: ${path} (${info.size} bytes, limit ${STDIN_MAX_BYTES})`);
    }
    const raw = await readFile(path, 'utf-8');

    if (isVaultFile(raw)) {
      const dotenvKey = process.env.DOTENV_KEY;
      if (!dotenvKey) {
        throw new UserError(
          `${path} appears to be a .env.vault file but DOTENV_KEY is not set.\n` +
            'Set DOTENV_KEY in your environment to decrypt.',
        );
      }
      const decrypted = decryptVault(raw, dotenvKey);
      return parseEnvString(decrypted, { expand });
    }

    return parseEnvString(raw, { expand });
  } catch (err) {
    if (err instanceof UserError) throw err;
    if (isNodeError(err) && err.code === 'ENOENT') {
      throw new UserError(`File not found: ${path}`);
    }
    if (isNodeError(err) && err.code === 'EACCES') {
      throw new UserError(`Permission denied: ${path}`);
    }
    if (err instanceof Error) throw new UserError(err.message);
    throw err;
  }
}
