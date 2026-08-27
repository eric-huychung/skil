import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isOk } from '../core/result.js';
import { ClaudeUsageCollector, encodeClaudeProjectPath } from './claude-usage-collector.js';

const fixtureHome = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/claude-usage/home');

describe('ClaudeUsageCollector', () => {
  it('counts two SKILL.md reads from a fixture session as two events', async () => {
    const collector = new ClaudeUsageCollector(fixtureHome);

    const result = await collector.collect({
      projectRoot: '/tmp/skil-usage',
      skillIds: ['tdd', 'design'],
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([
        { skillId: 'tdd', source: 'claude' },
        { skillId: 'tdd', source: 'claude' },
      ]);
    }
  });

  it('returns [] when the log dir is missing', async () => {
    const collector = new ClaudeUsageCollector(fixtureHome);

    const result = await collector.collect({
      projectRoot: '/tmp/does-not-exist',
      skillIds: ['tdd'],
    });

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('encodes a project root the way Claude names project folders', () => {
    expect(encodeClaudeProjectPath('/tmp/skil-usage')).toBe('-tmp-skil-usage');
  });
});
