import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runUse(engine: ICollectionEngine, name: string): CommandOutcome {
  const result = engine.activate(name);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  const collection = engine.list().find((c) => c.name === name);
  const count = collection?.skills.length ?? 0;
  return {
    message: `Activated collection '${name}' (${count} skill${count === 1 ? '' : 's'})`,
    isError: false,
    warnings: result.value.warnings,
  };
}

export function registerUseCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('use <name>')
    .description('Activate a skill collection')
    .action((name: string) => {
      printOutcome(runUse(engine, name));
    });
}
