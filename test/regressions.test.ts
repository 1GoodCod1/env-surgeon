import { describe, it, expect } from 'vitest';
import { parseOptionalKeys } from '../src/core/checker.js';
import { parseEnvString, expandEnvMap } from '../src/core/parser.js';
import { isVaultFile } from '../src/utils/vault.js';

/**
 * Regression tests for bugs caught during the completeness audit.
 * Each case documents the bug so a future change doesn't silently revert it.
 */

describe('parseOptionalKeys — only real KEY= lines count after `# optional`', () => {
  it('ignores a blank line following the marker', () => {
    const keys = parseOptionalKeys('# optional\n\nFOO=bar\n');
    expect(keys.has('FOO')).toBe(false);
  });

  it('ignores a comment-only line following the marker', () => {
    const keys = parseOptionalKeys('# optional\n# some note\nFOO=bar\n');
    expect(keys.has('# optional')).toBe(false);
    expect(keys.has('# some note')).toBe(false);
    expect(keys.has('FOO')).toBe(false);
  });

  it('still catches the real `# optional\\nKEY=` form', () => {
    const keys = parseOptionalKeys('# optional\nSENTRY_DSN=\n');
    expect(keys.has('SENTRY_DSN')).toBe(true);
  });

  it('handles `export KEY=` after the marker', () => {
    const keys = parseOptionalKeys('# optional\nexport FEATURE_FLAG=\n');
    expect(keys.has('FEATURE_FLAG')).toBe(true);
  });
});

describe('expandEnvMap — cycle and depth safety', () => {
  it('breaks cycles without hanging', () => {
    const input = new Map([
      ['A', '${B}'],
      ['B', '${A}'],
    ]);
    const out = expandEnvMap(input, { useProcessEnv: false });
    expect(out.get('A')).toBe('');
    expect(out.get('B')).toBe('');
  });

  it('caps at MAX_EXPAND_DEPTH for long chains', () => {
    // Build A0=${A1}, A1=${A2}, … A40=terminal — longer than the 16 cap.
    const CHAIN = 40;
    const raw: string[] = [];
    for (let i = 0; i < CHAIN; i++) raw.push(`A${i}=\${A${i + 1}}`);
    raw.push(`A${CHAIN}=terminal`);
    const parsed = parseEnvString(raw.join('\n'));
    const out = expandEnvMap(parsed, { useProcessEnv: false });
    expect(out.has('A0')).toBe(true);
    expect(typeof out.get('A0')).toBe('string');
    expect(out.get(`A${CHAIN}`)).toBe('terminal');
  });

  it('resolves reasonable chains below the cap', () => {
    const parsed = parseEnvString('A=${B}\nB=${C}\nC=hello');
    const out = expandEnvMap(parsed, { useProcessEnv: false });
    expect(out.get('A')).toBe('hello');
  });
});

describe('isVaultFile', () => {
  it('detects a vault file past leading comments and blanks', () => {
    const content = '# comment\n\n  \nDOTENV_VAULT_PRODUCTION="base64payload=="\n';
    expect(isVaultFile(content)).toBe(true);
  });

  it('returns false for a normal .env', () => {
    expect(isVaultFile('PORT=3000\nDATABASE_URL=postgres://x\n')).toBe(false);
  });

  it('returns false for an empty / comment-only file', () => {
    expect(isVaultFile('')).toBe(false);
    expect(isVaultFile('# just comments\n# more comments\n')).toBe(false);
  });
});
