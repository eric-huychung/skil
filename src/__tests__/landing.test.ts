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
  const routePages = [
    'app/page.tsx',
    'app/leaderboard/page.tsx',
    'app/cli/page.tsx',
    'app/app/page.tsx',
    'app/about/page.tsx',
    'app/blog/page.tsx',
    'app/faq/page.tsx',
    'app/legal/page.tsx',
  ];
  return [
    ...routePages.map((path) => readWeb(path)),
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
    expect(landing).toContain('More skills, but');
    expect(landing).toContain('Find skills, organize them, and kill the dead ones');
    expect(landing).toContain('Free and open source. No Login');
    expect(landing).toContain('WHAT&apos;S NEW');
    expect(landing).toContain('Beta release');
    expect(landing).toContain('macOS App + CLI + Leaderboard');
    expect(landing).toContain('Website release');
    expect(landing).toContain('About + Blog + FAQs');
    expect(landing).toContain('GitHub setup');
    expect(landing).toContain('.dmg packages + Releases');
    expect(landing).toContain('id="how-it-works"');
    expect(landing).toContain('skil — desktop app');
    expect(landing).toContain('id="features"');
    expect(landing).toContain('id="cli"');
    expect(landing).toContain('id="download"');
    expect(landing).not.toContain('There is no web app here');
    expect(landing).not.toContain('ContextKit API');
    expect(existsSync(join(webDir, 'app/app/page.tsx'))).toBe(true);
    expect(existsSync(join(webDir, 'components/product'))).toBe(false);
  });

  it('opts html into Next.js route-transition scroll handling while keeping in-page smooth scroll', () => {
    const layout = readWeb('app/layout.tsx');
    const globals = readWeb('app/globals.css');

    expect(globals).toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth/s);
    expect(layout).toMatch(/<html[\s\S]*data-scroll-behavior="smooth"/);
  });

  it('routes marketing pages separately from a logged-in product app', () => {
    const landing = readLandingSources();
    expect(landing).toContain("href: '/leaderboard'");
    expect(landing).toContain("href: '/cli'");
    expect(landing).toContain("href: '/app'");
    expect(landing).toContain('Download for Mac');
    expect(landing).toContain('github.com/eric-huychung/skil');
    expect(existsSync(join(webDir, 'components/product'))).toBe(false);
  });

  it('puts product, resources, and social in the site footer like a real marketing site', () => {
    const footer = readWeb('components/landing/site-footer.tsx');
    const links = readWeb('lib/site-links.ts');
    const globals = readWeb('app/globals.css');

    expect(footer).toContain("from '@/lib/site-links'");
    expect(footer).not.toContain('lucide-react');
    expect(footer).toContain('Product');
    expect(footer).toContain('Resources');
    expect(footer).toContain('Social');
    expect(links).toContain("label: 'About Skil'");
    expect(links).toContain("href: '/about'");
    expect(links).toContain("href: '/leaderboard'");
    expect(links).toContain("href: '/cli'");
    expect(links).toContain("href: '/app'");
    expect(links).toContain("label: 'Report a bug'");
    expect(links).toContain("label: 'Suggest an idea'");
    expect(links).toContain("href: '/blog'");
    expect(links).toContain("href: '/faq'");
    expect(links).toContain("label: 'FAQs'");
    expect(links).toContain("href: '/legal'");
    expect(links).toContain("label: 'Legal'");
    expect(links).toContain('issues/new?template=bug.yml');
    expect(links).toContain('issues/new?template=feature.yml');
    expect(links).toContain('linkedin.com/in/huychung');
    expect(links).toContain("label: 'LinkedIn'");
    expect(links).toContain("label: 'GitHub'");
    expect(globals).toContain('.footer-link');
    expect(globals).toContain('.footer-link:hover');
    expect(existsSync(join(webDir, 'components/landing/footer-cta.tsx'))).toBe(
      false,
    );
    const footerHover = globals.slice(globals.indexOf('.footer-link:hover'));
    expect(footerHover.slice(0, 280)).toContain('var(--nav-hover)');
    expect(footerHover.slice(0, 280)).not.toContain('var(--brand)');
  });

  it('ships about, blog, faq, and legal as real pages instead of empty stubs', () => {
    const about = readWeb('app/about/page.tsx');
    const blog = readWeb('app/blog/page.tsx');
    const faq = readWeb('app/faq/page.tsx');
    const legal = readWeb('app/legal/page.tsx');
    const pages = `${about}\n${blog}\n${faq}\n${legal}`;

    expect(existsSync(join(webDir, 'app/about/page.tsx'))).toBe(true);
    expect(existsSync(join(webDir, 'app/blog/page.tsx'))).toBe(true);
    expect(existsSync(join(webDir, 'app/faq/page.tsx'))).toBe(true);
    expect(existsSync(join(webDir, 'app/legal/page.tsx'))).toBe(true);
    expect(about).toContain('About Skil');
    expect(about).toContain('.skil/state.json');
    expect(blog).toContain('Coming soon');
    expect(blog).toContain('How we file skills onto /build');
    expect(faq).toContain('What is Skil?');
    expect(faq).toContain('I turned a skill off');
    expect(faq).toContain('template=bug.yml');
    expect(faq).not.toContain('Nothing phones home');
    expect(faq).toContain('Vercel Analytics');
    expect(faq).toContain('Discover');
    expect(legal).toContain('MIT');
    expect(legal).toContain('unsigned');
    expect(legal).toContain('skills.sh');
    expect(legal).toContain('No login');
    expect(legal).toContain('Vercel Analytics');
    expect(legal).toContain('Discover');
    expect(pages.toLowerCase()).not.toContain('lorem ipsum');
    expect(pages.toLowerCase()).not.toContain('todo');
    expect(pages.toLowerCase()).not.toContain('placeholder text');
  });

  it('shows a wordmark and beta in the header, not the logo chip', () => {
    const header = readWeb('components/landing/site-nav.tsx');
    expect(header).toContain('Skil');
    expect(header).toContain('wordmark');
    expect(header).toContain('BETA');
    expect(header).not.toContain('logo-chip');
    expect(header).not.toContain("from '@/components/brand/logo'");
  });

  it('keeps the home page focused on product story sections', () => {
    const home = readWeb('app/page.tsx');
    expect(home).toContain("from '@/components/landing/hero'");
    expect(home).toContain("from '@/components/landing/how-it-works'");
    expect(home).toContain("from '@/components/landing/supported-tools'");
    expect(home).toContain("from '@/components/landing/feature-grid'");
    expect(home).not.toContain("from '@/components/landing/discover'");
    expect(home).not.toContain("from '@/components/landing/cli-install'");
  });

  it('scales hero type and CTAs without changing nav button size', () => {
    const hero = readWeb('components/landing/hero.tsx');
    const cta = readWeb('components/landing/download-cta.tsx');
    const nav = readWeb('components/landing/site-nav.tsx');
    const globals = readWeb('app/globals.css');

    expect(hero).toContain('lg:text-[5rem]');
    expect(hero).toContain('text-xl');
    expect(hero).toContain('lg:grid-cols-[minmax(0,1fr)_16rem]');
    expect(hero).not.toContain('max-w-[16ch]');
    expect(hero).toContain("from '@/components/landing/hero-product'");
    expect(cta).toContain('hero-cta');
    expect(nav).not.toContain('hero-cta');
    expect(globals).toContain('.hero-cta .primary-button');
    expect(globals).toContain('.hero-cta .cli-install-chip');
  });

  it('maps each how-it-works problem to a current-product preview', () => {
    const how = readWeb('components/landing/how-it-works.tsx');
    const preview = readWeb('components/landing/app-preview.tsx');
    const data = readFileSync(join(webDir, 'lib/preview-data.ts'), 'utf-8');

    expect(how).toContain("scene: 'discover'");
    expect(how).toContain("scene: 'commands'");
    expect(how).toContain("scene: 'doctor'");
    expect(preview).toContain('Discover');
    expect(preview).toContain('Top');
    expect(preview).toContain('Doctor');
    expect(preview).toContain('2 warnings');
    expect(preview).toContain('0 warnings');
    expect(preview).toContain('340 tokens');
    expect(preview).not.toContain('340 tok · 0 warn');
    expect(data).toContain('Always loaded');
    expect(data).toContain('leaderboardPreview');
    expect(data).toContain('syncPreview');
  });

  it('puts a Sync-page product graphic under the hero, like the app', () => {
    const hero = readWeb('components/landing/hero.tsx');
    const product = readWeb('components/landing/hero-product.tsx');
    const globals = readWeb('app/globals.css');
    const data = readWeb('lib/preview-data.ts');

    expect(hero).toContain('<HeroProduct />');
    expect(product).toContain('aria-hidden="true"');
    expect(product).toContain('Sync');
    expect(product).toContain('Recent folders');
    expect(product).toContain('Project folder');
    expect(product).toContain('syncPreview.skills');
    expect(product).toContain('syncPreview.commands');
    expect(product).toContain('syncPreview.rules');
    expect(product).not.toContain('Skills found');
    expect(product).not.toContain('Skills by source');
    expect(product).toContain('max-w-6xl');
    expect(product).toContain('hero-product-cli');
    expect(product).toContain('zsh — skil');
    expect(product).toContain('cliPreview');
    expect(data).toContain('skil scan');
    expect(data).toContain('skil doctor');
    expect(globals).toContain('.hero-product-stage');
    expect(globals).toContain('.hero-product-window');
    expect(globals).toContain('.hero-product-cli');
    expect(globals).toContain('background: var(--background)');
    expect(globals).not.toContain('mask-image');
  });

  it('shows product sections across the marketing routes', () => {
    const landing = readLandingSources();
    expect(landing).toContain('Works with the agents you already use');
    expect(landing).toContain('.cursor');
    expect(landing).toContain('.claude');
    expect(landing).toContain('.codex');
    expect(landing).toContain('.agents');
    expect(landing).toContain('Connect a repo');
    expect(landing).toContain('No login');
    expect(landing).toContain('Prefer the terminal?');
    expect(landing).toContain('skil scan');
    expect(landing).toContain('Apple Silicon');
  });

  it('walks through the unsigned dmg scare and the curl way around it', () => {
    const landing = readLandingSources();
    const appPage = readWeb('app/app/page.tsx');
    const downloadCta = readWeb('components/landing/download-cta.tsx');

    expect(appPage).toContain("from '@/components/landing/app-download'");
    expect(landing).toContain('macOS will yell');
    expect(landing).toContain('Open Anyway');
    expect(landing).toContain('Privacy & Security');
    expect(landing).toContain('unsigned');
    expect(landing).toContain('quarantine');
    expect(landing).toContain('curl -L -o ~/Downloads/skil.dmg');
    expect(landing).toContain('xattr -cr /Applications/Skil.app');
    expect(landing).toContain(
      'https://github.com/eric-huychung/skil/releases/latest/download/Skil-arm64.dmg',
    );
    expect(landing).toContain(
      'https://github.com/eric-huychung/skil/releases/latest/download/Skil-x64.dmg',
    );
    expect(downloadCta).toContain('href="/app"');
  });

  it('installs the CLI from the repo, not a fake brew tap', () => {
    const landing = readLandingSources();
    const cliPage = readWeb('app/cli/page.tsx');

    expect(cliPage).toContain("from '@/components/landing/cli-install'");
    expect(landing).toContain('git clone https://github.com/eric-huychung/skil.git');
    expect(landing).toContain('cd skil && npm install && npm run build');
    expect(landing).toContain('npx skil --help');
    expect(landing).toContain('your project folder');
    expect(landing).not.toContain('brew install skil');
  });

  it('lists every CLI verb, grouped like the README', () => {
    const cliPage = readWeb('app/cli/page.tsx');
    const verbs = [
      'skil search',
      'skil search --trending',
      'skil suggest',
      'skil install',
      'skil scan',
      'skil skills',
      'skil skills enable',
      'skil skills disable',
      'skil create',
      'skil list',
      'skil add',
      'skil remove',
      'skil enable',
      'skil disable',
      'skil delete',
      'skil rules',
      'skil rules enable',
      'skil rules disable',
      'skil doctor',
      'skil usage',
    ];
    for (const cmd of verbs) {
      expect(cliPage, cmd).toContain(cmd);
    }
    expect(cliPage).toContain('Find');
    expect(cliPage).toContain('Skills');
    expect(cliPage).toContain('Commands');
    expect(cliPage).toContain('Rules');
    expect(cliPage).toContain('Eval');
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
    expect(theme).toContain('--nav-hover:');
    expect(webGlobals).toContain('background-color: var(--nav-hover)');
    expect(webGlobals).not.toContain('#7e6991');
  });

  it('static-exports so Vercel can keep serving the site next to api/', () => {
    const nextConfig = readWeb('next.config.mjs');
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf-8');
    expect(nextConfig).toMatch(/output:\s*['"]export['"]/);
    expect(vercel).toContain('"outputDirectory": "web/out"');
    const vercelConfig = JSON.parse(vercel) as {
      functions?: Record<string, { includeFiles?: unknown }>;
    };
    for (const [name, fn] of Object.entries(vercelConfig.functions ?? {})) {
      expect(typeof fn.includeFiles, `${name} includeFiles must be a glob string`).toBe('string');
    }
    expect(existsSync(join(publicDir, 'index.html'))).toBe(false);
  });

  it('paginates the leaderboard and uses the GUI row-hit + portal preview pattern', () => {
    const discover = readWeb('components/landing/discover.tsx');
    const webGlobals = readWeb('app/globals.css');
    expect(discover).toContain('const PAGE_SIZE = 25');
    expect(discover).toContain('library-skill-hit');
    expect(discover).toContain('createPortal');
    expect(discover).toContain('skill-details-modal');
    expect(discover).toContain('skill-md-preview');
    expect(discover).toContain('aria-label="Pages"');
    expect(discover).toContain('Page {safePage + 1} of {pageCount}');
    expect(webGlobals).toContain('.skill-details-modal');
    expect(webGlobals).toContain('width: min(94vw, 960px)');
  });
});
