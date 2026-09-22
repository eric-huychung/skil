import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MarketSync wiring', () => {
  it('laptop script and weekly Actions job share one classify path', () => {
    const laptop = readFileSync(join(process.cwd(), 'scripts/sync-market.ts'), 'utf8');
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/sync-market.yml'), 'utf8');
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
      functions?: Record<string, unknown>;
    };
    const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

    expect(laptop).toMatch(/new MarketSync\(/);
    expect(laptop).not.toContain('createMarketSync');
    expect(laptop).toContain('refreshActiveFields');
    expect(laptop).toContain('--classify-only');
    expect(laptop).toContain('AI_GATEWAY_API_KEY');
    expect(laptop).not.toContain('searchSkills');
    expect(example).toMatch(/^AI_GATEWAY_API_KEY=$/m);
    expect(example).not.toMatch(/^CRON_SECRET=/m);

    expect(vercel.crons ?? []).toEqual([]);
    expect(vercel.functions?.['api/cron/sync-market.ts']).toBeUndefined();
    expect(workflow).toMatch(/cron: ['"]0 0 \* \* 0['"]/);
    expect(workflow).toContain('sync-market -- --classify-only');
    expect(workflow).toContain('secrets.AI_GATEWAY_API_KEY');
    expect(workflow).toContain('secrets.NEXT_PUBLIC_SUPABASE_URL');
    expect(workflow).toContain('secrets.SUPABASE_SERVICE_ROLE_KEY');
    expect(workflow).not.toContain('/api/cron/sync-market');
    expect(workflow).not.toContain('secrets.CRON_SECRET');
  });
});
