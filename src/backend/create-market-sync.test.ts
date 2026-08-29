import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('createMarketSync wiring', () => {
  it('laptop script and weekly cron share one classify path', () => {
    const laptop = readFileSync(join(process.cwd(), 'scripts/sync-market.ts'), 'utf8');
    const cron = readFileSync(join(process.cwd(), 'api/cron/sync-market.ts'), 'utf8');
    const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

    expect(laptop).toContain('createMarketSync');
    expect(cron).toContain('createMarketSync');
    expect(laptop).not.toMatch(/new MarketSync\(/);
    expect(cron).not.toMatch(/new MarketSync\(/);
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
