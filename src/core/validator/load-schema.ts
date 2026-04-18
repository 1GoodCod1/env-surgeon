import { readFile, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import { isSchema, VALID_TYPES, type LoadSchemaOptions, type Schema } from './types.js';

/**
 * Loads a schema from JSON (`.json`) or ESM/CJS JavaScript (`.js`/`.mjs`/`.cjs`).
 *
 * JS schemas are executed via dynamic `import()`. Callers SHOULD pass `allowedRoot`
 * (typically `process.cwd()`) so the loader refuses to execute scripts from outside
 * the project, since a schema path is a code-execution primitive.
 */
export async function loadSchema(
  schemaPath: string,
  options: LoadSchemaOptions = {},
): Promise<Schema> {
  // Dynamic `import()` in Node supports `http:` / `https:` / `data:` URLs
  // under flags and will happily fetch remote code. We only ever want
  // local filesystem paths.
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(schemaPath) &&
    !schemaPath.toLowerCase().startsWith('file:') &&
    !/^[a-zA-Z]:[\\/]/.test(schemaPath)
  ) {
    throw new Error(
      `Refusing to load schema from non-file URL: ${schemaPath}\nOnly local paths are allowed.`,
    );
  }
  const ext = schemaPath.split('.').pop()?.toLowerCase();
  const absolutePath = isAbsolute(schemaPath) ? schemaPath : resolve(schemaPath);

  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
    const allowedRoot = options.allowedRoot;
    if (allowedRoot !== undefined) {
      // Resolve symlinks on BOTH sides before comparing — otherwise a symlink
      // sitting inside the project that points to /tmp/evil.js would pass
      // a string-only `relative()` check and execute arbitrary code.
      const rootResolved = resolve(allowedRoot);
      const [realPath, realRoot] = await Promise.all([
        realpath(absolutePath).catch(() => absolutePath),
        realpath(rootResolved).catch(() => rootResolved),
      ]);
      const rel = relative(realRoot, realPath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(
          `Refusing to load JS schema outside project root: ${schemaPath}\n` +
            `JS schemas execute as code; move the file under ${allowedRoot} or use a JSON schema.`,
        );
      }
    }

    const mod = (await import(pathToFileURL(absolutePath).href)) as { default?: unknown };
    const parsed = mod.default ?? mod;
    if (!isSchema(parsed)) {
      throw new Error(
        `Invalid schema file: ${schemaPath}\n` +
          `Default export must be an object where each key has a valid "type" field ` +
          `(one of: ${Array.from(VALID_TYPES).join(', ')}).`,
      );
    }
    return parsed;
  }

  const raw = await readFile(absolutePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in schema file ${schemaPath}: ${message}`, { cause: err });
  }
  if (!isSchema(parsed)) {
    throw new Error(
      `Invalid schema file: ${schemaPath}\n` +
        `Expected an object where each key has a valid "type" field ` +
        `(one of: ${Array.from(VALID_TYPES).join(', ')}).`,
    );
  }
  return parsed;
}
