import { describe, it, expect } from 'vitest';
import { validateEnvMap } from '../src/core/validator.js';
import { parseEnvString } from '../src/core/parser.js';
import type { Schema } from '../src/core/validator.js';

const schema: Schema = {
  PORT: { type: 'number', required: true, min: 1024, max: 65535 },
  DATABASE_URL: { type: 'url', required: true },
  DEBUG: { type: 'boolean', required: false, default: 'false' },
  API_KEY: { type: 'string', required: true, pattern: '^[a-z0-9-]{8,}$' },
  LOG_LEVEL: { type: 'string', required: false, enum: ['debug', 'info', 'warn', 'error'] },
};

describe('validateEnvMap', () => {
  it('passes a valid env', () => {
    const env = parseEnvString(
      'PORT=3000\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=secret-key-12345',
    );
    const result = validateEnvMap(env, schema);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports missing required field', () => {
    const env = parseEnvString('PORT=3000\nDATABASE_URL=postgresql://localhost/db');
    const result = validateEnvMap(env, schema);
    const keys = result.errors.map((e) => e.key);
    expect(keys).toContain('API_KEY');
  });

  it('reports invalid number', () => {
    const env = parseEnvString(
      'PORT=abc\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=secret-key-12345',
    );
    const result = validateEnvMap(env, schema);
    const portError = result.errors.find((e) => e.key === 'PORT');
    expect(portError).toBeDefined();
    expect(portError?.error).toMatch(/expected number/);
  });

  it('reports number below min', () => {
    const env = parseEnvString(
      'PORT=80\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=secret-key-12345',
    );
    const result = validateEnvMap(env, schema);
    const portError = result.errors.find((e) => e.key === 'PORT');
    expect(portError?.error).toMatch(/>=/);
  });

  it('reports invalid URL', () => {
    const env = parseEnvString('PORT=3000\nDATABASE_URL=not-a-url\nAPI_KEY=secret-key-12345');
    const result = validateEnvMap(env, schema);
    const urlError = result.errors.find((e) => e.key === 'DATABASE_URL');
    expect(urlError?.error).toMatch(/URL/);
  });

  it('reports invalid boolean', () => {
    const env = parseEnvString(
      'PORT=3000\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=secret-key-12345\nDEBUG=yes',
    );
    const result = validateEnvMap(env, schema);
    const debugError = result.errors.find((e) => e.key === 'DEBUG');
    expect(debugError?.error).toMatch(/boolean/);
  });

  it('reports pattern mismatch', () => {
    const env = parseEnvString('PORT=3000\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=BAD');
    const result = validateEnvMap(env, schema);
    const keyError = result.errors.find((e) => e.key === 'API_KEY');
    expect(keyError?.error).toMatch(/pattern/);
  });

  it('reports enum violation', () => {
    const env = parseEnvString(
      'PORT=3000\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=secret-key-12345\nLOG_LEVEL=verbose',
    );
    const result = validateEnvMap(env, schema);
    const logError = result.errors.find((e) => e.key === 'LOG_LEVEL');
    expect(logError?.error).toMatch(/one of/);
  });

  it('uses default value when field is missing and not required', () => {
    const env = parseEnvString(
      'PORT=3000\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=secret-key-12345',
    );
    const result = validateEnvMap(env, schema);
    expect(result.errors.find((e) => e.key === 'DEBUG')).toBeUndefined();
  });

  it('masks secret values in error messages', () => {
    const env = parseEnvString(
      'PORT=abcdefghij\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=secret-key-12345',
    );
    const result = validateEnvMap(env, schema);
    const portError = result.errors.find((e) => e.key === 'PORT');
    expect(portError?.error).not.toContain('abcdefghij');
    expect(portError?.error).toMatch(/\*\*\*/);
  });

  it('rejects overly long regex patterns (ReDoS guard)', () => {
    const evilSchema: Schema = {
      X: { type: 'string', required: true, pattern: 'a'.repeat(600) },
    };
    const env = parseEnvString('X=hello');
    const result = validateEnvMap(env, evilSchema);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.error).toMatch(/ReDoS|limit/);
  });

  it('strict mode flags unknown keys', () => {
    const env = parseEnvString(
      'PORT=3000\nDATABASE_URL=postgresql://localhost/db\nAPI_KEY=secret-key-12345\nUNKNOWN=x',
    );
    const result = validateEnvMap(env, schema, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.key === 'UNKNOWN')).toBeDefined();
  });
});
