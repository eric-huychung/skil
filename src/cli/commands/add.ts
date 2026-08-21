import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runAdd(engine: ICollectionEngine, name: string, skillId: string): CommandOutcome {
  const result = engine.addSkill(name, skillId);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: `Added '${skillId}' to '${name}'`, isError: false };
}

export function registerAddCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('add <collection> <skillId>')
    .description('Add a skill to an existing collection')
    .action((name: string, skillId: string) => {
      printOutcome(runAdd(engine, name, skillId));
    });
}
