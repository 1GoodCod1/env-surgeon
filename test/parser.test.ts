import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEnvFile, parseEnvString } from '../src/core/parser.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleEnvPath = join(__dirname, 'fixtures', 'sample.env');

describe('parseEnvFile', () => {
  it('reads a real .env file from disk', async () => {
    const map = await parseEnvFile({ path: sampleEnvPath });
    expect(map.get('PLAIN')).toBe('hello');
    expect(map.get('EXPORTED')).toBe('world');
    expect(map.get('QUOTED')).toBe('with spaces');
  });

  it('rejects files larger than maxBytes', async () => {
    await expect(
      parseEnvFile({ path: sampleEnvPath, maxBytes: 1 }),
    ).rejects.toThrow(/too larger|limit/i);
  });

  it('expands braced refs when expand: true', async () => {
    const map = await parseEnvFile({
      path: sampleEnvPath,
      expand: true,
    });
    expect(map.get('REF_BRACED')).toBe('zzz');
  });
});

describe('parseEnvString', () => {
  it('parses unquoted, double- and single-quoted values', () => {
    const raw = `
A=1
B="say \\"hi\\""
C='\${not expanded}'
`;
    const map = parseEnvString(raw);
    expect(map.get('A')).toBe('1');
    expect(map.get('B')).toBe('say "hi"');
    expect(map.get('C')).toBe('${not expanded}');
  });

  it('expands $VAR when expand: true', () => {
    const map = parseEnvString('A=42\nB=$A\n', { expand: true });
    expect(map.get('B')).toBe('42');
  });

  it('expands ${VAR} braced form', () => {
    const map = parseEnvString('A=hi\nB=${A}\n', { expand: true });
    expect(map.get('B')).toBe('hi');
  });

  it('treats \\$ as a literal dollar', () => {
    const map = parseEnvString('P=\\$5\n', { expand: true });
    expect(map.get('P')).toBe('$5');
  });

  it('breaks cyclic ${VAR} chains to empty string', () => {
    const map = parseEnvString('A=${B}\nB=${A}\n', { expand: true });
    expect(map.get('A')).toBe('');
    expect(map.get('B')).toBe('');
  });

  it('decodes common double-quoted escapes', () => {
    const map = parseEnvString('X="a\\tb\\nc"\n');
    expect(map.get('X')).toBe('a\tb\nc');
  });
});
