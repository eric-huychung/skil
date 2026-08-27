import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { toOption } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

function exportResultOutcome(
  result: Awaited<ReturnType<ICollectionEngine['exportCommand']>>,
  successMessage: string
): CommandOutcome {
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  if (result.value.failures.length > 0) {
    return { message: result.value.failures.join('\n'), isError: true };
  }
  return { message: successMessage, isError: false };
}

export async function runExport(
  engine: ICollectionEngine,
  name: string,
  targetIDE: IDE,
  opts?: { replace?: boolean }
): Promise<CommandOutcome> {
  return exportResultOutcome(
    await engine.exportCommand(name, targetIDE, opts),
    `Exported command '${name}' to ${targetIDE}`
  );
}

export async function runExportAll(
  engine: ICollectionEngine,
  targetIDE: IDE,
  opts?: { replace?: boolean }
): Promise<CommandOutcome> {
  return exportResultOutcome(
    await engine.exportAll(targetIDE, opts),
    `Exported all commands to ${targetIDE}`
  );
}

export function registerExportCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('export [command]')
    .description('Write stamped command files and deploy filed skills to a dock (not skillsmith convert)')
    .addOption(toOption().makeOptionMandatory())
    .option('--replace', 'overwrite an unstamped file, or reset Goal/Sequence/Rules on a stamped file')
    .action(async (name: string | undefined, options: { to: IDE; replace?: boolean }) => {
      if (!name) {
        printOutcome(await runExportAll(engine, options.to, { replace: options.replace }));
        return;
      }
      printOutcome(await runExport(engine, name, options.to, { replace: options.replace }));
    });
}
