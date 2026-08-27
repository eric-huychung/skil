import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../core/result.js';
import { InMemoryUsageCollector } from './in-memory-usage.js';

describe('InMemoryUsageCollector', () => {
  it('returns seeded events for the requested skill ids', async () => {
    const collector = new InMemoryUsageCollector();
    collector.seed([
      { skillId: 'tdd', source: 'claude' },
      { skillId: 'tdd', source: 'claude' },
      { skillId: 'design', source: 'claude' },
    ]);

    const result = await collector.collect({ projectRoot: '/tmp/proj', skillIds: ['tdd'] });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([
        { skillId: 'tdd', source: 'claude' },
        { skillId: 'tdd', source: 'claude' },
      ]);
    }
  });

  it('does not require unknown skill ids to appear', async () => {
    const collector = new InMemoryUsageCollector();
    collector.seed([{ skillId: 'tdd', source: 'claude' }]);

    const result = await collector.collect({
      projectRoot: '/tmp/proj',
      skillIds: ['tdd', 'missing'],
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((event) => event.skillId)).toEqual(['tdd']);
    }
  });

  it('returns an error when collect is set to fail', async () => {
    const collector = new InMemoryUsageCollector();
    collector.setCollectError(new Error('log unreadable'));

    const result = await collector.collect({ projectRoot: '/tmp/proj', skillIds: ['tdd'] });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('log unreadable');
    }
  });
});
