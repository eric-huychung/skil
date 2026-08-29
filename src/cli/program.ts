import { Command } from 'commander';
import type { ICollectionEngine } from '../interfaces/engine.js';
import { SKIL_VERSION } from '../index.js';
import { registerCreateCommand } from './commands/create.js';
import { registerListCommand } from './commands/list.js';
import { registerSearchCommand } from './commands/search.js';
import { registerInstallCommand } from './commands/install.js';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerExportCommand } from './commands/export.js';
import { registerInboxCommand } from './commands/inbox.js';
import { registerDeleteCommand } from './commands/delete.js';
import { registerScanCommand } from './commands/scan.js';
import { registerCopyCommand } from './commands/copy.js';
import { registerUsageCommand } from './commands/usage.js';
import { registerRulesCommand } from './commands/rules.js';
import { engineAsDiscover, type Discover } from '../backend/discover.js';

/**
 * Builds the skil CLI program. Commands are thin: they parse args,
 * call the injected engine, and format the result. All business logic
 * lives in the engine. The `contextkit` bin is an alias of the same entry.
 */
export function createProgram(engine: ICollectionEngine, discover: Discover = engineAsDiscover(engine)): Command {
  const program = new Command();

  program
    .name('skil')
    .description('skil: map + inbox + skill deploy. Group skills onto commands, then install or export.')
    .version(SKIL_VERSION);

  registerCreateCommand(program, engine);
  registerListCommand(program, engine);
  registerSearchCommand(program, discover);
  registerInstallCommand(program, engine);
  registerAddCommand(program, engine);
  registerRemoveCommand(program, engine);
  registerExportCommand(program, engine);
  registerInboxCommand(program, engine);
  registerDeleteCommand(program, engine);
  registerScanCommand(program, engine);
  registerCopyCommand(program, engine);
  registerUsageCommand(program, engine);
  registerRulesCommand(program, engine);

  return program;
}
