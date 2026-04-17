import type { EnvMap } from './parser.js';

export interface DiffResult {
  readonly missing: ReadonlyArray<string>;
  readonly extra: ReadonlyArray<string>;
  readonly different: ReadonlyArray<DiffEntry>;
}

export interface DiffEntry {
  readonly key: string;
  readonly left: string;
  readonly right: string;
}

/**
 * Compares two env maps (left vs right).
 * - missing: keys in left but not in right
 * - extra:   keys in right but not in left
 * - different: keys present in both but with different values
 */
export function diffEnvMaps(left: EnvMap, right: EnvMap): DiffResult {
  const missing: string[] = [];
  const extra: string[] = [];
  const different: DiffEntry[] = [];

  for (const [key, leftValue] of left) {
    if (!right.has(key)) {
      missing.push(key);
    } else {
      const rightValue = right.get(key);
      if (rightValue === undefined) continue;
      if (leftValue !== rightValue) {
        different.push({ key, left: leftValue, right: rightValue });
      }
    }
  }

  for (const key of right.keys()) {
    if (!left.has(key)) {
      extra.push(key);
    }
  }

  return {
    missing: missing.sort(),
    extra: extra.sort(),
    different: different.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export function hasDifferences(result: DiffResult): boolean {
  return result.missing.length > 0 || result.extra.length > 0 || result.different.length > 0;
}
