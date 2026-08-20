import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runDisable(engine: ICollectionEngine): CommandOutcome {
  const result = engine.deactivate();
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  return { message: 'Deactivated collection', isError: false };
}

export function registerDisableCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('disable')
    .description('Deactivate the current skill collection')
    .action(() => {
      printOutcome(runDisable(engine));
    });
}
