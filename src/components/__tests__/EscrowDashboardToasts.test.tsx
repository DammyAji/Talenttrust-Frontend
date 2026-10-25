import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EscrowContract } from '@/lib/api';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { escrow } from '@/test/fixtures';

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const contract = (over: Partial<EscrowContract> = {}) =>
  escrow(7, {
    title: 'Website redesign',
    token: 'USDC',
    totalAmount: 1000,
    milestones: [
      { index: 0, title: 'Design', amount: 300, released: false },
      { index: 1, title: 'Build', amount: 700, released: false },
    ],
    ...over,
  });

/** Every GET returns `list`; POSTs are answered by `post`. */
const renderWith = async (list: EscrowContract[], post: () => Promise<Response> = () => reply({ data: {} })) => {
  fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => (init?.method === 'POST' ? post() : reply({ data: list })));
  render(
    <ToastProvider>
      <EscrowDashboard />
    </ToastProvider>,
  );
  await screen.findByRole('heading', { name: 'Escrows' });
  await waitFor(() => expect(document.querySelector('.skeleton-cards')).toBeNull());
};

const toastAlerts = () => document.querySelector('.toast-stack[role="alert"]') as HTMLElement;
const toastStatus = () => document.querySelector('.toast-stack[role="status"]') as HTMLElement;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EscrowDashboard toasts', () => {
  it('shows a success toast after a successful release', async () => {
    await renderWith([contract({ fundedAmount: 1000 })]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /release next milestone for escrow #7/i }));

    expect(await screen.findByText('Escrow #7: milestone released')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/contracts/7/milestones/0/release'))).toBe(true);
  });

  it('shows an error toast with the API message after a 409', async () => {
    await renderWith([contract({ fundedAmount: 1000 })], () => reply({ message: 'Milestone already released' }, 409));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /release next milestone for escrow #7/i }));

    expect(await within(toastAlerts()).findByText('Milestone already released')).toBeInTheDocument();
    expect(screen.queryByText('Escrow #7: milestone released')).not.toBeInTheDocument();
  });

  it('shows an error toast when the action request hits a network error', async () => {
    await renderWith([contract({ fundedAmount: 1000 })], () => Promise.reject(new TypeError('Failed to fetch')));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /release next milestone for escrow #7/i }));

    expect(await within(toastAlerts()).findByText('Failed to fetch')).toBeInTheDocument();
  });

  it('shows a success toast and a View escrow action after creating an escrow', async () => {
    await renderWith([], () => reply({ data: contract() }));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Client address'), 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
    await user.type(screen.getByLabelText('Freelancer address'), 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV');
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    expect(await screen.findByText('Escrow #7 created')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View escrow' })).toBeInTheDocument();
  });

  it('shows a success toast after funding', async () => {
    await renderWith([contract()]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /fund 1000 usdc for escrow #7/i }));

    // The dashboard's own live region announces the same text, so look inside the toast stack.
    expect(await within(toastStatus()).findByText('Escrow #7 funded')).toBeInTheDocument();
  });

  it('shows a success toast after cancelling', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderWith([contract()]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Cancel escrow #7 / }));

    expect(await screen.findByText('Escrow #7 cancelled')).toBeInTheDocument();
  });

  it('shows a success toast after resolving a dispute', async () => {
    await renderWith([contract({ status: 'Disputed', fundedAmount: 1000 })]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /resolve 50\/50 for escrow #7/i }));

    expect(await screen.findByText('Escrow #7 resolved')).toBeInTheDocument();
  });

  it('rates with the star widget, sends the chosen rating and shows the new average', async () => {
    let list = [contract({ status: 'Completed', fundedAmount: 1000, releasedAmount: 1000, freelancer: 'GFREELANCERYYYY' })];
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        list = [{ ...list[0], reputationIssued: true }];
        return reply({ data: { address: 'GFREELANCERYYYY', completedContracts: 3, totalRating: 13, averageRating: 4.5 } });
      }
      return reply({ data: list });
    });
    render(
      <ToastProvider>
        <EscrowDashboard />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: '4 stars – Very good' }));
    expect(screen.getByRole('button', { name: 'Submit rating' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Submit rating' }));

    expect(await screen.findByText('Rating submitted for escrow #7')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ rating: 4 });
    const summary = await screen.findByText((content, el) => el?.tagName === 'P' && content.startsWith('New average:'));
    expect(summary.textContent).toContain('4.5');
    expect(summary.textContent).toContain('across 3');
    expect(screen.getByRole('link', { name: 'View reputation' }).getAttribute('href')).toContain('/reputation?address=GFREELANCERYYYY');
  });

  it('keeps submit disabled until a star is chosen', async () => {
    await renderWith([contract({ status: 'Completed', fundedAmount: 1000, releasedAmount: 1000 })]);

    expect(await screen.findByRole('button', { name: 'Submit rating' })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(0);
  });

  it('shows a 409 rating error inline and refreshes the list without a success toast', async () => {
    let list = [contract({ status: 'Completed', fundedAmount: 1000, releasedAmount: 1000 })];
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        list = [{ ...list[0], reputationIssued: true }];
        return reply({ error: 'already_rated', message: 'already_rated' }, 409);
      }
      return reply({ data: list });
    });
    render(
      <ToastProvider>
        <EscrowDashboard />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: '5 stars – Excellent' }));
    await user.click(screen.getByRole('button', { name: 'Submit rating' }));

    expect(await screen.findByText('already_rated')).toBeInTheDocument();
    expect(await screen.findByText('Rated. Thanks!')).toBeInTheDocument();
    expect(screen.queryByText(/Rating submitted/)).not.toBeInTheDocument();
  });

  it('shows a network error on rating inline', async () => {
    await renderWith([contract({ status: 'Completed', fundedAmount: 1000, releasedAmount: 1000 })], () =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: '1 star – Poor' }));
    await user.click(screen.getByRole('button', { name: 'Submit rating' }));

    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    expect(screen.queryByText(/Rating submitted/)).not.toBeInTheDocument();
  });
});
