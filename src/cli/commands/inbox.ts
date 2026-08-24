import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { ideOption } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runInboxList(engine: ICollectionEngine): CommandOutcome {
  const ids = engine.inbox();
  if (ids.length === 0) {
    return {
      message: 'Inbox is empty. Inbox is a holding list of skill IDs; export (not inbox) downloads them.',
      isError: false,
      isInfo: true,
    };
  }

  return { message: ids.join('\n'), isError: false, isInfo: true };
}

export function runInboxAdd(engine: ICollectionEngine, skillId: string): CommandOutcome {
  const result = engine.addToInbox(skillId);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: `Added '${skillId}' to Inbox`, isError: false };
}

export function runInboxFile(
  engine: ICollectionEngine,
  skillId: string,
  command: string,
  ide: IDE = 'cursor'
): CommandOutcome {
  const result = engine.file(skillId, command, ide);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: `Filed '${skillId}' onto '${result.value.name}'`, isError: false };
}

export function registerInboxCommand(program: Command, engine: ICollectionEngine): void {
  const inbox = program
    .command('inbox')
    .description('List Inbox skill IDs. Inbox is a holding list; export (not inbox) downloads.')
    .action(() => {
      printOutcome(runInboxList(engine));
    });

  inbox
    .command('add <skillId>')
    .description('Add a skill ID to Inbox')
    .action((skillId: string) => {
      printOutcome(runInboxAdd(engine, skillId));
    });

  inbox
    .command('file <skillId> <command>')
    .description('Move an Inbox ID onto an existing command on an IDE')
    .addOption(ideOption())
    .action((skillId: string, command: string, options: { ide: IDE }) => {
      printOutcome(runInboxFile(engine, skillId, command, options.ide));
    });
}
