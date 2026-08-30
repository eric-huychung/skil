import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MarketSync wiring', () => {
  it('laptop script and weekly cron construct MarketSync directly and share one classify path', () => {
    const laptop = readFileSync(join(process.cwd(), 'scripts/sync-market.ts'), 'utf8');
    const cron = readFileSync(join(process.cwd(), 'api/cron/sync-market.ts'), 'utf8');
    const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

    expect(laptop).toMatch(/new MarketSync\(/);
    expect(cron).toMatch(/new MarketSync\(/);
    expect(laptop).not.toContain('createMarketSync');
    expect(cron).not.toContain('createMarketSync');
    expect(laptop).toContain('refreshActiveFields');
    expect(laptop).toContain('--classify-only');
    expect(cron).toContain('handleCronSyncRequest');
    expect(laptop).toContain('AI_GATEWAY_API_KEY');
    expect(cron).toContain('AI_GATEWAY_API_KEY');
    expect(laptop).not.toContain('searchSkills');
    expect(cron).not.toContain('searchSkills');
    expect(example).toMatch(/^AI_GATEWAY_API_KEY=$/m);
  });
});
