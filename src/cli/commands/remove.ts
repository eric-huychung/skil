import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runRemove(engine: ICollectionEngine, name: string, skillId: string): CommandOutcome {
  const result = engine.removeSkill(name, skillId);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: `Removed '${skillId}' from '${name}'`, isError: false };
}

export function registerRemoveCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('remove <collection> <skillId>')
    .description('Remove a skill from an existing collection')
    .action((name: string, skillId: string) => {
      printOutcome(runRemove(engine, name, skillId));
    });
}
