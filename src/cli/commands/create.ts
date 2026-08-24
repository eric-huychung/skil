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

export function runCreate(engine: ICollectionEngine, name: string, skillIds: string[], command?: string): CommandOutcome {
  const result = engine.create(name, skillIds, command);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  const count = result.value.skills.length;
  return {
    message: `Created command '${result.value.name}' with ${count} skill${count === 1 ? '' : 's'}`,
    isError: false,
  };
}

export function registerCreateCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('create <name>')
    .description('Create a new command (leading / is stripped: /build → build)')
    .option('--skills <ids>', 'comma-separated skill IDs', '')
    .option('--command <cmd>', 'shell command template, runnable later via "contextkit run"')
    .action((name: string, options: { skills: string; command?: string }) => {
      printOutcome(runCreate(engine, name, parseSkillIds(options.skills), options.command));
    });
}
