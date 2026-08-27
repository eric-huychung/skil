import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { toOption } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export async function runCopy(
  engine: ICollectionEngine,
  name: string,
  toIde: IDE,
  opts?: { replace?: boolean }
): Promise<CommandOutcome> {
  const result = await engine.copyTo(name, 'cursor', toIde, opts);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  if (result.value.failures.length > 0) {
    return { message: result.value.failures.join('\n'), isError: true };
  }
  return { message: `Copied command '${name}' to ${toIde}`, isError: false };
}

export async function runCopyAll(
  engine: ICollectionEngine,
  toIde: IDE,
  opts?: { replace?: boolean }
): Promise<CommandOutcome> {
  const result = await engine.copyAll('cursor', toIde, opts);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  if (result.value.failures.length > 0) {
    return { message: result.value.failures.join('\n'), isError: true };
  }
  return { message: `Copied all commands to ${toIde}`, isError: false };
}

export function registerCopyCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('copy [command]')
    .description('Write a command list to a dock (stamped file + missing skills)')
    .addOption(toOption().makeOptionMandatory())
    .option('--all', 'copy every command on the map')
    .option('--replace', 'overwrite an unstamped dest file')
    .action(async (name: string | undefined, options: { to: IDE; all?: boolean; replace?: boolean }) => {
      if (options.all) {
        printOutcome(await runCopyAll(engine, options.to, { replace: options.replace }));
        return;
      }
      if (!name) {
        printOutcome({ message: 'Pass a command name, or --all', isError: true });
        return;
      }
      printOutcome(await runCopy(engine, name, options.to, { replace: options.replace }));
    });
}
