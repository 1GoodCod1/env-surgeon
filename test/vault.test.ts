import { describe, it, expect } from 'vitest';
import { isVaultFile, decryptVault } from '../src/utils/vault.js';
import { createCipheriv, randomBytes } from 'node:crypto';

/** Helper: encrypt plain text with AES-256-GCM and return base64 payload */
function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, encrypted, tag]).toString('base64');
}

const TEST_KEY_HEX = 'a'.repeat(64); // 32 bytes of 0xAA

describe('isVaultFile', () => {
  it('returns true for vault format', () => {
    const content = ['#/---.env.vault---/', 'DOTENV_VAULT_DEVELOPMENT="abc123"'].join('\n');
    expect(isVaultFile(content)).toBe(true);
  });

  it('returns false for regular .env', () => {
    expect(isVaultFile('FOO=bar\nBAZ=1')).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(isVaultFile('')).toBe(false);
  });
});

describe('decryptVault', () => {
  it('decrypts a valid vault payload', () => {
    const plaintext = 'FOO=bar\nBAZ=42\n';
    const encrypted = encrypt(plaintext, TEST_KEY_HEX);
    const vaultContent = `DOTENV_VAULT_DEVELOPMENT="${encrypted}"`;
    const dotenvKey = `dotenv://:key_${TEST_KEY_HEX}@dotenv.org/vault/.env.vault?environment=development`;
    expect(decryptVault(vaultContent, dotenvKey)).toBe(plaintext);
  });

  it('selects correct environment from vault', () => {
    const devPlain = 'MODE=development';
    const prodPlain = 'MODE=production';
    const devEnc = encrypt(devPlain, TEST_KEY_HEX);
    const prodEnc = encrypt(prodPlain, TEST_KEY_HEX);

    const vaultContent = [
      `DOTENV_VAULT_DEVELOPMENT="${devEnc}"`,
      `DOTENV_VAULT_PRODUCTION="${prodEnc}"`,
    ].join('\n');

    const devKey = `dotenv://:key_${TEST_KEY_HEX}@dotenv.org/vault/.env.vault?environment=development`;
    expect(decryptVault(vaultContent, devKey)).toBe(devPlain);

    const prodKey = `dotenv://:key_${TEST_KEY_HEX}@dotenv.org/vault/.env.vault?environment=production`;
    expect(decryptVault(vaultContent, prodKey)).toBe(prodPlain);
  });

  it('supports comma-separated keys (tries each)', () => {
    const plain = 'SECRET=value';
    const encrypted = encrypt(plain, TEST_KEY_HEX);
    const vaultContent = `DOTENV_VAULT_PRODUCTION="${encrypted}"`;

    const badKey =
      'dotenv://:key_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb@dotenv.org/vault/.env.vault?environment=production';
    const goodKey = `dotenv://:key_${TEST_KEY_HEX}@dotenv.org/vault/.env.vault?environment=production`;

    expect(decryptVault(vaultContent, `${badKey},${goodKey}`)).toBe(plain);
  });

  it('throws when environment not found in vault', () => {
    const vaultContent = 'DOTENV_VAULT_DEVELOPMENT="abc"';
    const key = `dotenv://:key_${TEST_KEY_HEX}@dotenv.org/vault/.env.vault?environment=staging`;
    expect(() => decryptVault(vaultContent, key)).toThrow(/DOTENV_VAULT_STAGING/);
  });

  it('throws for invalid DOTENV_KEY format', () => {
    expect(() => decryptVault('DOTENV_VAULT_DEV="x"', 'not-a-uri')).toThrow(/Invalid DOTENV_KEY/);
  });

  it('throws when key is wrong length', () => {
    const encrypted = encrypt('X=1', TEST_KEY_HEX);
    const vaultContent = `DOTENV_VAULT_DEVELOPMENT="${encrypted}"`;
    const shortKey = 'dotenv://:key_abcd@dotenv.org/vault/.env.vault?environment=development';
    expect(() => decryptVault(vaultContent, shortKey)).toThrow(/32 bytes/);
  });
});
