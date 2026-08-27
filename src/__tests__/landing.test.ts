import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const webDir = join(root, 'web');
const publicDir = join(root, 'public');

function readWeb(...parts: string[]): string {
  return readFileSync(join(webDir, ...parts), 'utf-8');
}

function readLandingSources(): string {
  const landingDir = join(webDir, 'components/landing');
  const files = readdirSync(landingDir)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => readFileSync(join(landingDir, name), 'utf-8'));
  return [
    readWeb('app/page.tsx'),
    readWeb('app/layout.tsx'),
    readWeb('next.config.mjs'),
    ...files,
  ].join('\n');
}

describe('landing page', () => {
  it('is a Next.js marketing site, not an API stub or product mock', () => {
    const landing = readLandingSources();
    const layout = readWeb('app/layout.tsx');
    const page = readWeb('app/page.tsx');

    expect(layout).toMatch(/title:\s*'Skil/i);
    expect(page).toContain("from '@/components/landing/hero'");
    expect(landing).toContain('Give your agent skills a');
    expect(landing).toContain('id="how-it-works"');
    expect(landing).toContain('id="preview"');
    expect(landing).toContain('id="features"');
    expect(landing).toContain('id="cli"');
    expect(landing).toContain('id="download"');
    expect(landing).not.toContain('There is no web app here');
    expect(landing).not.toContain('ContextKit API');
    expect(existsSync(join(webDir, 'app/app'))).toBe(false);
    expect(existsSync(join(webDir, 'components/product'))).toBe(false);
  });

  it('does not route Open app or Download into a product app', () => {
    const landing = readLandingSources();
    expect(landing).not.toMatch(/href=["']\/app["']/);
    expect(landing).toContain('Download for Mac');
    expect(landing).toContain('Open app');
    expect(landing).toContain('github.com/eric-huychung/skil');
  });

  it('shows a wordmark and beta in the header, not the logo chip', () => {
    const header = readWeb('components/landing/site-nav.tsx');
    expect(header).toContain('Skil');
    expect(header).toContain('wordmark');
    expect(header).toContain('BETA');
    expect(header).not.toContain('logo-chip');
    expect(header).not.toContain("from '@/components/brand/logo'");
  });

  it('shows the same product sections as the ui-example landing', () => {
    const landing = readLandingSources();
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

  it('uses the same dark purple brand in light and dark', () => {
    const brand = readFileSync(join(publicDir, 'brand.css'), 'utf-8');
    const light = brand.match(/:root\s*\{[\s\S]*?--color-brand:\s*([^;]+);/)?.[1]?.trim();
    const dark = brand.match(/\.dark\s*\{[\s\S]*?--color-brand:\s*([^;]+);/)?.[1]?.trim();
    expect(light).toBe('#8b5cf6');
    expect(dark ?? light).toBe('#8b5cf6');
  });

  it('loads shared theme config from brand.css and theme.css', () => {
    const webGlobals = readWeb('app/globals.css');
    const guiGlobals = readFileSync(
      join(root, 'gui/src/renderer/src/styles/globals.css'),
      'utf-8'
    );
    expect(webGlobals).toContain("import '../../public/brand.css'");
    expect(webGlobals).toContain("import '../../public/theme.css'");
    expect(webGlobals).not.toContain('--color-brand:');
    expect(guiGlobals).toContain("import '../../../../../public/brand.css'");
    expect(guiGlobals).toContain("import '../../../../../public/theme.css'");
    const theme = readFileSync(join(publicDir, 'theme.css'), 'utf-8');
    expect(theme).toContain('.wordmark');
    expect(theme).toContain('-webkit-text-stroke');
  });

  it('static-exports so Vercel can keep serving the site next to api/', () => {
    const nextConfig = readWeb('next.config.mjs');
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf-8');
    expect(nextConfig).toMatch(/output:\s*['"]export['"]/);
    expect(vercel).toContain('"outputDirectory": "web/out"');
    expect(existsSync(join(publicDir, 'index.html'))).toBe(false);
  });
});
