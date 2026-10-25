import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EscrowContract } from '@/lib/api';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { escrow } from '@/test/fixtures';

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const base = (over: Partial<EscrowContract> = {}) =>
  escrow(7, {
    title: 'Website redesign',
    status: 'Funded',
    totalAmount: 1000,
    fundedAmount: 1000,
    milestones: [
      { index: 0, title: 'Design', amount: 300, released: false },
      { index: 1, title: 'Build', amount: 700, released: false },
    ],
    ...over,
  });

const deferred = () => {
  let resolve!: (r: Response) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const card = () => screen.getByRole('article');
const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

const renderWith = async (list: () => EscrowContract[], post: () => Promise<Response>) => {
  fetchMock.mockImplementation((_url: unknown, init?: RequestInit) =>
    init?.method === 'POST' ? post() : Promise.resolve(json({ data: list() })),
  );
  render(<EscrowDashboard />);
  await screen.findByRole('heading', { name: /#7 website redesign/i });
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EscrowDashboard optimistic actions', () => {
  it('shows a release immediately and keeps the server result', async () => {
    const pending = deferred();
    const released = base({
      releasedAmount: 300,
      milestones: [
        { index: 0, title: 'Design', amount: 300, released: true },
        { index: 1, title: 'Build', amount: 700, released: false },
      ],
    });
    await renderWith(() => [base()], () => pending.promise);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /release next milestone for escrow #7/i }));

    // Optimistic: released before the server has answered.
    await waitFor(() => expect(card()).toHaveTextContent('Released 300 / 1000'));
    expect(card()).toHaveAttribute('aria-busy', 'true');

    pending.resolve(json({ data: released }));
    await waitFor(() => expect(card()).toHaveAttribute('aria-busy', 'false'));
    expect(card()).toHaveTextContent('Released 300 / 1000');
    expect(screen.getByTestId('escrow-live-announcer')).toHaveTextContent('Milestone released');
  });

  it('rolls back on failure, shows a card-local error and retries', async () => {
    let fail = true;
    let state = base();
    await renderWith(
      () => [state],
      () => {
        if (fail) return Promise.resolve(json({ message: 'Insufficient funds' }, 409));
        state = base({
          releasedAmount: 300,
          milestones: [
            { index: 0, title: 'Design', amount: 300, released: true },
            { index: 1, title: 'Build', amount: 700, released: false },
          ],
        });
        return Promise.resolve(json({ data: state }));
      },
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /release next milestone for escrow #7/i }));

    const alert = await within(card()).findByRole('alert');
    expect(alert).toHaveAttribute('title', 'Insufficient funds');
    expect(card()).toHaveTextContent('Released 0 / 1000');

    fail = false;
    await user.click(within(alert).getByRole('button', { name: /retry failed action for escrow #7/i }));

    await waitFor(() => expect(within(card()).queryByRole('alert')).not.toBeInTheDocument());
    expect(card()).toHaveTextContent('Released 300 / 1000');
    expect(posts()).toHaveLength(2);
  });

  it('funds optimistically', async () => {
    const pending = deferred();
    await renderWith(() => [base({ status: 'Created', fundedAmount: 0 })], () => pending.promise);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /fund 1000 xlm for escrow #7/i }));
    await waitFor(() => expect(card()).toHaveTextContent('In escrow 1000 XLM'));

    pending.resolve(json({ data: base() }));
    await waitFor(() => expect(card()).toHaveAttribute('aria-busy', 'false'));
    expect(card()).toHaveTextContent('In escrow 1000 XLM');
  });

  it('does not double-submit while a release is in flight', async () => {
    const pending = deferred();
    await renderWith(() => [base()], () => pending.promise);
    const user = userEvent.setup();

    const release = screen.getByRole('button', { name: /release next milestone for escrow #7/i });
    await user.click(release);
    await user.click(release);

    expect(posts()).toHaveLength(1);
    pending.resolve(json({ data: base() }));
    await waitFor(() => expect(card()).toHaveAttribute('aria-busy', 'false'));
  });
});
