import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSchema, validateEnvMap } from '../src/core/validator.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('validator security', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-surgeon-security-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects http:// URLs', async () => {
    await expect(loadSchema('http://evil.example.com/schema.js')).rejects.toThrow(/non-file URL/);
  });

  it('rejects https:// URLs', async () => {
    await expect(loadSchema('https://evil.example.com/schema.js')).rejects.toThrow(/non-file URL/);
  });

  it('rejects data: URLs', async () => {
    await expect(loadSchema('data:text/javascript,export default {}')).rejects.toThrow(
      /non-file URL/,
    );
  });

  it('rejects JS schema outside project root', async () => {
    const outsidePath = join(dir, '..', 'evil-schema.js');
    writeFileSync(outsidePath, 'export default { X: { type: "string" } }');
    try {
      await expect(loadSchema(outsidePath, { allowedRoot: dir })).rejects.toThrow(
        /outside project root/,
      );
    } finally {
      rmSync(outsidePath, { force: true });
    }
  });

  it('loads valid JSON schema from project root', async () => {
    const schemaPath = join(dir, 'schema.json');
    writeFileSync(schemaPath, JSON.stringify({ PORT: { type: 'number', required: true } }));
    const schema = await loadSchema(schemaPath, { allowedRoot: dir });
    expect(schema.PORT!.type).toBe('number');
  });

  it('rejects JSON with invalid schema shape', async () => {
    const schemaPath = join(dir, 'bad.json');
    writeFileSync(schemaPath, JSON.stringify({ PORT: { foo: 'bar' } }));
    await expect(loadSchema(schemaPath)).rejects.toThrow(/Invalid schema/);
  });

  it('rejects malformed JSON', async () => {
    const schemaPath = join(dir, 'broken.json');
    writeFileSync(schemaPath, '{not json');
    await expect(loadSchema(schemaPath)).rejects.toThrow(/Invalid JSON/);
  });

  it('caps pattern length to prevent ReDoS', () => {
    const longPattern = 'a'.repeat(600);
    const env = new Map([['KEY', 'test']]);
    const schema = { KEY: { type: 'string' as const, pattern: longPattern } };
    const result = validateEnvMap(env, schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.error).toMatch(/pattern exceeds/);
  });

  it('caps value length', () => {
    const longValue = 'x'.repeat(65 * 1024);
    const env = new Map([['KEY', longValue]]);
    const schema = { KEY: { type: 'string' as const, required: true } };
    const result = validateEnvMap(env, schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.error).toMatch(/byte limit/);
  });

  it('strict mode reports undeclared keys', () => {
    const env = new Map([
      ['PORT', '3000'],
      ['UNKNOWN', 'x'],
    ]);
    const schema = { PORT: { type: 'number' as const, required: true } };
    const result = validateEnvMap(env, schema, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.key === 'UNKNOWN')).toBe(true);
  });

  it('masks secret values in error messages', () => {
    const env = new Map([['PORT', 'not-a-number-at-all']]);
    const schema = { PORT: { type: 'number' as const, required: true } };
    const result = validateEnvMap(env, schema);
    expect(result.errors[0]!.error).not.toContain('not-a-number-at-all');
    expect(result.errors[0]!.error).toContain('***');
  });

  it('validates secret type with entropy check', () => {
    const env = new Map([['TOKEN', 'aaaa']]);
    const schema = { TOKEN: { type: 'secret' as const, required: true, min: 4, minEntropy: 3.0 } };
    const result = validateEnvMap(env, schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.error).toMatch(/entropy/);
  });

  it('validates array type with itemType', () => {
    const env = new Map([['PORTS', '80,443,abc']]);
    const schema = { PORTS: { type: 'array' as const, itemType: 'number' as const } };
    const result = validateEnvMap(env, schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.error).toMatch(/not a number/);
  });
});
