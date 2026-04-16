import { readFile, stat } from 'node:fs/promises';

export type EnvMap = ReadonlyMap<string, string>;

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ParserOptions { 
    readonly path: string; 
    /** Max file size in bytes. Default 10 MB. */
    readonly maxBytes?: number; 
    /**
     * If true, expands `$VAR` and `${VAR}` references inside unquoted and
     * double-quoted values (same semantics as `dotenv-expand`, which
     * `@nestjs/config` uses by default). Single-quoted values are NEVER
     * expanded. Use `\$` to emit a literal `$`.
     *
     * Off by default to keep behavior transparent — turn it on when you
     * want parity with what your Node/NestJS app will see at runtime.
     */   
    readonly expand?: boolean;
}

export interface ParseStringOptions {
    readonly expand?: boolean;
}
/**
 * Parses a .env file into an immutable key→value map.
 *
 * Supports:
 *   - `#` comments (full-line and trailing on unquoted values)
 *   - Single- and double-quoted values, including multi-line
 *   - Backslash escapes inside double-quoted values: `\n \r \t \\ \" \'`
 *   - `export KEY=value` (POSIX shell style)
 *
 * Does NOT mutate `process.env`. Does NOT perform variable interpolation
 * (intentional — interpolation changes semantics between dotenv loaders and
 * we only need comparison, not runtime loading).
 */

export async function parseEnvFile(options: ParserOptions): Promise<EnvMap> {
    const { path, maxBytes = DEFAULT_MAX_BYTES, expand = false } = options;
    /* Finds out the file size before reading. */
    const info = await stat(path);
    if (info.size > maxBytes) {
        throw new Error(
            `.env file too larger: ${path} ${info} bytes, limit ${maxBytes}`,
        )
    };
    const raw = await readFile(path, 'utf-8');
    return parseEnvString(raw, { expand });
}

/** 
 * Shared across calls; we reset lastIndex before each use.
 * Structure: optional `export`, KEY, `=`, VALUE where VALUE is either
   - double-quoted (supporting escapes + newlines),
   - single-quoted (literal, supporting newlines),
   - or unquoted up to end-of-line / `#` comment.
 * `[ \t]*` after `=` (not `\s*`) — `\s` would eat the newline
 * terminator for empty values like `FOO=\nBAR=...`.
*/
const LINE_RE =
  /(?:^|\n)[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(?:"((?:\\.|[^"\\])*)"|'((?:[^'])*)'|([^\n#]*?))[ \t]*(?:#[^\n]*)?(?=\n|$)/g
