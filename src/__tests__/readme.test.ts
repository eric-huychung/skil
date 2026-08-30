import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../README.md'),
  'utf-8'
);

describe('README product loop', () => {
  it('documents the live-trees verbs and the skil bin', () => {
    expect(readme).toMatch(/^# skil/m);
    expect(readme).toContain('skil scan');
    expect(readme).toContain('skil create');
    expect(readme).toContain('skil delete');
    expect(readme).toContain('skil list');
    expect(readme).toContain('skil add');
    expect(readme).toContain('skil remove');
    expect(readme).toContain('skil enable');
    expect(readme).toContain('skil disable');
    expect(readme).toContain('skil install');
    expect(readme).toContain('skil rules');
    expect(readme).toContain('skil usage');
    expect(readme).toContain('skil search');
    expect(readme).toContain('.skil/state.json');
    expect(readme).toContain('SKIL_API_URL');
    expect(readme).toContain('contextkit');
  });

  it('describes live pair / parked / leftover — not Inbox or a dock picker', () => {
    expect(readme).toMatch(/live pair/i);
    expect(readme).toMatch(/parked/i);
    expect(readme).toMatch(/leftover/i);
    expect(readme).toMatch(/\.agents\/skills/);
    expect(readme).toMatch(/\.claude\/skills/);

    expect(readme.toLowerCase()).not.toContain('inbox');
    expect(readme.toLowerCase()).not.toContain('active collection');
    expect(readme.toLowerCase()).not.toContain('converts every skill');
    expect(readme.toLowerCase()).not.toContain('one-click');
    expect(readme.toLowerCase()).not.toContain('skillsmith');
    expect(readme.toLowerCase()).not.toContain('marketplace');
    expect(readme.toLowerCase()).not.toContain('linter');
    expect(readme).not.toMatch(/\bskil sync\b/);
    expect(readme).not.toMatch(/\bcontextkit sync\b/);
    expect(readme).not.toMatch(/\bskil run\b/);
    expect(readme).not.toMatch(/\bcontextkit run\b/);
    expect(readme).not.toMatch(/\bskil convert\b/);
    expect(readme).not.toMatch(/\bcontextkit convert\b/);
    expect(readme).not.toMatch(/\bskil export\b/);
    expect(readme).not.toMatch(/\bskil copy\b/);
    expect(readme.toLowerCase()).not.toContain('import-from-ide');
    expect(readme.toLowerCase()).not.toContain('import from ide');
  });
});
