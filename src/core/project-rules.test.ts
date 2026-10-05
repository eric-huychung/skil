import { describe, expect, it } from 'vitest';
import {
  ruleDisplayTitle,
  stripSharedRuleFrontmatter,
  upsertRuleSection,
} from './project-rules.js';

describe('upsertRuleSection', () => {
  it('drops Cursor alwaysApply YAML and keeps the markdown body', () => {
    const next = upsertRuleSection(
      '',
      'pair-programming/behavior',
      '---\ndescription: Core interaction\nalwaysApply: true\n---\n# Pair Programming Behavior\n\nBe honest.\n'
    );

    expect(next).toContain('# AGENTS.md');
    expect(next).toContain('## Pair Programming Behavior');
    expect(next).toContain('Be honest.');
    expect(next).not.toMatch(/^# Pair Programming Behavior/m);
    expect(next).not.toContain('alwaysApply');
    expect(next).not.toContain('description:');
  });

  it('does not demote headings twice on a second upsert', () => {
    const once = upsertRuleSection('', 'behavior', '# Behavior\n\n## Nested\n');
    const twice = upsertRuleSection(once, 'behavior', '# Behavior\n\n## Nested\n');

    expect(twice).toBe(once);
    expect(twice).toContain('## Behavior');
    expect(twice).toContain('### Nested');
    expect(twice).not.toContain('#### Nested');
  });
});

describe('stripSharedRuleFrontmatter', () => {
  it('strips YAML already sitting in AGENTS.md sections', () => {
    const dirty =
      '<!-- skil:rule pair-programming/format -->\n---\nalwaysApply: true\n---\n# Response Format\n<!-- /skil:rule pair-programming/format -->\n';

    const next = stripSharedRuleFrontmatter(dirty);

    expect(next).toContain('# AGENTS.md');
    expect(next).toContain('## Response Format');
    expect(next).not.toContain('alwaysApply');
  });

  it('pins the file title and demotes a leftover H1 so it is not the document name', () => {
    const dirty =
      '<!-- skil:rule pair-programming/behavior -->\n# Pair Programming Behavior\n<!-- /skil:rule pair-programming/behavior -->\n';

    const next = stripSharedRuleFrontmatter(dirty);

    expect(next.startsWith('# AGENTS.md\n')).toBe(true);
    expect(next).toContain('## Pair Programming Behavior');
    expect(next).not.toMatch(/^# Pair Programming Behavior/m);
  });

  it('leaves a clean section alone', () => {
    const clean =
      '# AGENTS.md\n\n<!-- skil:rule behavior -->\n## behavior\n<!-- /skil:rule behavior -->\n';

    expect(stripSharedRuleFrontmatter(clean)).toBe(clean);
  });
});

describe('ruleDisplayTitle', () => {
  it('uses a section heading at any level, not the leftover path', () => {
    expect(ruleDisplayTitle('# Pair Programming Behavior\n\nBe honest.\n', 'pair-programming/behavior')).toBe(
      'Pair Programming Behavior'
    );
    expect(ruleDisplayTitle('## Pair Programming Behavior\n\nBe honest.\n', 'pair-programming/behavior')).toBe(
      'Pair Programming Behavior'
    );
  });

  it('falls back to the last path segment when there is no heading', () => {
    expect(ruleDisplayTitle('Be honest.\n', 'pair-programming/behavior')).toBe('behavior');
  });
});
