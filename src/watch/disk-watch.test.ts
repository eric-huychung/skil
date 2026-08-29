import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOT_RULE_FILES } from '../core/project-rules.js';
import { DiskWatch, watchFilesByParent } from './disk-watch.js';

describe('DiskWatch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses two events inside 500ms into one flush', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    let now = 0;
    const watch = new DiskWatch({ onFlush, now: () => now });

    watch.handleEvent('.cursor/skills/tdd/SKILL.md');
    now = 200;
    watch.handleEvent('.cursor/commands/build.md');
    vi.advanceTimersByTime(500);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(['.cursor/skills/tdd/SKILL.md', '.cursor/commands/build.md']);
  });

  it('ignores writes we just muted for about 1s', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    let now = 0;
    const watch = new DiskWatch({ onFlush, now: () => now });

    watch.mute(['.cursor/commands/build.md']);
    watch.handleEvent('.cursor/commands/build.md');
    vi.advanceTimersByTime(500);
    expect(onFlush).not.toHaveBeenCalled();

    now = 1100;
    watch.handleEvent('.cursor/commands/build.md');
    vi.advanceTimersByTime(500);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('ignores paths under .git', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const watch = new DiskWatch({ onFlush });

    watch.handleEvent('.git/HEAD');
    watch.handleEvent('repo/.git/objects/ab');
    vi.advanceTimersByTime(500);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('groups root rule files by parent so CLAUDE.md is watched at the project root', () => {
    expect(watchFilesByParent(ROOT_RULE_FILES.map((file) => file.path))).toEqual([
      { dir: '', names: ['CLAUDE.md', 'AGENTS.md'] },
      { dir: '.github', names: ['copilot-instructions.md'] },
    ]);
  });
});
