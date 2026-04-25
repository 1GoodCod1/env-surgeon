import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const CLI = resolve(__dirname, '../dist/cli.js');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function run(
  args: string[],
  opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {},
): RunResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    cwd: opts.cwd,
    input: opts.input,
    env: { ...process.env, ...opts.env, NO_COLOR: '1' },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status,
  };
}

describe('CLI end-to-end', () => {
  let dir: string;

  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(`dist/cli.js missing — run \`npm run build\` before e2e tests`);
    }
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-surgeon-e2e-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('exit codes', () => {
    it('--help exits 0', () => {
      const r = run(['--help']);
      expect(r.code).toBe(0);
    });

    it('unknown command exits 2 (usage error)', () => {
      const r = run(['bogus-command']);
      expect(r.code).toBe(2);
    });

    it('unknown flag exits 2', () => {
      const r = run(['check', '--nonexistent-flag']);
      expect(r.code).toBe(2);
    });

    it('missing .env exits 2 with friendly message', () => {
      const r = run(['check', '--env', join(dir, 'missing.env'), '--template', join(dir, 't')]);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/File not found|not found/i);
      expect(r.stderr).not.toMatch(/\bat .*\.js:/);
    });
  });

  describe('diff', () => {
    it('reports missing keys and exits 1', () => {
      writeFileSync(join(dir, 'a.env'), 'FOO=1\nBAR=2');
      writeFileSync(join(dir, 'b.env'), 'FOO=1');
      const r = run(['diff', join(dir, 'a.env'), join(dir, 'b.env')]);
      expect(r.code).toBe(1);
      expect(r.stdout).toMatch(/BAR/);
    });

    it('--json masks secret values', () => {
      writeFileSync(join(dir, 'a.env'), 'TOKEN=supersecret_12345');
      writeFileSync(join(dir, 'b.env'), 'TOKEN=differentsecret_67890');
      const r = run(['diff', join(dir, 'a.env'), join(dir, 'b.env'), '--json']);
      expect(r.stdout).not.toContain('supersecret_12345');
      expect(r.stdout).not.toContain('differentsecret_67890');
      expect(r.stdout).toMatch(/\*\*\*/);
    });

    it('exit 0 on identical files', () => {
      writeFileSync(join(dir, 'a.env'), 'FOO=1');
      writeFileSync(join(dir, 'b.env'), 'FOO=1');
      const r = run(['diff', join(dir, 'a.env'), join(dir, 'b.env')]);
      expect(r.code).toBe(0);
    });
  });

  describe('check', () => {
    it('passes when .env has all required keys', () => {
      writeFileSync(join(dir, '.env.example'), 'FOO=\nBAR=');
      writeFileSync(join(dir, '.env'), 'FOO=x\nBAR=y');
      const r = run(['check', '--template', join(dir, '.env.example'), '--env', join(dir, '.env')]);
      expect(r.code).toBe(0);
    });

    it('reads from stdin via --env -', () => {
      writeFileSync(join(dir, '.env.example'), 'FOO=\nBAR=');
      const r = run(['check', '--template', join(dir, '.env.example'), '--env', '-'], {
        input: 'FOO=1\nBAR=2\n',
      });
      expect(r.code).toBe(0);
    });

    it('cascade: earlier --env wins', () => {
      writeFileSync(join(dir, '.env'), 'FOO=base\nBAR=base');
      writeFileSync(join(dir, '.env.local'), 'FOO=override');
      writeFileSync(join(dir, '.env.example'), 'FOO=\nBAR=');
      const r = run([
        'check',
        '--env',
        join(dir, '.env.local'),
        '--env',
        join(dir, '.env'),
        '--template',
        join(dir, '.env.example'),
      ]);
      expect(r.code).toBe(0);
    });
  });

  describe('print', () => {
    it('masks values by default', () => {
      writeFileSync(join(dir, '.env'), 'SECRET=abcdefghijklmnop');
      const r = run(['print', '--env', join(dir, '.env')]);
      expect(r.code).toBe(0);
      expect(r.stdout).not.toContain('abcdefghijklmnop');
      expect(r.stdout).toMatch(/SECRET=\*\*\*/);
    });

    it('--reveal exposes values', () => {
      writeFileSync(join(dir, '.env'), 'PLAIN=hello');
      const r = run(['print', '--env', join(dir, '.env'), '--reveal']);
      expect(r.stdout).toContain('PLAIN=hello');
    });

    it('merges cascade with expansion', () => {
      writeFileSync(join(dir, 'base'), 'HOST=localhost');
      writeFileSync(join(dir, 'local'), 'URL=http://${HOST}:3000');
      const r = run([
        'print',
        '--env',
        join(dir, 'local'),
        '--env',
        join(dir, 'base'),
        '--expand',
        '--reveal',
      ]);
      expect(r.stdout).toContain('URL=http://localhost:3000');
    });
  });

  describe('config file', () => {
    it('picks up env-surgeon.config.json', () => {
      writeFileSync(join(dir, '.env'), 'FOO=1\nBAR=2');
      writeFileSync(join(dir, '.env.example'), 'FOO=\nBAR=');
      writeFileSync(
        join(dir, 'env-surgeon.config.json'),
        JSON.stringify({
          check: {
            env: join(dir, '.env'),
            template: join(dir, '.env.example'),
          },
        }),
      );
      const r = run(['check'], { cwd: dir });
      expect(r.code).toBe(0);
    });
  });

  describe('init --force', () => {
    it('refuses to overwrite without --force', () => {
      writeFileSync(join(dir, '.env'), 'FOO=1');
      writeFileSync(join(dir, 'schema.json'), '{"OLD":{"type":"string"}}');
      const r = run(['init', '--env', join(dir, '.env'), '--output', join(dir, 'schema.json')]);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/overwrite|force/i);
    });

    it('overwrites with --force', () => {
      writeFileSync(join(dir, '.env'), 'NEW=1');
      writeFileSync(join(dir, 'schema.json'), '{"OLD":{"type":"string"}}');
      const r = run([
        'init',
        '--env',
        join(dir, '.env'),
        '--output',
        join(dir, 'schema.json'),
        '--force',
        '--silent',
      ]);
      expect(r.code).toBe(0);
    });
  });
});
