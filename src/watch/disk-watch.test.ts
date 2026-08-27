import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiskWatch } from './disk-watch.js';

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
});
