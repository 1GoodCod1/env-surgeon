import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from '../src/utils/atomic.js';

describe('writeFileAtomic', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-surgeon-atomic-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes expected content', async () => {
    const path = join(dir, 'out.txt');
    await writeFileAtomic(path, 'hello');
    expect(readFileSync(path, 'utf-8')).toBe('hello');
  });

  it('leaves no temp files on success', async () => {
    const path = join(dir, 'out.txt');
    await writeFileAtomic(path, 'hello');
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });
});
