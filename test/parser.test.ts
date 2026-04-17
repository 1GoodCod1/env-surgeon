import { describe, it, expect } from 'vitest';
import { parseEnvString } from '../src/core/parser.js';

describe('parseEnvString', () => {
  it('parses basic key=value pairs', () => {
    const result = parseEnvString('FOO=bar\nBAZ=qux');
    expect(result.get('FOO')).toBe('bar');
    expect(result.get('BAZ')).toBe('qux');
  });

  it('ignores comment lines', () => {
    const result = parseEnvString('# this is a comment\nFOO=bar');
    expect(result.has('# this is a comment')).toBe(false);
    expect(result.get('FOO')).toBe('bar');
  });

  it('ignores blank lines', () => {
    const result = parseEnvString('\n\nFOO=bar\n\n');
    expect(result.size).toBe(1);
  });

  it('strips double quotes from values', () => {
    const result = parseEnvString('FOO="hello world"');
    expect(result.get('FOO')).toBe('hello world');
  });

  it('strips single quotes from values', () => {
    const result = parseEnvString("FOO='hello world'");
    expect(result.get('FOO')).toBe('hello world');
  });

  it('handles empty values', () => {
    const result = parseEnvString('FOO=');
    expect(result.get('FOO')).toBe('');
  });

  it('handles values with = signs', () => {
    const result = parseEnvString('DATABASE_URL=postgresql://user:pass@host/db?ssl=true');
    expect(result.get('DATABASE_URL')).toBe('postgresql://user:pass@host/db?ssl=true');
  });

  it('supports `export KEY=value` (POSIX shell syntax)', () => {
    const result = parseEnvString('export NODE_ENV=production');
    expect(result.get('NODE_ENV')).toBe('production');
  });

  it('strips trailing `# comment` on unquoted values', () => {
    const result = parseEnvString('FOO=bar # note');
    expect(result.get('FOO')).toBe('bar');
  });

  it('keeps `#` inside quoted values verbatim', () => {
    const result = parseEnvString('COLOR="#ffffff"');
    expect(result.get('COLOR')).toBe('#ffffff');
  });

  it('supports multi-line double-quoted values with escapes', () => {
    const result = parseEnvString('KEY="line1\\nline2"');
    expect(result.get('KEY')).toBe('line1\nline2');
  });

  it('supports CRLF line endings', () => {
    const result = parseEnvString('FOO=a\r\nBAR=b\r\n');
    expect(result.get('FOO')).toBe('a');
    expect(result.get('BAR')).toBe('b');
  });

  describe('with expand', () => {
    it('expands ${VAR} in unquoted values', () => {
      const result = parseEnvString('HOST=localhost\nURL=http://${HOST}:3000', { expand: true });
      expect(result.get('URL')).toBe('http://localhost:3000');
    });

    it('expands $VAR bare syntax', () => {
      const result = parseEnvString('HOST=localhost\nURL=http://$HOST', { expand: true });
      expect(result.get('URL')).toBe('http://localhost');
    });

    it('never expands single-quoted values', () => {
      const result = parseEnvString("HOST=localhost\nURL='http://${HOST}'", { expand: true });
      expect(result.get('URL')).toBe('http://${HOST}');
    });

    it('expands inside double-quoted values', () => {
      const result = parseEnvString('HOST=localhost\nURL="http://${HOST}"', { expand: true });
      expect(result.get('URL')).toBe('http://localhost');
    });

    it('\\$ escape produces literal $', () => {
      const result = parseEnvString('PRICE=\\$100', { expand: true });
      expect(result.get('PRICE')).toBe('$100');
    });

    it('unknown references become empty string (dotenv-expand parity)', () => {
      const result = parseEnvString('X=${MISSING}', { expand: true });
      expect(result.get('X')).toBe('');
    });

    it('leaves ${VAR} literal when expand is off', () => {
      const result = parseEnvString('HOST=localhost\nURL=http://${HOST}');
      expect(result.get('URL')).toBe('http://${HOST}');
    });

    it('resolves chains transitively (A→B→C)', () => {
      const result = parseEnvString('C=hello\nB=${C}\nA=${B}', { expand: true });
      expect(result.get('A')).toBe('hello');
      expect(result.get('B')).toBe('hello');
    });

    it('breaks cycles without hanging', () => {
      const result = parseEnvString('A=${B}\nB=${A}', { expand: true });
      // Both resolve to empty (cycle broken at detection) — the key property
      // here is that parsing terminates, not the exact tie-break value.
      expect(result.get('A')).toBeDefined();
      expect(result.get('B')).toBeDefined();
    });
  });
});
