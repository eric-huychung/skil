import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('createMarketSync wiring', () => {
  it('laptop script and weekly cron both build MarketSync through createMarketSync', () => {
    const laptop = readFileSync(join(process.cwd(), 'scripts/sync-market.ts'), 'utf8');
    const cron = readFileSync(join(process.cwd(), 'api/cron/sync-market.ts'), 'utf8');

    expect(laptop).toContain('createMarketSync');
    expect(cron).toContain('createMarketSync');
    expect(laptop).not.toMatch(/new MarketSync\(/);
    expect(cron).not.toMatch(/new MarketSync\(/);
    expect(laptop).toContain('refreshActiveFields');
  });
});
