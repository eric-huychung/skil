import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export async function runSetCommandEnabled(
  engine: ICollectionEngine,
  name: string,
  enabled: boolean
): Promise<CommandOutcome> {
  const result = await engine.setCommandEnabled(name, enabled);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return {
    message: `'${result.value.name}' is now ${enabled ? 'on' : 'off'}`,
    isError: false,
  };
}

export function registerEnableCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('enable <command>')
    .description('Turn a command on: writes it as a human-only skill in .agents/skills + .claude/skills')
    .action(async (name: string) => {
      printOutcome(await runSetCommandEnabled(engine, name, true));
    });
}

export function registerDisableCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('disable <command>')
    .description('Turn a command off: parks it under .skil/parked/commands/<name>')
    .action(async (name: string) => {
      printOutcome(await runSetCommandEnabled(engine, name, false));
    });
}
