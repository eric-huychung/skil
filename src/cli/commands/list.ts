import Table from 'cli-table3';
import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runList(engine: ICollectionEngine): CommandOutcome {
  const collections = engine.list();
  if (collections.length === 0) {
    return { message: 'No collections yet', isError: false, isInfo: true };
  }

  const table = new Table({ head: ['Name', 'Skills', 'Command'] });
  for (const collection of collections) {
    table.push([collection.name, String(collection.skills.length), collection.command ?? '—']);
  }

  return { message: table.toString(), isError: false, isInfo: true };
}

export function registerListCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('list')
    .description('List all skill collections')
    .action(() => {
      printOutcome(runList(engine));
    });
}
