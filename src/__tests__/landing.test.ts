import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const landing = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../public/index.html'),
  'utf-8'
);

describe('landing page', () => {
  it('is the Skil marketing site, not an API stub', () => {
    expect(landing).toMatch(/<title>Skil/i);
    expect(landing).toContain('Give your agent skills a');
    expect(landing).toContain('id="how-it-works"');
    expect(landing).toContain('id="preview"');
    expect(landing).toContain('id="features"');
    expect(landing).toContain('id="cli"');
    expect(landing).toContain('id="download"');
    expect(landing).not.toContain('There is no web app here');
    expect(landing).not.toContain('ContextKit API');
  });

  it('does not route Open app or Download into a product app', () => {
    expect(landing).not.toMatch(/href=["']\/app["']/);
    expect(landing).toContain('Download for Mac');
    expect(landing).toContain('Open app');
    expect(landing).toContain('github.com/eric-huychung/context_kit');
  });

  it('shows a wordmark and beta in the header, not the logo chip', () => {
    const header = landing.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    expect(header).toContain('wordmark-lg');
    expect(header).toContain('BETA');
    expect(header).not.toContain('logo-chip');
  });

  it('shows the same product sections as the ui-example landing', () => {
    expect(landing).toContain('Works with the agents you already use');
    expect(landing).toContain('.cursor');
    expect(landing).toContain('.claude');
    expect(landing).toContain('.windsurf');
    expect(landing).toContain('.agents');
    expect(landing).toContain('Connect a repo');
    expect(landing).toContain('No login required');
    expect(landing).toContain('Prefer the terminal?');
    expect(landing).toContain('skil scan');
    expect(landing).toContain('Apple Silicon');
  });
});
