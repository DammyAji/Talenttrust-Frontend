import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useContractStatus } = vi.hoisted(() => ({
  useContractStatus: vi.fn(),
}));

vi.mock('@/components/ContractStatusProvider', () => ({ useContractStatus }));

import { ContractStatusPill } from '@/components/ContractStatusPill';
import { PausedBanner } from '@/components/PausedBanner';
import { explorerUrl } from '@/lib/site';

const refresh = vi.fn();

function mockStatus(status: 'loading' | 'operational' | 'paused' | 'unknown', version: number | null = null) {
  useContractStatus.mockReturnValue({ status, version, checkedAt: null, refresh });
}

describe('PausedBanner', () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  it('renders nothing while operational', () => {
    mockStatus('operational', 1);
    const { container } = render(<PausedBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains disabled actions and links to the contract when paused', () => {
    mockStatus('paused', 2);
    render(<PausedBanner />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveTextContent(/deposits, milestone releases, disputes and cancellations/i);

    const link = screen.getByRole('link', { name: /view contract on stellar\.expert/i });
    expect(link).toHaveAttribute('href', explorerUrl);
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('ContractStatusPill', () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  it('shows the contract version and operational state politely', () => {
    mockStatus('operational', 1);
    render(<ContractStatusPill />);

    expect(screen.getByRole('status')).toHaveTextContent('Contract v1 · Operational');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a paused state', () => {
    mockStatus('paused', 1);
    render(<ContractStatusPill />);

    expect(screen.getByRole('status')).toHaveTextContent('Contract v1 · Paused');
  });

  it('shows a muted unavailable pill with a keyboard-accessible retry', async () => {
    const user = userEvent.setup();
    mockStatus('unknown');
    render(<ContractStatusPill />);

    expect(screen.getByRole('status')).toHaveTextContent('Status unavailable');

    const retry = screen.getByRole('button', { name: /retry contract status check/i });
    await user.tab();
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
