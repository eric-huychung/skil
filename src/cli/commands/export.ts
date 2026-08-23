import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export async function runExport(engine: ICollectionEngine, collectionsCsv: string, targetIDE: IDE): Promise<CommandOutcome> {
  const names = collectionsCsv
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const result = await engine.export(names, targetIDE);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  const { succeeded, failures } = result.value;
  if (succeeded.length === 0 && failures.length > 0) {
    return { message: failures.join('; '), isError: true };
  }

  return {
    message: `Exported ${succeeded.length} skill${succeeded.length === 1 ? '' : 's'} for ${targetIDE}`,
    isError: false,
    warnings: failures,
  };
}

export function registerExportCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('export <names>')
    .description('Convert every skill on the given comma-separated commands for a target IDE')
    .requiredOption('--to <ide>', 'target IDE: cursor, claude, or windsurf')
    .action(async (collectionsCsv: string, options: { to: IDE }) => {
      printOutcome(await runExport(engine, collectionsCsv, options.to));
    });
}
