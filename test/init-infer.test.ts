import { describe, it, expect } from 'vitest';
import { generateSchema } from '../src/core/init.js';

describe('generateSchema — type inference', () => {
  it('infers boolean from true/false/0/1', () => {
    const schema = generateSchema(
      new Map([
        ['DEBUG', 'true'],
        ['VERBOSE', 'false'],
        ['FLAG', '1'],
        ['OFF', '0'],
      ]),
    );
    expect(schema.DEBUG!.type).toBe('boolean');
    expect(schema.VERBOSE!.type).toBe('boolean');
    expect(schema.FLAG!.type).toBe('boolean');
    expect(schema.OFF!.type).toBe('boolean');
  });

  it('infers port for integers in 1–65535 range', () => {
    const schema = generateSchema(
      new Map([
        ['PORT', '3000'],
        ['HTTPS_PORT', '443'],
      ]),
    );
    expect(schema.PORT!.type).toBe('port');
    expect(schema.HTTPS_PORT!.type).toBe('port');
  });

  it('infers number for non-port numeric values', () => {
    const schema = generateSchema(
      new Map([
        ['MAX_RETRIES', '99999'],
        ['RATIO', '3.14'],
      ]),
    );
    expect(schema.MAX_RETRIES!.type).toBe('number');
    expect(schema.RATIO!.type).toBe('number');
  });

  it('infers url for http/postgres/redis/mongodb URLs', () => {
    const schema = generateSchema(
      new Map([
        ['API_URL', 'https://api.example.com'],
        ['DATABASE_URL', 'postgresql://user:pass@localhost:5432/db'],
        ['REDIS_URL', 'redis://localhost:6379'],
      ]),
    );
    expect(schema.API_URL!.type).toBe('url');
    expect(schema.DATABASE_URL!.type).toBe('url');
    expect(schema.REDIS_URL!.type).toBe('url');
  });

  it('infers email', () => {
    const schema = generateSchema(new Map([['ADMIN_EMAIL', 'admin@example.com']]));
    expect(schema.ADMIN_EMAIL!.type).toBe('email');
  });

  it('infers json for objects and arrays', () => {
    const schema = generateSchema(
      new Map([
        ['CONFIG', '{"key":"value"}'],
        ['LIST', '[1,2,3]'],
      ]),
    );
    expect(schema.CONFIG!.type).toBe('json');
    expect(schema.LIST!.type).toBe('json');
  });

  it('infers duration for time values', () => {
    const schema = generateSchema(
      new Map([
        ['TIMEOUT', '30s'],
        ['INTERVAL', '5m'],
        ['TTL', '100ms'],
      ]),
    );
    expect(schema.TIMEOUT!.type).toBe('duration');
    expect(schema.INTERVAL!.type).toBe('duration');
    expect(schema.TTL!.type).toBe('duration');
  });

  it('falls back to string for regular values', () => {
    const schema = generateSchema(
      new Map([
        ['APP_NAME', 'my-app'],
        ['REGION', 'us-east-1'],
        ['EMPTY', ''],
      ]),
    );
    expect(schema.APP_NAME!.type).toBe('string');
    expect(schema.REGION!.type).toBe('string');
    expect(schema.EMPTY!.type).toBe('string');
  });

  it('marks all keys as required', () => {
    const schema = generateSchema(
      new Map([
        ['A', 'true'],
        ['B', '3000'],
        ['C', 'hello'],
      ]),
    );
    for (const field of Object.values(schema)) {
      expect(field.required).toBe(true);
    }
  });
});
