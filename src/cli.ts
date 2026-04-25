import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { registerCommands } from './cli/register-commands.js';
import { EXIT_OK, EXIT_USAGE } from './cli/exits.js';
import { handleFatal } from './cli/fatal.js';
import type { EnvSurgeonConfig } from './utils/config.js';
import { loadConfig } from './utils/config.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

const configFile = await loadConfig().catch(handleFatal);
const config = (configFile?.config ?? {}) as EnvSurgeonConfig;

const program = new Command();

program
  .name('env-surgeon')
  .description('Diff, scan, check and validate .env files')
  .version(pkg.version)
  .showHelpAfterError()
  .exitOverride((err) => {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(EXIT_OK);
    }
    process.exit(EXIT_USAGE);
  });

registerCommands(program, config);

try {
  await program.parseAsync(process.argv);
} catch (err: unknown) {
  handleFatal(err);
}
