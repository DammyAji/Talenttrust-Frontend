import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import type { EscrowContract } from '@/lib/api';

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const contract = (id: number): EscrowContract => ({
  id,
  title: `Job ${id}`,
  client: 'GCLIENT',
  freelancer: 'GFREE',
  token: 'XLM',
  milestones: [{ index: 0, title: 'Design', amount: 100, released: false }],
  totalAmount: 100,
  fundedAmount: 0,
  releasedAmount: 0,
  status: 'Created',
  reputationIssued: false,
});

const renderDash = () =>
  render(
    <NotificationsProvider
      poller={{ fetchContract: async () => contract(1), setIntervalFn: (() => 0) as never, clearIntervalFn: () => {} }}
    >
      <EscrowDashboard />
    </NotificationsProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('EscrowDashboard', () => {
  it('renders escrows on the success path with a watch toggle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: [contract(1), contract(2)] })));
    renderDash();
    expect(await screen.findByText(/Job 1/)).toBeInTheDocument();
    expect(screen.getByText(/Job 2/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /watch escrow/i })).toHaveLength(2);
  });

  it('shows a friendly network error without raw fetch text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderDash();
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(/could not reach/i);
    expect(alert.textContent ?? '').not.toMatch(/Failed to fetch/);
  });

  it('shows a friendly http error for a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'invalid_status', message: 'nope' }, 409)));
    renderDash();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not allowed/i);
  });

  it('shows the empty state when there are no escrows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: [] })));
    renderDash();
    expect(await screen.findByText(/no escrows yet/i)).toBeInTheDocument();
  });

  it('blocks invalid input via native form validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: [] })));
    renderDash();
    await screen.findByText(/no escrows yet/i);
    await userEvent.clear(screen.getByLabelText(/client address/i));
    await userEvent.click(screen.getByRole('button', { name: /create escrow/i }));
    await waitFor(() => expect(screen.getByLabelText(/client address/i)).toBeInvalid());
  });
});
