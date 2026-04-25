import { describe, it, expect } from 'vitest';
import { checkEnv, parseOptionalKeys } from '../src/core/checker.js';
import { parseEnvString } from '../src/core/parser.js';

describe('checkEnv', () => {
  it('passes when all required keys are present', () => {
    const template = parseEnvString('FOO=\nBAR=');
    const current = parseEnvString('FOO=hello\nBAR=world');

    const result = checkEnv({ current, template });
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.present).toEqual(['BAR', 'FOO']);
  });

  it('reports missing keys', () => {
    const template = parseEnvString('FOO=\nBAR=');
    const current = parseEnvString('FOO=hello');

    const result = checkEnv({ current, template });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['BAR']);
  });

  it('treats empty value in current as missing', () => {
    const template = parseEnvString('FOO=');
    const current = parseEnvString('FOO=');

    const result = checkEnv({ current, template });
    expect(result.missing).toContain('FOO');
  });

  it('skips optional keys', () => {
    const template = parseEnvString('FOO=\nBAR=');
    const current = parseEnvString('FOO=hello');
    const optional = new Set(['BAR']);

    const result = checkEnv({ current, template }, optional);
    expect(result.ok).toBe(true);
    expect(result.optional).toContain('BAR');
  });

  it('reports extra keys in strict mode', () => {
    const template = parseEnvString('FOO=');
    const current = parseEnvString('FOO=hello\nSECRET_TOKEN=abc');

    const result = checkEnv({ current, template }, new Set(), true);
    expect(result.ok).toBe(false);
    expect(result.extra).toContain('SECRET_TOKEN');
  });

  it('passes in strict mode when no extra keys', () => {
    const template = parseEnvString('FOO=');
    const current = parseEnvString('FOO=hello');

    const result = checkEnv({ current, template }, new Set(), true);
    expect(result.ok).toBe(true);
    expect(result.extra).toHaveLength(0);
  });
});

describe('parseOptionalKeys', () => {
  it('parses # optional markers', () => {
    const raw = 'FOO=\n# optional\nBAR=\nBAZ=';
    const optional = parseOptionalKeys(raw);

    expect(optional.has('BAR')).toBe(true);
    expect(optional.has('FOO')).toBe(false);
    expect(optional.has('BAZ')).toBe(false);
  });

  it('handles file with no optional keys', () => {
    const optional = parseOptionalKeys('FOO=\nBAR=');
    expect(optional.size).toBe(0);
  });
});
