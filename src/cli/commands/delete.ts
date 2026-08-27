import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runDelete(engine: ICollectionEngine, name: string): CommandOutcome {
  const result = engine.delete(name);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: `Deleted command '${name}'`, isError: false };
}

export function registerDeleteCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('delete <name>')
    .description('Drop a command from the project map')
    .action((name: string) => {
      printOutcome(runDelete(engine, name));
    });
}
