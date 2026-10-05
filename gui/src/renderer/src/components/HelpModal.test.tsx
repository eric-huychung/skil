import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpModal from './HelpModal';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';
import { err, ok } from '../../../../../src/core/result.js';
import type { AppUpdate } from '../../../shared/app-update.js';

function renderHelp(appUpdate?: AppUpdate | Error, initialTab?: 'faq' | 'instructions' | 'about') {
  const inner = createTestBridge(createInMemoryEngine());
  const bridge = {
    ...inner,
    checkAppUpdate: async () =>
      appUpdate instanceof Error
        ? err(appUpdate)
        : ok(
            appUpdate ?? {
              current: '0.6.0',
              latest: '0.6.0',
              newer: false,
              url: 'https://github.com/eric-huychung/skil/releases',
            }
          ),
  };
  renderWithProviders(<HelpModal onClose={() => undefined} initialTab={initialTab} />, { bridge });
  return bridge;
}

describe('HelpModal', () => {
  it('opens on How it works, tabs first and centered in order', () => {
    renderHelp();

    const dialog = screen.getByRole('dialog', { name: 'Three problems. One map.' });
    expect(dialog).toHaveClass('skill-details-modal');
    expect(dialog).toHaveClass('help-about-modal');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['How it works', 'FAQs', 'About']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const tablist = screen.getByRole('tablist', { name: 'Help' });
    const title = screen.getByRole('heading', { name: 'Three problems. One map.' });
    expect(tablist.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
    expect(screen.getByText('Too many skills to pick from.')).toBeInTheDocument();
    expect(screen.getByText(/parks it/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'GitHub' })).not.toBeInTheDocument();
  });

  it('switches to FAQs with the landing questions', async () => {
    renderHelp();

    await userEvent.click(screen.getByRole('tab', { name: 'FAQs' }));
    expect(screen.getByRole('tab', { name: 'FAQs' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('dialog', { name: 'FAQs' })).toBeInTheDocument();
    expect(screen.getByText('What is Skil?')).toBeInTheDocument();
    expect(screen.getByText(/Do I need an account/i)).toBeInTheDocument();
    expect(screen.getByText(/I turned a skill off/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing phones home/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Vercel Analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/Discover fetches listings/i)).toBeInTheDocument();
  });

  it('keeps landing links, donate, and bug/idea on About', async () => {
    renderHelp();

    await userEvent.click(screen.getByRole('tab', { name: 'About' }));
    expect(screen.getByRole('dialog', { name: 'About Skil' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/eric-huychung/skil');
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', 'https://www.linkedin.com/in/huychung/');
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://www.skil.website/');
    expect(screen.getByRole('link', { name: 'Report a bug' })).toHaveAttribute(
      'href',
      'https://github.com/eric-huychung/skil/issues/new?template=bug.yml'
    );
    expect(screen.getByRole('link', { name: 'Suggest an idea' })).toHaveAttribute(
      'href',
      'https://github.com/eric-huychung/skil/issues/new?template=feature.yml'
    );
    expect(screen.getByRole('link', { name: 'Donate @echung03' })).toHaveAttribute(
      'href',
      'https://venmo.com/u/echung03'
    );
    expect(screen.queryByText('Find')).not.toBeInTheDocument();
    expect(screen.queryByText('Organize')).not.toBeInTheDocument();
  });

  it('says you are current after checking github', async () => {
    renderHelp();

    await userEvent.click(screen.getByRole('tab', { name: 'About' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check for update' }));
    expect(await screen.findByRole('status')).toHaveTextContent("You're on the latest.");
  });

  it('points at the newer release when github is ahead', async () => {
    renderHelp({
      current: '0.6.0',
      latest: '0.7.0',
      newer: true,
      url: 'https://github.com/eric-huychung/skil/releases/tag/v0.7.0',
    });

    await userEvent.click(screen.getByRole('tab', { name: 'About' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check for update' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('0.7.0 is out');
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://github.com/eric-huychung/skil/releases/tag/v0.7.0'
    );
  });

  it('lets you retry github when the check fails', async () => {
    renderHelp(new Error("couldn't reach github"));

    await userEvent.click(screen.getByRole('tab', { name: 'About' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check for update' }));
    expect(await screen.findByRole('status')).toHaveTextContent("Couldn't check. Try GitHub.");
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
  });

  it('can open straight on About', () => {
    renderHelp(undefined, 'about');

    expect(screen.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
  });
});
