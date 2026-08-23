import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

const DEFAULT_CONFIG_PATH = '.contextkit.yml';

export function runSync(engine: ICollectionEngine, configPath: string): CommandOutcome {
  const result = engine.sync(configPath);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  const count = result.value.synced.length;
  return {
    message: `Synced ${count} collection${count === 1 ? '' : 's'} from config`,
    isError: false,
    warnings: result.value.warnings,
  };
}

export function registerSyncCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('sync')
    .description('Sync leftover team config into local commands')
    .option('--config <path>', 'path to the config file', DEFAULT_CONFIG_PATH)
    .action((options: { config: string }) => {
      printOutcome(runSync(engine, options.config));
    });
}
