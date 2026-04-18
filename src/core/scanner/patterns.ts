/**
 * Combined regex — one pass per file.
 * Identifier rule: first char `[A-Za-z_]`, rest `[A-Za-z0-9_]`.
 * This matches real-world usage (Vite's `VITE_api_url`, `process.env.nodeEnv`)
 * rather than only SCREAMING_SNAKE_CASE.
 * Groups: [1] process.env.X  [2] process.env['X']  [3] import.meta.env.X  [4] Deno.env.get('X')
 */
const IDENT = `[A-Za-z_][A-Za-z0-9_]*`;
// `(?:globalThis\\.)?` lets us catch `globalThis.process.env.X` and
// `globalThis.process.env['X']` as well.
const PROC = `(?:globalThis\\.)?process\\.env`;
export const ENV_PATTERN = new RegExp(
  [
    `${PROC}\\.(${IDENT})`,
    `${PROC}\\[['"\`](${IDENT})['"\`]\\]`,
    `import\\.meta\\.env\\.(${IDENT})`,
    `import\\.meta\\.env\\[['"\`](${IDENT})['"\`]\\]`,
    `Deno\\.env\\.get\\(['"\`](${IDENT})['"\`]\\)`,
    `Bun\\.env\\.(${IDENT})`,
  ].join('|'),
  'g',
);

// Matches `const { FOO, BAR: local } = process.env` (and `import.meta.env`).
// We allow newlines/whitespace inside braces but cap the brace body size so
// a pathological 100KB input can't blow up the regex engine.
export const DESTRUCT_RE = new RegExp(
  `(?:const|let|var)\\s*\\{([^}]{0,4000})\\}\\s*=\\s*(?:(?:globalThis\\.)?process\\.env|import\\.meta\\.env|Bun\\.env)`,
  'g',
);
export const DESTRUCT_KEY_RE = new RegExp(`(${IDENT})(?:\\s*:\\s*${IDENT})?`, 'g');
