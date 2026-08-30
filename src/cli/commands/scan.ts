import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runScan(engine: ICollectionEngine): CommandOutcome {
  const result = engine.scan();
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  const { added, gone, changed, alwaysOnWarnings } = result.value;
  if (added.length === 0 && gone.length === 0 && changed.length === 0 && alwaysOnWarnings.length === 0) {
    return {
      message:
        'No skills found. Scan looks for SKILL.md under .cursor/skills, .claude/skills, .codex/skills, .github/skills, .agents/skills, and .windsurf/skills. The command map stays; this is pull, not team sync.',
      isError: false,
      isInfo: true,
    };
  }

  return {
    message: [
      formatGroup('Added', added),
      formatGroup('Gone', gone),
      formatGroup('Changed', changed),
      formatWarnings(alwaysOnWarnings),
    ].join('\n'),
    isError: false,
    isInfo: true,
  };
}

export function registerScanCommand(program: Command, engine: ICollectionEngine): void {
  program
    .command('scan')
    .description(
      'Pull: scan SKILL.md folders in this repo. The command map stays. Does not read commands/ or sync a team config.'
    )
    .action(() => {
      printOutcome(runScan(engine));
    });
}

function formatGroup(label: string, ids: string[]): string {
  if (ids.length === 0) {
    return `${label} (0)`;
  }
  return `${label} (${ids.length})\n  ${ids.join('\n  ')}`;
}

function formatWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return 'Warnings (0)';
  }
  return `Warnings (${warnings.length})\n  ${warnings.join('\n  ')}`;
}
