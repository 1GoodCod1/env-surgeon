import { existsSync } from 'node:fs';
import { generateSchema, writeSchemaFile } from '../core/init.js';
import { readEnvFile, UserError } from '../utils/errors.js';
import type { SchemaFormat } from '../core/init.js';

export interface InitCommandOptions {
  readonly env: string;
  readonly output: string;
  readonly format: SchemaFormat;
  readonly force: boolean;
  readonly silent: boolean;
}

export async function runInit(options: InitCommandOptions): Promise<number> {
  if (!options.force && existsSync(options.output)) {
    throw new UserError(
      `Refusing to overwrite existing schema: ${options.output}\nPass --force to replace it.`,
    );
  }

  const envMap = await readEnvFile(options.env, false);
  const schema = generateSchema(envMap);

  await writeSchemaFile(schema, options.output, options.format);

  if (!options.silent) {
    const { default: chalk } = await import('chalk');
    console.log(chalk.green(`✓ Schema generated: ${options.output}`));
    console.log(
      chalk.gray(`  ${envMap.size} key(s) — all set to { type: "string", required: true }`),
    );
    console.log(
      chalk.gray('  Edit the file to refine types, add constraints, mark optional fields.\n'),
    );
  }

  return 0;
}
