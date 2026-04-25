# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-18

First public release.

### Security

- Validator masks variable values in error messages to prevent secrets leaking into CI logs.
- `diff --json` masks the `left`/`right` values of differing keys (previously leaked raw values).
- Limit regex `pattern` length (512 chars) and value length (64 KB) to mitigate ReDoS.
- `scanDirectory` no longer follows symbolic links.
- `.env` and text-file readers enforce a 10 MB size limit.
- `loadSchema` rejects non-`file:` URLs (blocks `http(s):` / `data:` dynamic imports).
- `loadSchema` accepts an `allowedRoot` option that refuses to execute JS schemas outside the project root.

### Added

- New `print` command — inspect the effective merged env; values masked by default, `--reveal` to expose.
- New `env-surgeon.config.{json,js,mjs,cjs}` config file with monorepo-friendly lookup (walks up to root).
- `--expand` flag: dotenv-expand-compatible `${VAR}` interpolation (off by default).
- `--auto-env` flag: NODE_ENV-aware `.env` cascade (matches Next.js / NestJS `envFilePath` semantics).
- Repeatable `--env <path>` for manual cascades; first wins.
- `--env -` reads the env from stdin (for Vault / SOPS / 1Password pipelines).
- `init --force` flag — existing schemas are now protected from accidental overwrite.
- `scan --respect-gitignore` flag.
- `validate --strict` flag: fail if `.env` contains keys not declared in schema.
- Scanner reports `skipped` files (too large or unreadable) in both text and JSON output.
- Scanner ignore list expanded (.turbo, .cache, .svelte-kit, .astro, .vercel, .output, out/, .git).
- Parser supports multi-line quoted values, `\n \r \t` escapes, `export KEY=value`, trailing comments.
- Public helpers: `readEnvCascade`, `defaultEnvCascade`, `UserError`.

### Changed

- README, documentation, and publishing metadata.
- CLI exit-code contract unified: `0` ok, `1` findings, `2` usage/I-O error (commander errors now also return `2`).
- `scan` / `init` writes are atomic (temp-file + rename) — no more half-written outputs on crash.
- `fast-glob` is lazy-loaded — startup is ~40 ms faster for check/validate/diff.
- Cascade expansion runs on the MERGED map, so `${VAR}` can reference any file in the chain.
- `check` against `process.env` filters injected `npm_*` / `YARN_*` / `PNPM_*` / `BUN_*` vars.

### Fixed

- `scanDirectory` was O(n²) in occurrences aggregation; now O(n).
- Scanner regex now matches lower/mixed-case identifiers (`VITE_api_url`, `process.env.nodeEnv`).
- Windows-style `CRLF` line endings in `.env` files.
- `${VAR}` chain resolution is iterative with cycle detection (previously single-pass).
