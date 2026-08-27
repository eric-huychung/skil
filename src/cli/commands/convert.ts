import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { toOption } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export async function runConvert(engine: ICollectionEngine, skillId: string, targetIDE: IDE): Promise<CommandOutcome> {
  const result = await engine.convert(skillId, targetIDE);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  return { message: `Converted '${skillId}' for ${targetIDE}`, isError: false };
}

export function registerConvertCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('convert <skillId>')
    .description('Convert a skill to a target dock format via skillsmith')
    .addOption(toOption().makeOptionMandatory())
    .action(async (skillId: string, options: { to: IDE }) => {
      console.log(`Converting '${skillId}' for ${options.to}...`);
      printOutcome(await runConvert(engine, skillId, options.to));
    });
}
