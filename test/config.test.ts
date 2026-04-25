import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, mergeConfig } from '../src/utils/config.js';

describe('loadConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-surgeon-cfg-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when no config file exists', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const result = await loadConfig(dir);
    expect(result).toBeNull();
  });

  it('finds env-surgeon.config.json', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(
      join(dir, 'env-surgeon.config.json'),
      JSON.stringify({ strict: true, expand: false }),
    );
    const result = await loadConfig(dir);
    expect(result).not.toBeNull();
    expect(result!.config.strict).toBe(true);
    expect(result!.config.expand).toBe(false);
  });

  it('finds .env-surgeonrc.json', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, '.env-surgeonrc.json'), JSON.stringify({ template: '.env.tpl' }));
    const result = await loadConfig(dir);
    expect(result).not.toBeNull();
    expect(result!.config.template).toBe('.env.tpl');
  });

  it('validates config shape — rejects non-object', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'env-surgeon.config.json'), '"string"');
    await expect(loadConfig(dir)).rejects.toThrow(/expected an object/);
  });

  it('validates config shape — rejects bad field type', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'env-surgeon.config.json'), JSON.stringify({ strict: 'yes' }));
    await expect(loadConfig(dir)).rejects.toThrow(/must be a boolean/);
  });

  it('stops at project boundary', async () => {
    const sub = join(dir, 'packages', 'app');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'package.json'), '{}');
    writeFileSync(join(dir, 'env-surgeon.config.json'), JSON.stringify({ strict: true }));
    const result = await loadConfig(sub);
    expect(result).toBeNull();
  });
});

describe('mergeConfig', () => {
  it('merges top-level and per-command sections', () => {
    const base = {
      strict: true,
      expand: false,
      check: { expand: true, template: 'custom.tpl' },
    };
    const merged = mergeConfig(base, 'check');
    expect(merged.strict).toBe(true);
    expect(merged.expand).toBe(true);
    expect(merged.template).toBe('custom.tpl');
  });

  it('returns top-level only when no per-command section', () => {
    const base = { strict: true };
    const merged = mergeConfig(base, 'validate');
    expect(merged.strict).toBe(true);
  });
});
