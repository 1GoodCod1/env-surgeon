import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init.js';
import { UserError } from '../src/utils/errors.js';

describe('runInit', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-surgeon-init-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to overwrite an existing file without --force', async () => {
    const env = join(dir, '.env');
    const out = join(dir, 'schema.json');
    writeFileSync(env, 'FOO=1');
    writeFileSync(out, '{"OLD": {"type": "string"}}');

    await expect(
      runInit({ env, output: out, format: 'json', force: false, silent: true }),
    ).rejects.toBeInstanceOf(UserError);

    expect(readFileSync(out, 'utf-8')).toContain('OLD');
  });

  it('overwrites with --force', async () => {
    const env = join(dir, '.env');
    const out = join(dir, 'schema.json');
    writeFileSync(env, 'NEW_KEY=1');
    writeFileSync(out, '{"OLD": {"type": "string"}}');

    await runInit({ env, output: out, format: 'json', force: true, silent: true });
    const rewritten = readFileSync(out, 'utf-8');
    expect(rewritten).toContain('NEW_KEY');
    expect(rewritten).not.toContain('OLD');
  });
});
