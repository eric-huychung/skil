import Table from 'cli-table3';
import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export async function runUsage(engine: ICollectionEngine): Promise<CommandOutcome> {
  const result = await engine.usage();
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  if (result.value.length === 0) {
    return { message: 'No usage yet', isError: false, isInfo: true };
  }

  const table = new Table({ head: ['Skill', 'Reads'] });
  for (const row of result.value) {
    table.push([row.skillId, String(row.count)]);
  }
  return { message: table.toString(), isError: false, isInfo: true };
}

export function registerUsageCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('usage')
    .description('Print how often catalog skills were read (Claude logs; counts only)')
    .action(async () => {
      printOutcome(await runUsage(engine));
    });
}
