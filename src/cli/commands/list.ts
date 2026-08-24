import Table from 'cli-table3';
import { Option, type Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import type { IDE } from '../../types/index.js';
import { TARGET_IDES } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runList(engine: ICollectionEngine, ide?: IDE): CommandOutcome {
  if (ide) {
    return formatList(engine.list(ide));
  }

  const rows: Array<{ ide: IDE; name: string; skills: number; command: string }> = [];
  for (const target of TARGET_IDES) {
    for (const command of engine.list(target)) {
      rows.push({
        ide: target,
        name: command.name,
        skills: command.skills.length,
        command: command.command ?? '—',
      });
    }
  }
  if (rows.length === 0) {
    return { message: 'No commands yet', isError: false, isInfo: true };
  }

  const table = new Table({ head: ['IDE', 'Name', 'Skills', 'Command'] });
  for (const row of rows) {
    table.push([row.ide, row.name, String(row.skills), row.command]);
  }
  return { message: table.toString(), isError: false, isInfo: true };
}

function formatList(collections: ReturnType<ICollectionEngine['list']>): CommandOutcome {
  if (collections.length === 0) {
    return { message: 'No commands yet', isError: false, isInfo: true };
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
    .description('List commands for one IDE, or a compact per-IDE view')
    .addOption(new Option('--ide <ide>', 'IDE: cursor, claude, windsurf, or agents').choices(TARGET_IDES))
    .action((options: { ide?: IDE }) => {
      printOutcome(runList(engine, options.ide));
    });
}
