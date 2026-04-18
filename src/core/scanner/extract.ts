import { DESTRUCT_KEY_RE, DESTRUCT_RE, ENV_PATTERN } from './patterns.js';

export function extractEnvVars(source: string): ReadonlySet<string> {
  const found = new Set<string>();

  for (const match of source.matchAll(ENV_PATTERN)) {
    for (let i = 1; i < match.length; i++) {
      const name = match[i];
      if (name !== undefined) {
        found.add(name);
        break;
      }
    }
  }

  for (const match of source.matchAll(DESTRUCT_RE)) {
    const body = match[1];
    if (body === undefined) continue;
    // Strip comments so `// FOO` inside braces isn't treated as a key.
    const clean = body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const km of clean.matchAll(DESTRUCT_KEY_RE)) {
      const key = km[1];
      if (key !== undefined) found.add(key);
    }
  }

  return found;
}
