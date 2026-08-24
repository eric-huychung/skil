import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { ideOption } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runDelete(engine: ICollectionEngine, name: string, ide: IDE = 'cursor'): CommandOutcome {
  const result = engine.delete(name, ide);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: `Deleted command '${name}'`, isError: false };
}

export function registerDeleteCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('delete <name>')
    .description("Drop an IDE's membership for a command")
    .addOption(ideOption())
    .action((name: string, options: { ide: IDE }) => {
      printOutcome(runDelete(engine, name, options.ide));
    });
}
