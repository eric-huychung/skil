import Table from 'cli-table3';
import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { BrowseView, Skill } from '../../types/index.js';
import { printOutcome, type CommandOutcome } from '../output.js';

const BROWSE_DISPLAY_LIMIT = 10;

export async function runSearch(
  engine: ICollectionEngine,
  query: string,
  options: { trending?: boolean } = {},
): Promise<CommandOutcome> {
  const trimmed = query.trim();
  if (trimmed.length > 0) {
    return runTypedSearch(engine, trimmed);
  }
  return runBrowse(engine, options.trending ? 'trending' : 'all-time');
}

async function runTypedSearch(engine: ICollectionEngine, query: string): Promise<CommandOutcome> {
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

async function runBrowse(engine: ICollectionEngine, view: BrowseView): Promise<CommandOutcome> {
  const result = await engine.browse(view);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  const skills = result.value.slice(0, BROWSE_DISPLAY_LIMIT);
  if (skills.length === 0) {
    return { message: `No skills found on the ${view} leaderboard`, isError: false, isInfo: true };
  }

  const table = new Table({ head: ['Skill', 'Installs'] });
  for (const skill of skills) {
    table.push([skill.id, formatInstalls(skill)]);
  }

  return { message: table.toString(), isError: false, isInfo: true };
}

function formatInstalls(skill: Skill): string {
  return skill.installs === undefined ? '' : String(skill.installs);
}

export function registerSearchCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('search [query]')
    .description('Search skills.sh, or list the all-time leaderboard when query is omitted')
    .option('--trending', 'list the trending leaderboard instead of all-time (ignored when a query is given)')
    .action(async (query = '', options: { trending?: boolean }) => {
      printOutcome(await runSearch(engine, query, options));
    });
}
