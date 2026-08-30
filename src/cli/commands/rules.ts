import Table from 'cli-table3';
import type { Command } from 'commander';
import type { ICollectionEngine } from '../../interfaces/engine.js';
import { isOk } from '../../core/result.js';
import { printOutcome, type CommandOutcome } from '../output.js';

export function runRulesList(engine: ICollectionEngine): CommandOutcome {
  const rules = engine.rules();
  if (rules.length === 0) {
    return { message: 'No rules found on disk', isError: false, isInfo: true };
  }

  const table = new Table({ head: ['Name', 'Kind', 'Enabled', 'Path'] });
  for (const rule of rules) {
    const enabled = rule.kind === 'glob' ? '—' : rule.enabled === false ? 'no' : 'yes';
    table.push([rule.name, rule.kind, enabled, rule.path]);
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

export function runRulesSetEnabled(
  engine: ICollectionEngine,
  id: string,
  enabled: boolean
): CommandOutcome {
  const result = engine.setSharedRuleEnabled(id, enabled);
  if (!isOk(result)) {
    return { message: result.error.message, isError: true };
  }

  return {
    message: `Set rule '${result.value.id}' to ${enabled ? 'on' : 'off'}`,
    isError: false,
  };
}

export function registerRulesCommand(program: Command, engine: ICollectionEngine): void {
  const rules = program
    .command('rules')
    .description('List rule files on disk: shared AGENTS.md sections (togglable) and glob rule files (read-only)')
    .action(() => {
      printOutcome(runRulesList(engine));
    });

  rules
    .command('show <id>')
    .description('Print a rule body (shared section id, or a glob rule path like .cursor/rules/foo.mdc)')
    .action((id: string) => {
      printOutcome(runRulesShow(engine, id));
    });

  rules
    .command('enable <id>')
    .description('Turn on a shared-law rule: upserts its AGENTS.md section')
    .action((id: string) => {
      printOutcome(runRulesSetEnabled(engine, id, true));
    });

  rules
    .command('disable <id>')
    .description('Turn off a shared-law rule: removes its AGENTS.md section and parks the body')
    .action((id: string) => {
      printOutcome(runRulesSetEnabled(engine, id, false));
    });
}
