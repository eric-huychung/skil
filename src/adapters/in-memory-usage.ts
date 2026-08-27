import type { IUsageCollector } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { UsageEvent } from '../types/index.js';

/**
 * In-memory stand-in for UsageCollector. Tests seed events; production
 * uses ClaudeUsageCollector. Unknown skill ids are omitted.
 */
export class InMemoryUsageCollector implements IUsageCollector {
  private events: UsageEvent[] = [];
  private collectError: Error | null = null;

  async collect(opts: { projectRoot: string; skillIds: string[] }): Promise<Result<UsageEvent[]>> {
    if (this.collectError) {
      return err(this.collectError);
    }
    const wanted = new Set(opts.skillIds);
    return ok(this.events.filter((event) => wanted.has(event.skillId)));
  }

  seed(events: UsageEvent[]): void {
    this.events = [...events];
  }

  setCollectError(error: Error | null): void {
    this.collectError = error;
  }
}
