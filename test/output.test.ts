import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { printDiff } from '../src/utils/output.js';
import type { DiffResult } from '../src/core/differ.js';

const result: DiffResult = {
  missing: [],
  extra: [],
  different: [{ key: 'SECRET', left: 'supersecretvalue123', right: 'otherleakyvalue456' }],
};

describe('printDiff --json', () => {
  let logs: string[];
  let spy: MockInstance;

  beforeEach(() => {
    logs = [];
    spy = vi.spyOn(console, 'log').mockImplementation((m: string) => {
      logs.push(m);
    });
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('does not leak raw secret values in JSON output', () => {
    printDiff(result, 'a', 'b', { format: 'json', silent: false });
    const output = logs.join('\n');
    expect(output).not.toContain('supersecretvalue123');
    expect(output).not.toContain('otherleakyvalue456');
    expect(output).toMatch(/\*\*\*/);
  });

  it('text output also masks', () => {
    printDiff(result, 'a', 'b', { format: 'text', silent: false });
    const output = logs.join('\n');
    expect(output).not.toContain('supersecretvalue123');
  });
});
