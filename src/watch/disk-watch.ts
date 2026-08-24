export type DiskWatchOptions = {
  debounceMs?: number;
  muteMs?: number;
  now?: () => number;
  onFlush: (paths: string[]) => void;
};

/**
 * Thin debounce / mute / skip-.git helper. Not a second deep module.
 * Callers (GUI main) start a real watcher and forward paths into `handleEvent`.
 */
export class DiskWatch {
  private readonly debounceMs: number;
  private readonly muteMs: number;
  private readonly now: () => number;
  private readonly onFlush: (paths: string[]) => void;
  private readonly mutedUntil = new Map<string, number>();
  private pending: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: DiskWatchOptions) {
    this.debounceMs = options.debounceMs ?? 500;
    this.muteMs = options.muteMs ?? 1000;
    this.now = options.now ?? Date.now;
    this.onFlush = options.onFlush;
  }

  mute(paths: string[]): void {
    const until = this.now() + this.muteMs;
    for (const path of paths) {
      this.mutedUntil.set(normalizeWatchPath(path), until);
    }
  }

  handleEvent(path: string): void {
    if (isGitPath(path)) {
      return;
    }
    this.pending.push(normalizeWatchPath(path));
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = [];
  }

  private flush(): void {
    this.timer = null;
    const at = this.now();
    const due = [...new Set(this.pending)].filter((path) => {
      const until = this.mutedUntil.get(path);
      return until === undefined || at >= until;
    });
    this.pending = [];
    if (due.length > 0) {
      this.onFlush(due);
    }
  }
}

function normalizeWatchPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function isGitPath(path: string): boolean {
  return normalizeWatchPath(path).split('/').includes('.git');
}
