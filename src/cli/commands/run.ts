import type { Command } from 'commander';
import { execa } from 'execa';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

/** Runs a shell command string. Injectable so tests never spawn a real subprocess. */
export type CommandExecutor = (command: string) => Promise<{ exitCode: number }>;

/** Real executor: runs the command in the user's shell, inheriting env and stdio. */
export async function shellExecutor(command: string): Promise<{ exitCode: number }> {
  const result = await execa(command, { shell: true, stdio: 'inherit', reject: false });
  return { exitCode: result.exitCode ?? 1 };
}

export async function runRun(engine: ICollectionEngine, name: string, executor: CommandExecutor): Promise<CommandOutcome> {
  const commandResult = engine.getCommand(name);
  if (!isOk(commandResult)) {
    return { message: commandResult.error.message, isError: true };
  }

  try {
    const { exitCode } = await executor(commandResult.value);
    if (exitCode !== 0) {
      return { message: `Command for '${name}' exited with code ${exitCode}`, isError: true };
    }
    return { message: `Ran '${commandResult.value}' for '${name}'`, isError: false };
  } catch (error) {
    return { message: `Failed to run command for '${name}': ${(error as Error).message}`, isError: true };
  }
}

export function registerRunCommand(program: Command, engine: ICollectionEngine, executor: CommandExecutor = shellExecutor): void {
  program
    .command('run <name>')
    .description("Run a command's leftover stored shell template")
    .action(async (name: string) => {
      printOutcome(await runRun(engine, name, executor));
    });
}
