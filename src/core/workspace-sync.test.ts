import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../adapters/in-memory-fs.js';
import type { LeftoverRecord } from '../types/index.js';
import { isErr, isOk } from './result.js';
import { writeCommandFile } from './command-file.js';
import { upsertRuleSection } from './project-rules.js';
import { buildSyncAudit, readSyncBodies } from './workspace-sync.js';

const TDD_FIXTURE = readFileSync(
  join(process.cwd(), '.agents/skills/philosophy/tdd/SKILL.md'),
  'utf8'
);
const INCREMENT_FIXTURE = readFileSync(
  join(process.cwd(), '.agents/skills/build/increment/SKILL.md'),
  'utf8'
);

function leftover(kind: LeftoverRecord['kind'], id: string, path: string): LeftoverRecord {
  return { kind, id, path };
}

describe('buildSyncAudit', () => {
  it('classifies a leftover skill with no live copy as needs-import', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

    const audit = buildSyncAudit(fs, [leftover('skill', 'tdd', '.cursor/skills/tdd')]);

    expect(audit.needsImportCount).toBe(1);
    expect(audit.readyCount).toBe(0);
    expect(audit.driftCount).toBe(0);
    expect(audit.rows[0]).toMatchObject({
      kind: 'skill',
      id: 'tdd',
      path: '.cursor/skills/tdd',
      status: 'needs-import',
    });
    expect(audit.rows[0]?.canonicalPath).toBeUndefined();
  });

  it('classifies same SKILL.md but different supporting files as drift', () => {
    const fs = new InMemoryFileSystemAdapter();
    const body = '# tdd\n';
    fs.writeFile('.agents/skills/tdd/SKILL.md', body);
    fs.writeFile('.claude/skills/tdd/SKILL.md', body);
    fs.writeFile('.cursor/skills/tdd/SKILL.md', body);
    fs.writeFile('.cursor/skills/tdd/scripts/run.sh', '#!/bin/sh\n');

    const audit = buildSyncAudit(fs, [leftover('skill', 'tdd', '.cursor/skills/tdd')]);

    expect(audit.driftCount).toBe(1);
    expect(audit.readyCount).toBe(0);
    expect(audit.rows[0]?.status).toBe('drift');
  });

  it('classifies a leftover skill matching the live hash as ready-to-remove', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

    const audit = buildSyncAudit(fs, [leftover('skill', 'tdd', '.cursor/skills/tdd')]);

    expect(audit.readyCount).toBe(1);
    expect(audit.rows[0]).toMatchObject({
      status: 'ready-to-remove',
      canonicalPath: '.agents/skills/tdd',
    });
    expect(audit.rows[0]?.hashHere).toBe(audit.rows[0]?.hashCanonical);
  });

  it('classifies same id + different hash as drift, not a new skill', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# live tdd\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# leftover tdd\n');

    const audit = buildSyncAudit(fs, [leftover('skill', 'tdd', '.cursor/skills/tdd')]);

    expect(audit.driftCount).toBe(1);
    expect(audit.needsImportCount).toBe(0);
    expect(audit.rows[0]).toMatchObject({
      id: 'tdd',
      status: 'drift',
      canonicalPath: '.agents/skills/tdd',
    });
    expect(audit.rows[0]?.hashHere).not.toBe(audit.rows[0]?.hashCanonical);
  });

  it('never lists parked or already-canonical skill paths', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.skil/parked/skills/design/SKILL.md', '# design\n');
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');

    const audit = buildSyncAudit(fs, [
      leftover('skill', 'design', '.skil/parked/skills/design'),
      leftover('skill', 'tdd', '.agents/skills/tdd'),
    ]);

    expect(audit.rows).toEqual([]);
  });

  it('marks a leftover extra of a parked skill as ready-to-remove, not needs-import', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# parked\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# leftover\n');

    const audit = buildSyncAudit(fs, [leftover('skill', 'tdd', '.cursor/skills/tdd')]);

    expect(audit.needsImportCount).toBe(0);
    expect(audit.readyCount).toBe(1);
    expect(audit.rows[0]).toMatchObject({
      status: 'ready-to-remove',
      canonicalPath: '.skil/parked/skills/tdd',
    });
  });

  it('classifies leftover command files under .agents/commands as needs-import', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.agents/commands/build.md', writeCommandFile('build', []));

    const audit = buildSyncAudit(fs, [leftover('command', 'build', '.agents/commands/build.md')]);

    expect(audit.needsImportCount).toBe(1);
    expect(audit.rows[0]).toMatchObject({
      kind: 'command',
      id: 'build',
      path: '.agents/commands/build.md',
      status: 'needs-import',
    });
  });

  it('uses nested live-pair copies: matching leftover is ready-to-remove, an edit is drift', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.agents/skills/philosophy/tdd/SKILL.md', TDD_FIXTURE);
    fs.writeFile('.claude/skills/philosophy/tdd/SKILL.md', TDD_FIXTURE);
    fs.writeFile('.cursor/skills/philosophy/tdd/SKILL.md', TDD_FIXTURE);
    fs.writeFile('.agents/skills/build/increment/SKILL.md', INCREMENT_FIXTURE);
    fs.writeFile('.cursor/skills/build/increment/SKILL.md', `${INCREMENT_FIXTURE}\n# local edit\n`);

    const audit = buildSyncAudit(fs, [
      leftover('skill', 'philosophy/tdd', '.cursor/skills/philosophy/tdd'),
      leftover('skill', 'build/increment', '.cursor/skills/build/increment'),
    ]);

    expect(audit.readyCount).toBe(1);
    expect(audit.driftCount).toBe(1);
    expect(audit.rows.find((row) => row.id === 'philosophy/tdd')?.status).toBe('ready-to-remove');
    expect(audit.rows.find((row) => row.id === 'build/increment')?.status).toBe('drift');
  });

  it('marks a stamped leftover command ready-to-remove when the live command skill exists', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.agents/skills/build/SKILL.md', writeCommandFile('build', []));
    fs.writeFile('.cursor/commands/build.md', writeCommandFile('build', []));

    const audit = buildSyncAudit(fs, [leftover('command', 'build', '.cursor/commands/build.md')]);

    expect(audit.readyCount).toBe(1);
    expect(audit.rows[0]).toMatchObject({
      kind: 'command',
      id: 'build',
      status: 'ready-to-remove',
      canonicalPath: '.agents/skills/build',
    });
  });

  it('marks a leftover command as needs-import when the live command skill is missing', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.cursor/commands/build.md', writeCommandFile('build', []));

    const audit = buildSyncAudit(fs, [leftover('command', 'build', '.cursor/commands/build.md')]);

    expect(audit.needsImportCount).toBe(1);
    expect(audit.rows[0]?.status).toBe('needs-import');
  });

  it('marks a leftover command as drift when the live folder is a real skill, not a command', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.agents/skills/build/SKILL.md', '# a real skill named build\n');
    fs.writeFile('.cursor/commands/build.md', writeCommandFile('build', []));

    const audit = buildSyncAudit(fs, [leftover('command', 'build', '.cursor/commands/build.md')]);

    expect(audit.driftCount).toBe(1);
    expect(audit.rows[0]?.status).toBe('drift');
  });

  it('classifies leftover .codex/rules against the matching AGENTS.md section', () => {
    const fs = new InMemoryFileSystemAdapter();
    const body = '# pair-programming/behavior\nBe honest.\n';
    fs.writeFile('.codex/rules/pair-programming/behavior.md', body);
    fs.writeFile('.codex/rules/other.md', '# other\n');
    fs.writeFile('.codex/rules/changed.md', '# leftover\n');
    const agents = upsertRuleSection(
      upsertRuleSection('', 'pair-programming/behavior', body),
      'changed',
      '# live\n'
    );
    fs.writeFile('AGENTS.md', agents);

    const matching = buildSyncAudit(fs, [
      leftover('rule', '.codex/rules/pair-programming/behavior.md', '.codex/rules/pair-programming/behavior.md'),
    ]);
    expect(matching.readyCount).toBe(1);

    const missing = buildSyncAudit(fs, [leftover('rule', '.codex/rules/other.md', '.codex/rules/other.md')]);
    expect(missing.needsImportCount).toBe(1);

    const drift = buildSyncAudit(fs, [leftover('rule', 'changed', '.codex/rules/changed.md')]);
    expect(drift.driftCount).toBe(1);
  });

  it('reads leftover SKILL.md vs live SKILL.md for a drift row', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# live tdd\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# leftover tdd\n');
    const audit = buildSyncAudit(fs, [leftover('skill', 'tdd', '.cursor/skills/tdd')]);
    const row = audit.rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    const bodies = readSyncBodies(fs, row);

    expect(bodies).toEqual({
      ok: true,
      value: { leftoverBody: '# leftover tdd\n', canonicalBody: '# live tdd\n' },
    });
  });

  it('refuses a leftover that is not a conflict', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    const audit = buildSyncAudit(fs, [leftover('skill', 'tdd', '.cursor/skills/tdd')]);
    const row = audit.rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    const bodies = readSyncBodies(fs, row);

    expect(isErr(bodies)).toBe(true);
  });

  it('reads a leftover rule file against the AGENTS.md section', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.codex/rules/changed.md', '# leftover\n');
    fs.writeFile('AGENTS.md', upsertRuleSection('', 'changed', '# live\n'));
    const audit = buildSyncAudit(fs, [leftover('rule', 'changed', '.codex/rules/changed.md')]);
    const row = audit.rows[0];
    expect(row?.status).toBe('drift');
    if (!row) return;

    const bodies = readSyncBodies(fs, row);

    expect(isOk(bodies)).toBe(true);
    if (!isOk(bodies)) return;
    expect(bodies.value.leftoverBody).toBe('# leftover\n');
    expect(bodies.value.canonicalBody.trim()).toBe('# live');
  });

  it('classifies a glob .cursor/rules file against AGENTS.md, including .claude/rules copies', () => {
    const fs = new InMemoryFileSystemAdapter();
    const body = '# behavior\n';
    fs.writeFile('.cursor/rules/behavior.mdc', body);
    fs.writeFile('.claude/rules/behavior.md', body);
    fs.writeFile('AGENTS.md', upsertRuleSection('', 'behavior', body));
    fs.writeFile('.cursor/rules/extra.mdc', '# extra\n');

    const matching = buildSyncAudit(fs, [
      leftover('rule', 'behavior', '.cursor/rules/behavior.mdc'),
      leftover('rule', 'behavior', '.claude/rules/behavior.md'),
    ]);
    expect(matching.readyCount).toBe(2);
    expect(matching.rows.every((row) => row.canonicalPath === 'AGENTS.md')).toBe(true);

    const missing = buildSyncAudit(fs, [leftover('rule', 'extra', '.cursor/rules/extra.mdc')]);
    expect(missing.needsImportCount).toBe(1);
  });
});
