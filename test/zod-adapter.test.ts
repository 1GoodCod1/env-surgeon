import { describe, it, expect } from 'vitest';
import { parseEnvString } from '../src/core/parser.js';
import { isZodSchema, validateWithZod, type ZodLike } from '../src/core/validator.js';

/**
 * Hand-rolled Zod look-alike so the test does not pull zod as a dep.
 * Mirrors the duck-typed shape used by {@link isZodSchema}.
 */
function stubZodObject(rules: Record<string, (v: string | undefined) => string | null>): ZodLike {
  return {
    _def: { typeName: 'ZodObject' },
    safeParse(input: unknown) {
      const issues: Array<{ path: string[]; message: string }> = [];
      const obj = (input ?? {}) as Record<string, string | undefined>;
      for (const [key, check] of Object.entries(rules)) {
        const err = check(obj[key]);
        if (err !== null) issues.push({ path: [key], message: err });
      }
      if (issues.length === 0) return { success: true, data: obj };
      return { success: false, error: { issues } };
    },
  };
}

describe('isZodSchema', () => {
  it('accepts objects with _def and safeParse', () => {
    expect(isZodSchema(stubZodObject({}))).toBe(true);
  });

  it('rejects plain objects', () => {
    expect(isZodSchema({ PORT: { type: 'number' } })).toBe(false);
  });

  it('rejects null and primitives', () => {
    expect(isZodSchema(null)).toBe(false);
    expect(isZodSchema(undefined)).toBe(false);
    expect(isZodSchema('PORT')).toBe(false);
  });
});

describe('validateWithZod', () => {
  const schema = stubZodObject({
    PORT: (v) => (v !== undefined && /^\d+$/.test(v) ? null : 'expected numeric string'),
    DATABASE_URL: (v) => {
      if (v === undefined || v === '') return 'required';
      try {
        new URL(v);
        return null;
      } catch {
        return 'expected URL';
      }
    },
  });

  it('passes a valid env', () => {
    const env = parseEnvString('PORT=3000\nDATABASE_URL=postgresql://localhost/db');
    const result = validateWithZod(env, schema);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('maps issues.path back to env keys', () => {
    const env = parseEnvString('PORT=abc\nDATABASE_URL=not-a-url');
    const result = validateWithZod(env, schema);
    expect(result.ok).toBe(false);
    const byKey = Object.fromEntries(result.errors.map((e) => [e.key, e.error]));
    expect(byKey.PORT).toBe('expected numeric string');
    expect(byKey.DATABASE_URL).toBe('expected URL');
  });

  it('reports missing required field', () => {
    const env = parseEnvString('PORT=3000');
    const result = validateWithZod(env, schema);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.key)).toContain('DATABASE_URL');
  });
});
