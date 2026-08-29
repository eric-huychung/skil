import Table from 'cli-table3';
import type { Command } from 'commander';
import type { Discover, DiscoverHit } from '../../backend/discover.js';
import { isOk } from '../../core/result.js';
import { statusLine } from '../../core/status-copy.js';
import type { BrowseView } from '../../types/index.js';
import { printOutcome, type CommandOutcome } from '../output.js';

const BROWSE_DISPLAY_LIMIT = 10;

export async function runSearch(
  discover: Discover,
  query: string,
  options: { trending?: boolean } = {},
): Promise<CommandOutcome> {
  const trimmed = query.trim();
  if (trimmed.length > 0) {
    return runTypedSearch(discover, trimmed);
  }
  return runBrowse(discover, options.trending ? 'trending' : 'all-time');
}

async function runTypedSearch(discover: Discover, query: string): Promise<CommandOutcome> {
  const result = await discover.search(query);
  if (!isOk(result)) {
    return { message: statusLine('search'), isError: true };
  }

  if (result.value.length === 0) {
    return { message: `No skills found for '${query}'`, isError: false, isInfo: true };
  }

  const table = new Table({ head: ['Skill', 'Installs'] });
  for (const hit of result.value) {
    table.push([hit.id, formatInstalls(hit)]);
  }

  return { message: table.toString(), isError: false, isInfo: true };
}

async function runBrowse(discover: Discover, view: BrowseView): Promise<CommandOutcome> {
  const result = await discover.browse(view);
  if (!isOk(result)) {
    return { message: statusLine('load'), isError: true };
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

function formatInstalls(hit: DiscoverHit): string {
  return hit.installs === undefined ? '' : String(hit.installs);
}

export function registerSearchCommand(program: Command, discover: Discover): void {
  program
    .command('search [query]')
    .description('Search the market index, or list the all-time leaderboard when query is omitted')
    .option('--trending', 'list the trending leaderboard instead of all-time (ignored when a query is given)')
    .action(async (query = '', options: { trending?: boolean }) => {
      printOutcome(await runSearch(discover, query, options));
    });
}
