import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SyncCleanupModal, { syncBannerText } from './SyncCleanupModal';
import type { SyncAudit, SyncRow } from '../../../shared/ipc';

function audit(rows: Partial<SyncRow>[]): SyncAudit {
  const full = rows.map((row, i) => ({
    kind: 'skill' as const,
    id: row.id ?? `id-${i}`,
    path: row.path ?? `.cursor/skills/${row.id ?? `id-${i}`}`,
    status: row.status ?? 'needs-import',
    hashHere: row.hashHere ?? 'aaa',
    ...row,
  }));
  return {
    rows: full,
    needsImportCount: full.filter((row) => row.status === 'needs-import').length,
    readyCount: full.filter((row) => row.status === 'ready-to-remove').length,
    driftCount: full.filter((row) => row.status === 'drift').length,
  };
}

describe('syncBannerText', () => {
  it('names leftover copies without jargon', () => {
    expect(syncBannerText(audit([{ status: 'needs-import' }]))).toBe('1 leftover');
    expect(
      syncBannerText(audit([{ status: 'needs-import' }, { status: 'ready-to-remove' }]))
    ).toBe('2 leftovers');
  });

  it('says conflict when every leftover is a conflict', () => {
    expect(syncBannerText(audit([{ status: 'drift' }]))).toBe('1 conflict');
    expect(syncBannerText(audit([{ status: 'drift' }, { status: 'drift' }]))).toBe('2 conflicts');
  });

  it('joins leftover and conflict counts when mixed', () => {
    expect(
      syncBannerText(
        audit([
          { status: 'needs-import' },
          { status: 'ready-to-remove' },
          { status: 'drift' },
          { status: 'drift' },
        ])
      )
    ).toBe('4 leftovers · 2 conflicts');
  });
});

describe('SyncCleanupModal remove confirm', () => {
  it('says why cleanup exists', () => {
    render(
      <SyncCleanupModal
        audit={audit([{ id: 'tdd', status: 'ready-to-remove', path: '.cursor/skills/tdd' }])}
        busy={false}
        error={null}
        onClose={() => {}}
        onImport={() => {}}
        onRemove={() => {}}
        onResolveDrift={() => {}}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Cleanup' })).toHaveAccessibleDescription(
      'Drop extra copies so agents read from .agents and .claude.'
    );
  });

  it('asks before remove with deprecated folder hint', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <SyncCleanupModal
        audit={audit([{ id: 'tdd', status: 'ready-to-remove', path: '.cursor/skills/tdd' }])}
        busy={false}
        error={null}
        onClose={() => {}}
        onImport={() => {}}
        onRemove={onRemove}
        onResolveDrift={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove leftovers' }));
    const confirm = screen.getByRole('dialog', { name: /Remove 1 leftover/ });
    expect(within(confirm).getByText(/\.skil\/deprecated\//)).toBeInTheDocument();
    expect(within(confirm).getByText(/check there if you need to restore/i)).toBeInTheDocument();

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove leftovers' }));
    await user.click(
      within(screen.getByRole('dialog', { name: /Remove 1 leftover/ })).getByRole('button', {
        name: 'Remove leftovers',
      })
    );
    expect(onRemove).toHaveBeenCalledWith(['.cursor/skills/tdd']);
  });
});
