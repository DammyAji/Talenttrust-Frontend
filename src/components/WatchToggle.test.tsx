import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import { WatchToggle } from '@/components/WatchToggle';
import { NotificationBell } from '@/components/NotificationBell';
import type { EscrowContract } from '@/lib/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/contracts' }));

const contract: EscrowContract = {
  id: 42,
  title: 'Website',
  client: 'GCLIENT',
  freelancer: 'GFREE',
  token: 'XLM',
  milestones: [{ index: 0, title: 'A', amount: 100, released: false }],
  totalAmount: 100,
  fundedAmount: 0,
  releasedAmount: 0,
  status: 'Created',
  reputationIssued: false,
};

let tick: () => void = () => {};

beforeEach(() => {
  localStorage.clear();
  tick = () => {};
});

const renderApp = (fetchContract: () => Promise<EscrowContract>) =>
  render(
    <NotificationsProvider
      poller={{
        fetchContract,
        intervalMs: 1000,
        isVisible: () => true,
        setIntervalFn: ((fn: () => void) => {
          tick = fn;
          return 0 as never;
        }) as never,
        clearIntervalFn: () => {},
      }}
    >
      <WatchToggle contract={contract} />
      <NotificationBell />
    </NotificationsProvider>,
  );

describe('WatchToggle', () => {
  it('reflects watch state through aria-pressed', async () => {
    renderApp(async () => contract);
    const toggle = await screen.findByRole('button', { name: /^watch escrow 42$/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole('button', { name: /unwatch escrow 42/i })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('creates a notification when a watched escrow changes between polls', async () => {
    const funded: EscrowContract = { ...contract, status: 'Funded', fundedAmount: 100 };
    renderApp(async () => funded);

    const toggle = await screen.findByRole('button', { name: /^watch escrow 42$/i });
    await userEvent.click(toggle);

    tick();
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await userEvent.click(bell);
    expect(screen.getByText(/^escrow funded$/i)).toBeInTheDocument();
  });
});
