import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultEnvCascade, readEnvCascade } from '../src/utils/errors';

describe('defaultEnvCascade', () => {
  let dir: string;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-surgeon-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns [".env"] when nothing exists', () => {
    process.env.NODE_ENV = 'production';
    expect(defaultEnvCascade(dir)).toEqual(['.env']);
  });

  it('orders by Next.js precedence when all files exist', () => {
    process.env.NODE_ENV = 'production';
    for (const f of ['.env', '.env.production', '.env.local', '.env.production.local']) {
      writeFileSync(join(dir, f), 'X=1');
    }
    expect(defaultEnvCascade(dir)).toEqual([
      '.env.production.local',
      '.env.local',
      '.env.production',
      '.env',
    ]);
  });

  it('skips .env.local when NODE_ENV=test (Next.js convention)', () => {
    process.env.NODE_ENV = 'test';
    for (const f of ['.env', '.env.test', '.env.local']) {
      writeFileSync(join(dir, f), 'X=1');
    }
    const result = defaultEnvCascade(dir);
    expect(result).not.toContain('.env.local');
    expect(result).toContain('.env.test');
    expect(result).toContain('.env');
  });
});

describe('readEnvCascade', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-surgeon-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('earlier files override later ones', async () => {
    writeFileSync(join(dir, '.env'), 'FOO=base\nBAR=base');
    writeFileSync(join(dir, '.env.local'), 'FOO=override');
    const merged = await readEnvCascade([join(dir, '.env.local'), join(dir, '.env')]);
    expect(merged.get('FOO')).toBe('override');
    expect(merged.get('BAR')).toBe('base');
  });
});
