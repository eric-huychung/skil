import { Command } from 'commander';
import type { ICollectionEngine } from '../interfaces/engine.js';
import { CONTEXTKIT_VERSION } from '../index.js';
import { registerCreateCommand } from './commands/create.js';
import { registerListCommand } from './commands/list.js';
import { registerSearchCommand } from './commands/search.js';
import { registerInstallCommand } from './commands/install.js';
import { registerConvertCommand } from './commands/convert.js';
import { registerSyncCommand } from './commands/sync.js';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerRunCommand } from './commands/run.js';
import { registerExportCommand } from './commands/export.js';
import { registerInboxCommand } from './commands/inbox.js';
import { registerDeleteCommand } from './commands/delete.js';
import { registerScanCommand } from './commands/scan.js';

/**
 * Builds the contextkit CLI program. Commands are thin: they parse args,
 * call the injected engine, and format the result. All business logic
 * lives in the engine.
 */
export function createProgram(engine: ICollectionEngine): Command {
  const program = new Command();

  program
    .name('contextkit')
    .description('skil: map + inbox + skill deploy. Group skills onto commands, then install or export.')
    .version(CONTEXTKIT_VERSION);

  registerCreateCommand(program, engine);
  registerListCommand(program, engine);
  registerSearchCommand(program, engine);
  registerInstallCommand(program, engine);
  registerConvertCommand(program, engine);
  registerSyncCommand(program, engine);
  registerAddCommand(program, engine);
  registerRemoveCommand(program, engine);
  registerRunCommand(program, engine);
  registerExportCommand(program, engine);
  registerInboxCommand(program, engine);
  registerDeleteCommand(program, engine);
  registerScanCommand(program, engine);

  return program;
}
