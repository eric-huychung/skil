import { Option, type Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { printOutcome, type CommandOutcome } from '../output.js';

const TARGET_IDES = ['cursor', 'claude', 'windsurf', 'agents'] as const satisfies readonly IDE[];

export async function runInstall(
  engine: ICollectionEngine,
  skillId: string,
  targetIDE: IDE
): Promise<CommandOutcome> {
  const result = await engine.install(skillId, targetIDE);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  return { message: `Installed skill '${skillId}'`, isError: false };
}

export function registerInstallCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('install <skillId>')
    .description('Install a skill into an IDE skills dir via npx skills add')
    .addOption(
      new Option('--to <ide>', 'target IDE: cursor, claude, windsurf, or agents')
        .choices(TARGET_IDES)
        .makeOptionMandatory()
    )
    .action(async (skillId: string, options: { to: IDE }) => {
      console.log(`Installing '${skillId}' for ${options.to}...`);
      printOutcome(await runInstall(engine, skillId, options.to));
    });
}
