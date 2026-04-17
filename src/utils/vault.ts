import { createDecipheriv } from 'node:crypto';

/**
 * Returns true if the content looks like a .env.vault file.
 * Vault files contain `DOTENV_VAULT_<ENVIRONMENT>=` entries.
 */
export function isVaultFile(content: string): boolean {
  return /^DOTENV_VAULT_[A-Z_]+=/.test(content.replace(/^[#\s][^\n]*\n/gm, ''));
}

interface VaultKey {
  readonly environment: string;
  readonly key: string;
}

/**
 * Parses one or more DOTENV_KEY URIs (comma-separated).
 * Format: `dotenv://:key_<hex>@dotenv.org/vault/.env.vault?environment=<env>`
 */
function parseDotenvKeys(raw: string): VaultKey[] {
  return raw.split(',').map((part) => {
    const trimmed = part.trim();
    if (trimmed === '') throw new Error('Empty DOTENV_KEY segment');
    let uri: URL;
    try {
      uri = new URL(trimmed);
    } catch {
      throw new Error('Invalid DOTENV_KEY format: expected a dotenv:// URI');
    }
    const password = uri.password;
    if (!password) throw new Error('DOTENV_KEY URI is missing the key (password component)');
    const environment = uri.searchParams.get('environment');
    if (!environment) throw new Error('DOTENV_KEY URI is missing ?environment= parameter');
    const keyHex = password.startsWith('key_') ? password.slice(4) : password;
    return { environment, key: keyHex };
  });
}

/**
 * Parses vault entries from a .env.vault file.
 * Returns a map of environment name → encrypted payload (base64).
 */
function parseVaultEntries(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;
    const m = /^DOTENV_VAULT_([A-Z_]+)\s*=\s*"?([^"\s]*)"?\s*$/.exec(trimmed);
    if (m?.[1] !== undefined && m[2] !== undefined) {
      entries.set(m[1].toLowerCase(), m[2]);
    }
  }
  return entries;
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 * Layout: base64 → nonce (12 B) ‖ ciphertext ‖ auth tag (16 B).
 */
function decrypt(ciphertextB64: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(`Decryption key must be 32 bytes (got ${key.length}). Check your DOTENV_KEY.`);
  }
  const data = Buffer.from(ciphertextB64, 'base64');
  if (data.length < 28) {
    throw new Error('Encrypted payload too short (need at least 12-byte nonce + 16-byte tag)');
  }
  const nonce = data.subarray(0, 12);
  const tag = data.subarray(-16);
  const ciphertext = data.subarray(12, -16);

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}

/**
 * Decrypts a `.env.vault` file using one or more `DOTENV_KEY` values.
 * Returns the decrypted `.env` content as a raw string ready for parsing.
 *
 * Compatible with the vault format used by `dotenv` >= 16.3 and `dotenv-vault`.
 */
export function decryptVault(vaultContent: string, dotenvKey: string): string {
  const keys = parseDotenvKeys(dotenvKey);
  const entries = parseVaultEntries(vaultContent);

  const errors: string[] = [];
  for (const { environment, key } of keys) {
    const encrypted = entries.get(environment);
    if (encrypted === undefined) {
      errors.push(`no DOTENV_VAULT_${environment.toUpperCase()} entry in vault file`);
      continue;
    }
    try {
      return decrypt(encrypted, key);
    } catch (err) {
      errors.push(`${environment}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Failed to decrypt .env.vault:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
}
