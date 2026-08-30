import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export async function runInstall(engine: ICollectionEngine, skillId: string): Promise<CommandOutcome> {
  const result = await engine.install(skillId);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  return { message: `Installed skill '${skillId}' into .agents/skills and .claude/skills`, isError: false };
}

export function registerInstallCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('install <skillId>')
    .description('Install a market skill into the live trees (.agents/skills + .claude/skills)')
    .action(async (skillId: string) => {
      console.log(`Installing '${skillId}'...`);
      printOutcome(await runInstall(engine, skillId));
    });
}
