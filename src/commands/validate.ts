import { loadSchemaAuto, validateAuto } from '../core/validator.js';
import { printValidation } from '../utils/output.js';
import { readEnvCascade } from '../utils/errors.js';
import type { OutputFormat } from '../utils/output.js';

export interface ValidateCommandOptions {
  readonly env: ReadonlyArray<string>;
  readonly schema: string;
  readonly strict?: boolean;
  readonly expand?: boolean;
  readonly useProcessEnv?: boolean;
  readonly format: OutputFormat;
  readonly silent: boolean;
}

export async function runValidate(options: ValidateCommandOptions): Promise<number> {
  const [envMap, loaded] = await Promise.all([
    readEnvCascade(options.env, options.expand === true, {
      useProcessEnv: options.useProcessEnv !== false,
    }),
    loadSchemaAuto(options.schema, { allowedRoot: process.cwd() }),
  ]);

  const result = validateAuto(envMap, loaded, { strict: options.strict === true });

  printValidation(result, options);

  return result.ok ? 0 : 1;
}
