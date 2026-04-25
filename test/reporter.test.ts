import { describe, it, expect } from 'vitest';
import { checkResultToJUnit, validationResultToJUnit } from '../src/utils/reporter.js';

describe('checkResultToJUnit', () => {
  it('produces valid XML for passing check', () => {
    const xml = checkResultToJUnit({
      ok: true,
      missing: [],
      present: ['FOO', 'BAR'],
      optional: ['DEBUG'],
      extra: [],
    });
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('tests="3"');
    expect(xml).toContain('failures="0"');
    expect(xml).toContain('name="FOO"');
    expect(xml).toContain('name="BAR"');
    expect(xml).toContain('name="DEBUG (optional)"');
  });

  it('reports missing keys as failures', () => {
    const xml = checkResultToJUnit({
      ok: false,
      missing: ['SECRET'],
      present: ['PORT'],
      optional: [],
      extra: [],
    });
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('<failure message="required variable is missing"');
  });

  it('reports extra keys in strict mode as failures', () => {
    const xml = checkResultToJUnit({
      ok: false,
      missing: [],
      present: ['FOO'],
      optional: [],
      extra: ['UNKNOWN'],
    });
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('not declared in template');
  });
});

describe('validationResultToJUnit', () => {
  it('produces passing XML when no errors', () => {
    const xml = validationResultToJUnit({ errors: [], ok: true });
    expect(xml).toContain('failures="0"');
    expect(xml).toContain('name="all variables"');
  });

  it('reports validation errors as failures', () => {
    const xml = validationResultToJUnit({
      errors: [
        { key: 'PORT', error: 'expected number, got ***' },
        { key: 'API_KEY', error: 'required but missing' },
      ],
      ok: false,
    });
    expect(xml).toContain('failures="2"');
    expect(xml).toContain('name="PORT"');
    expect(xml).toContain('expected number');
  });

  it('escapes XML special characters', () => {
    const xml = validationResultToJUnit({
      errors: [{ key: 'X', error: 'got <bad> & "weird"' }],
      ok: false,
    });
    expect(xml).toContain('&lt;bad&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;weird&quot;');
  });
});
