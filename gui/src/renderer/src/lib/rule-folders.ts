import type { RuleRecord } from '../../../shared/ipc';

export type RuleFolderGroup = {
  key: string;
  label: string | null;
  rules: RuleRecord[];
};

export function ruleParentFolder(name: string): string | null {
  const slash = name.lastIndexOf('/');
  return slash === -1 ? null : name.slice(0, slash);
}

export function ruleFileName(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
}

export function groupRulesByFolder(rules: RuleRecord[]): RuleFolderGroup[] {
  const buckets = new Map<string, RuleRecord[]>();
  for (const rule of rules) {
    const parent = ruleParentFolder(rule.name) ?? '';
    const list = buckets.get(parent);
    if (list) list.push(rule);
    else buckets.set(parent, [rule]);
  }

  const folders = [...buckets.keys()].filter((key) => key !== '').sort((left, right) => left.localeCompare(right));
  const groups: RuleFolderGroup[] = folders.map((key) => ({
    key,
    label: key,
    rules: buckets.get(key) ?? [],
  }));

  const root = buckets.get('');
  if (root && root.length > 0) {
    groups.push({
      key: '',
      label: groups.length === 0 ? null : 'Other',
      rules: root,
    });
  }
  return groups;
}
