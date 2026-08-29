import Table from 'cli-table3';
import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import type { IDE } from '../../types/index.js';
import { toOption } from '../ides.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runRulesList(engine: ICollectionEngine): CommandOutcome {
  const rules = engine.rules();
  if (rules.length === 0) {
    return { message: 'No rules found on disk', isError: false, isInfo: true };
  }

  const table = new Table({ head: ['Name', 'Dock', 'Always', 'Path'] });
  for (const rule of rules) {
    table.push([rule.name, rule.dock, rule.alwaysApply ? 'yes' : 'no', rule.path]);
  }

  return { message: table.toString(), isError: false, isInfo: true };
}

export function runRulesShow(engine: ICollectionEngine, id: string): CommandOutcome {
  const result = engine.readRule(id);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return { message: result.value, isError: false, isInfo: true };
}

export function runRulesAlwaysApply(
  engine: ICollectionEngine,
  id: string,
  alwaysApply: boolean
): CommandOutcome {
  const result = engine.setAlwaysApply(id, alwaysApply);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return {
    message: `Set always-apply on '${result.value.name}' to ${alwaysApply ? 'on' : 'off'}`,
    isError: false,
  };
}

export async function runRulesExport(
  engine: ICollectionEngine,
  targetIDE: IDE,
  opts?: { replace?: boolean }
): Promise<CommandOutcome> {
  const result = await engine.exportRules(targetIDE, opts);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }
  if (result.value.failures.length > 0) {
    return { message: result.value.failures.join('\n'), isError: true };
  }
  return { message: `Exported rules to ${targetIDE}`, isError: false };
}

export function registerRulesCommand(program: Command, engine: ICollectionEngine): void {
  const rules = program
    .command('rules')
    .description('List rule files on disk (not a skil-owned map)')
    .action(() => {
      printOutcome(runRulesList(engine));
    });

  rules
    .command('show <id>')
    .description('Print a rule file body (path id, e.g. .cursor/rules/foo.mdc or CLAUDE.md)')
    .action((id: string) => {
      printOutcome(runRulesShow(engine, id));
    });

  rules
    .command('always-apply <id> <on|off>')
    .description('Set alwaysApply on a Cursor .mdc rule')
    .action((id: string, value: string) => {
      const normalized = value.toLowerCase();
      if (normalized !== 'on' && normalized !== 'off') {
        printOutcome({ message: "Use 'on' or 'off'", isError: true });
        return;
      }
      printOutcome(runRulesAlwaysApply(engine, id, normalized === 'on'));
    });

  rules
    .command('export')
    .description('Copy scanned rules into a dest dock rules dir')
    .addOption(toOption().makeOptionMandatory())
    .option('--replace', 'overwrite dest rule files that differ')
    .action(async (options: { to: IDE; replace?: boolean }) => {
      printOutcome(await runRulesExport(engine, options.to, { replace: options.replace }));
    });
}
