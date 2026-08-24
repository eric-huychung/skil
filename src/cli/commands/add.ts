import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { ideOption } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runAdd(
  engine: ICollectionEngine,
  name: string,
  skillId: string,
  ide: IDE = 'cursor'
): CommandOutcome {
  const result = engine.addSkill(name, skillId, ide);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: `Added '${skillId}' to '${name}'`, isError: false };
}

export function registerAddCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('add <command> <skillId>')
    .description('Add a skill to an existing command on an IDE')
    .addOption(ideOption())
    .action((name: string, skillId: string, options: { ide: IDE }) => {
      printOutcome(runAdd(engine, name, skillId, options.ide));
    });
}
