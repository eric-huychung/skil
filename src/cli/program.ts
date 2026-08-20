import { Command } from 'commander';
import type { ICollectionEngine } from '../interfaces/engine.js';
import { CONTEXTKIT_VERSION } from '../index.js';
import { registerCreateCommand } from './commands/create.js';
import { registerUseCommand } from './commands/use.js';
import { registerDisableCommand } from './commands/disable.js';
import { registerListCommand } from './commands/list.js';
import { registerStatusCommand } from './commands/status.js';
import { registerSearchCommand } from './commands/search.js';
import { registerInstallCommand } from './commands/install.js';
import { registerSyncCommand } from './commands/sync.js';

/**
 * Builds the contextkit CLI program. Commands are thin: they parse args,
 * call the injected engine, and format the result. All business logic
 * lives in the engine.
 */
export function createProgram(engine: ICollectionEngine): Command {
  const program = new Command();

  program
    .name('contextkit')
    .description('CLI-first AI skill collection manager for Cursor, Claude, and Windsurf')
    .version(CONTEXTKIT_VERSION);

  registerCreateCommand(program, engine);
  registerUseCommand(program, engine);
  registerDisableCommand(program, engine);
  registerListCommand(program, engine);
  registerStatusCommand(program, engine);
  registerSearchCommand(program, engine);
  registerInstallCommand(program, engine);
  registerSyncCommand(program, engine);

  return program;
}
