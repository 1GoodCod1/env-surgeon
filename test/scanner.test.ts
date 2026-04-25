import { describe, it, expect } from 'vitest';
import { extractEnvVars } from '../src/core/scanner.js';

describe('extractEnvVars', () => {
  it('extracts process.env.VARIABLE syntax', () => {
    const result = extractEnvVars('const x = process.env.DATABASE_URL');
    expect(result.has('DATABASE_URL')).toBe(true);
  });

  it('extracts process.env["VARIABLE"] syntax', () => {
    const result = extractEnvVars('const x = process.env["PORT"]');
    expect(result.has('PORT')).toBe(true);
  });

  it("extracts process.env['VARIABLE'] syntax", () => {
    const result = extractEnvVars("const x = process.env['API_KEY']");
    expect(result.has('API_KEY')).toBe(true);
  });

  it('extracts multiple variables from one file', () => {
    const source = `
      const db = process.env.DATABASE_URL
      const port = process.env.PORT
      const key = process.env.API_KEY
    `;
    const result = extractEnvVars(source);
    expect(result.has('DATABASE_URL')).toBe(true);
    expect(result.has('PORT')).toBe(true);
    expect(result.has('API_KEY')).toBe(true);
  });

  it('deduplicates repeated variables', () => {
    const source = 'process.env.PORT; process.env.PORT; process.env.PORT';
    const result = extractEnvVars(source);
    expect(result.size).toBe(1);
  });

  it('accepts mixed-case env vars (Vite/custom conventions)', () => {
    const result = extractEnvVars('process.env.nodeEnv + import.meta.env.VITE_api_url');
    expect(result.has('nodeEnv')).toBe(true);
    expect(result.has('VITE_api_url')).toBe(true);
  });

  it('extracts import.meta.env.VARIABLE syntax (Vite)', () => {
    const result = extractEnvVars('const x = import.meta.env.VITE_API_URL');
    expect(result.has('VITE_API_URL')).toBe(true);
  });

  it('extracts Deno.env.get() syntax', () => {
    const result = extractEnvVars("const x = Deno.env.get('DATABASE_URL')");
    expect(result.has('DATABASE_URL')).toBe(true);
  });

  it('extracts mixed patterns from same file', () => {
    const source = `
      const a = process.env.PORT
      const b = import.meta.env.VITE_KEY
      const c = Deno.env.get('DENO_VAR')
    `;
    const result = extractEnvVars(source);
    expect(result.has('PORT')).toBe(true);
    expect(result.has('VITE_KEY')).toBe(true);
    expect(result.has('DENO_VAR')).toBe(true);
  });
});
