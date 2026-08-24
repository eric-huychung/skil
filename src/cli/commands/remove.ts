import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { ideOption } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runRemove(
  engine: ICollectionEngine,
  name: string,
  skillId: string,
  ide: IDE = 'cursor'
): CommandOutcome {
  const result = engine.removeSkill(name, skillId, ide);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: `Removed '${skillId}' from '${name}'`, isError: false };
}

export function registerRemoveCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('remove <command> <skillId>')
    .description('Remove a skill from an existing command on an IDE')
    .addOption(ideOption())
    .action((name: string, skillId: string, options: { ide: IDE }) => {
      printOutcome(runRemove(engine, name, skillId, options.ide));
    });
}
