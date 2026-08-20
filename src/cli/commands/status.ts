import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runStatus(engine: ICollectionEngine): CommandOutcome {
  const { activeCollection } = engine.status();
  if (!activeCollection) {
    return { message: 'No active collection', isError: false, isInfo: true };
  }
  return { message: `Active collection: '${activeCollection}'`, isError: false, isInfo: true };
}

export function registerStatusCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('status')
    .description('Show the currently active skill collection')
    .action(() => {
      printOutcome(runStatus(engine));
    });
}
