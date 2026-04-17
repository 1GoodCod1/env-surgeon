import { describe, it, expect } from 'vitest';
import { diffEnvMaps, hasDifferences } from '../src/core/differ.js';
import { parseEnvString } from '../src/core/parser.js';

describe('diffEnvMaps', () => {
  it('returns empty diff for identical maps', () => {
    const env = parseEnvString('FOO=bar\nBAZ=qux');
    const result = diffEnvMaps(env, env);

    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.different).toHaveLength(0);
  });

  it('detects missing keys', () => {
    const left = parseEnvString('FOO=bar\nMISSING=val');
    const right = parseEnvString('FOO=bar');

    const result = diffEnvMaps(left, right);
    expect(result.missing).toEqual(['MISSING']);
  });

  it('detects extra keys', () => {
    const left = parseEnvString('FOO=bar');
    const right = parseEnvString('FOO=bar\nEXTRA=val');

    const result = diffEnvMaps(left, right);
    expect(result.extra).toEqual(['EXTRA']);
  });

  it('detects different values', () => {
    const left = parseEnvString('PORT=3000');
    const right = parseEnvString('PORT=8080');

    const result = diffEnvMaps(left, right);
    expect(result.different).toHaveLength(1);
    expect(result.different[0]).toMatchObject({ key: 'PORT', left: '3000', right: '8080' });
  });

  it('returns sorted results', () => {
    const left = parseEnvString('Z=1\nA=1\nM=1');
    const right = parseEnvString('Z=2\nA=2\nM=2');

    const result = diffEnvMaps(left, right);
    expect(result.different.map((d) => d.key)).toEqual(['A', 'M', 'Z']);
  });
});

describe('hasDifferences', () => {
  it('returns false when no differences', () => {
    const env = parseEnvString('FOO=bar');
    expect(hasDifferences(diffEnvMaps(env, env))).toBe(false);
  });

  it('returns true when differences exist', () => {
    const left = parseEnvString('FOO=bar');
    const right = parseEnvString('BAZ=qux');
    expect(hasDifferences(diffEnvMaps(left, right))).toBe(true);
  });
});
