import { describe, expect, it } from 'vitest';
import { groupCommandsByStage } from './sdlc';
import type { Collection } from '../../../shared/ipc';

function command(name: string, skills: string[] = []): Collection {
  return { name, skills, createdAt: '2026-01-01T00:00:00.000Z', enabled: false };
}

describe('groupCommandsByStage', () => {
  it('groups planning, build, and testing under SDLC headings', () => {
    const groups = groupCommandsByStage([
      command('planning', ['a', 'b']),
      command('build', ['c']),
      command('testing', []),
    ]);

    expect(groups.map((group) => group.label)).toEqual(['Planning', 'Build', 'Testing']);
    expect(groups[0]?.commands.map((item) => item.name)).toEqual(['planning']);
    expect(groups[1]?.commands.map((item) => item.name)).toEqual(['build']);
    expect(groups[2]?.commands.map((item) => item.name)).toEqual(['testing']);
  });

  it('hides empty stages and files unmatched names under Other', () => {
    const groups = groupCommandsByStage([command('planning', []), command('frontend', ['x'])]);

    expect(groups.map((group) => group.label)).toEqual(['Planning', 'Other']);
    expect(groups[1]?.commands.map((item) => item.name)).toEqual(['frontend']);
  });

  it('skips the Other heading when every command is unmatched', () => {
    const groups = groupCommandsByStage([command('frontend'), command('backend')]);

    expect(groups).toEqual([
      {
        key: 'other',
        label: null,
        commands: [command('frontend'), command('backend')],
      },
    ]);
  });
});
