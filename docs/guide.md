# Advanced Guide

## Environment adaptation

env-surgeon auto-adapts to common runtimes:

| Situation | Behavior |
| --- | --- |
| Piped from another tool (Vault, 1Password, SOPS) | `--env -` reads stdin |
| NestJS / Next.js cascade (`.env.production.local → .env`) | `--auto-env` picks files by `NODE_ENV` in the right order |
| Multiple explicit files | Repeat `--env a --env b`; earlier wins (matches `@nestjs/config`) |
| npm/yarn/pnpm/bun script wrapper | `npm_*` / `YARN_*` injected vars are filtered out of `process.env` check |
| CI logs, non-TTY, `NO_COLOR` | Colors auto-disabled (chalk v5) |
| Windows (CRLF, backslashes, symlinks) | Normalized; symlinks never followed |
| Bun / Deno | Works as library — all imports use `node:` prefix |

Examples:

```bash
# Pipe secrets in without writing them to disk
aws ssm get-parameter --name /prod/env --with-decryption \
  | env-surgeon check --env - --template .env.example --strict

# Auto-pick .env.production / .env.production.local from NODE_ENV
NODE_ENV=production env-surgeon validate --auto-env --schema .env.schema.json

# Explicit cascade (first wins)
env-surgeon check --env .env.local --env .env --template .env.example
```

---

## Config file

Put repeated flags into `env-surgeon.config.json` (or `.js`/`.mjs`/`.cjs`) at the
project root. CLI flags always win over config values. Keys map 1:1 to CLI
options; per-command sections override the top level.

```json
{
  "expand": true,
  "strict": true,
  "check": {
    "template": "config/.env.example",
    "env": ["config/.env.local", "config/.env"]
  },
  "validate": {
    "schema": "config/.env.schema.json"
  },
  "scan": {
    "output": "config/.env.example",
    "respectGitignore": true
  }
}
```

Search order walks up from cwd to `/` — supports monorepos where the config
lives at the repo root.

---

## NestJS / dotenv-expand compatibility

`@nestjs/config` expands `${VAR}` references in `.env` values via `dotenv-expand`.
env-surgeon does **not** do this by default — pass `--expand` for parity:

```bash
env-surgeon validate --env .env --expand
env-surgeon check    --env .env --expand
env-surgeon diff .env .env.production --expand
```

Single-quoted values are never expanded (same as dotenv). Use `\$` for a literal `$`.

---

## .env.vault support

env-surgeon can read encrypted `.env.vault` files (compatible with `dotenv` >= 16.3
and `dotenv-vault`). Set the `DOTENV_KEY` environment variable and pass the vault
file as `--env`:

```bash
DOTENV_KEY="dotenv://:key_abc123@dotenv.org/vault/.env.vault?environment=production" \
  env-surgeon check --env .env.vault --template .env.example
```

Multiple keys (comma-separated) are tried in order — useful for key rotation.

---

## Watch mode

Use `--watch` with `check` or `validate` to re-run automatically when your `.env`
or schema files change:

```bash
env-surgeon check --env .env --template .env.example --watch
env-surgeon validate --env .env --schema .env.schema.json --watch
```

---

## CI reporters

Use `--reporter` to select an output format suited for CI:

| Format | Flag | Use case |
|--------|------|----------|
| Text (default) | `--reporter text` | Human-readable terminal output |
| JSON | `--reporter json` or `--json` | Programmatic consumption |
| JUnit XML | `--reporter junit` | Jenkins, GitHub Actions, GitLab CI |

```bash
env-surgeon check --reporter junit > test-results.xml
```

---

## GitHub Action

Use env-surgeon as a GitHub Action step:

```yaml
- uses: env-surgeon/env-surgeon@v1
  with:
    command: check
    env: .env.ci
    template: .env.example
    strict: true
    reporter: junit
```

See `.github/action.yml` for all available inputs.

---

## Execution model

env-surgeon is a **static checker** that runs as a separate Node process. It does
not import your app and does not populate `process.env`. Typical placements:

| Hook | Runs | Reads |
| --- | --- | --- |
| `"prestart": "env-surgeon check --env .env"` | before `npm start` | `.env` file |
| GitHub Actions step before deploy | in CI | `.env.ci` |
| Docker `RUN` during build | in build stage | whatever you `COPY` in |

For **runtime** NestJS validation, keep `class-validator` inside `ConfigModule.forRoot({ validate })`.
env-surgeon catches problems earlier — before the app boots.

---

## Pitfalls

- **`check` without `--env`** reads this process's `process.env`. When invoked via
  npm/yarn/pnpm, ~50 `npm_*` / `YARN_*` vars are injected — env-surgeon strips
  them before comparing, but this also means you *cannot* assert their presence.
- **Windows `process.env` is case-insensitive**, but the underlying `Map` is not.
  If your `.env` uses `path=...` and Windows has `PATH=...`, they'll appear as
  separate keys. Prefer SCREAMING_SNAKE_CASE.
- **Docker images** — if `.env` is in `.dockerignore`, `check` in `ENTRYPOINT`
  will fail with "File not found". Use `--env /run/secrets/env` or platform-provided env.
- **Monorepos** — run env-surgeon per package, not at the root.
- **No variable interpolation by default** — see `--expand` above.
