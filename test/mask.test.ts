import { describe, it, expect } from 'vitest';
import { maskValue } from '../src/utils/mask.js';

describe('maskValue', () => {
  it('returns (empty) for empty string', () => {
    expect(maskValue('')).toBe('(empty)');
  });

  it('returns *** for short values (1-4 chars)', () => {
    expect(maskValue('a')).toBe('***');
    expect(maskValue('ab')).toBe('***');
    expect(maskValue('abcd')).toBe('***');
  });

  it('returns masked length for longer values', () => {
    expect(maskValue('abcde')).toBe('*** (5 chars)');
    expect(maskValue('supersecrettoken')).toBe('*** (16 chars)');
  });

  it('never leaks a prefix of the real value', () => {
    const result = maskValue('sk-ant-12345678901234567890');
    expect(result).not.toContain('sk-');
    expect(result).toMatch(/\*\*\*/);
  });
});
