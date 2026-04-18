import type { CheckResult } from '../core/checker.js';
import type { ValidationResult } from '../core/validator.js';

export type ReporterFormat = 'text' | 'json' | 'junit';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface TestCase {
  readonly name: string;
  readonly passed: boolean;
  readonly message?: string;
}

function toJUnitXml(suiteName: string, cases: TestCase[]): string {
  const failures = cases.filter((c) => !c.passed).length;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${cases.length}" failures="${failures}">`,
    `  <testsuite name="${escapeXml(suiteName)}" tests="${cases.length}" failures="${failures}">`,
  ];
  for (const tc of cases) {
    if (tc.passed) {
      lines.push(`    <testcase name="${escapeXml(tc.name)}" />`);
    } else {
      lines.push(`    <testcase name="${escapeXml(tc.name)}">`);
      lines.push(`      <failure message="${escapeXml(tc.message ?? 'failed')}" />`);
      lines.push(`    </testcase>`);
    }
  }
  lines.push('  </testsuite>', '</testsuites>');
  return lines.join('\n') + '\n';
}

export function checkResultToJUnit(result: CheckResult): string {
  const cases: TestCase[] = [
    ...result.present.map((k) => ({ name: k, passed: true })),
    ...result.optional.map((k) => ({ name: `${k} (optional)`, passed: true })),
    ...result.missing.map((k) => ({
      name: k,
      passed: false,
      message: 'required variable is missing',
    })),
    ...result.extra.map((k) => ({
      name: k,
      passed: false,
      message: 'not declared in template (strict mode)',
    })),
  ];
  return toJUnitXml('env-surgeon check', cases);
}

export function validationResultToJUnit(result: ValidationResult): string {
  const cases: TestCase[] = result.errors.map((e) => ({
    name: e.key,
    passed: false,
    message: e.error,
  }));
  if (cases.length === 0) {
    cases.push({ name: 'all variables', passed: true });
  }
  return toJUnitXml('env-surgeon validate', cases);
}
