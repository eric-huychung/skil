import Table from 'cli-table3';
import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export async function runSearch(engine: ICollectionEngine, query: string): Promise<CommandOutcome> {
  const result = await engine.search(query);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  if (result.value.length === 0) {
    return { message: `No skills found for '${query}'`, isError: false, isInfo: true };
  }

  const table = new Table({ head: ['Skill', 'Source'] });
  for (const skill of result.value) {
    table.push([skill.id, skill.source]);
  }

  return { message: table.toString(), isError: false, isInfo: true };
}

export function registerSearchCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('search [query]')
    .description('Search skills.sh for skills')
    .action(async (query = '') => {
      printOutcome(await runSearch(engine, query));
    });
}
