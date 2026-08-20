import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

/** Parses a comma-separated skill ID list, trimming whitespace and dropping empties. */
export function parseSkillIds(csv: string): string[] {
  return csv
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function runCreate(engine: ICollectionEngine, name: string, skillIds: string[]): CommandOutcome {
  const result = engine.create(name, skillIds);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  const count = result.value.skills.length;
  return {
    message: `Created collection '${name}' with ${count} skill${count === 1 ? '' : 's'}`,
    isError: false,
  };
}

export function registerCreateCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('create <name>')
    .description('Create a new skill collection')
    .option('--skills <ids>', 'comma-separated skill IDs', '')
    .action((name: string, options: { skills: string }) => {
      printOutcome(runCreate(engine, name, parseSkillIds(options.skills)));
    });
}
