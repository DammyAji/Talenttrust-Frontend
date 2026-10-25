import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EscrowContract } from '@/lib/api';
import { SwrProvider } from '@/lib/swr';
import { useContracts, useReputation } from './useContracts';
import { useEscrowMutation } from './useEscrowMutation';

const fetchMock = vi.fn();

const contract = (over: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 7,
  title: 'Website redesign',
  client: 'GCLIENTXXXX',
  freelancer: 'GFREELANCERYYYY',
  token: 'USDC',
  milestones: [{ index: 0, title: 'Design', amount: 300, released: false }],
  totalAmount: 300,
  fundedAmount: 300,
  releasedAmount: 0,
  status: 'Funded',
  reputationIssued: false,
  ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
const fail = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ message }),
} as Response);

const getCalls = () =>
  fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET');

function ListConsumer({ label = 'list' }: { label?: string }) {
  const { contracts, error, isValidating } = useContracts();
  if (error) return <div>{label}: error: {error.message}</div>;
  if (!contracts) return <div>{label}: loading</div>;
  return (
    <div>
      <div>
        {label}:{' '}
        {contracts.map((c) => `${c.id}:${c.title}:${c.status}:${c.releasedAmount}`).join(', ') || 'empty'}
      </div>
      {isValidating && <div>{label}: updating</div>}
    </div>
  );
}

function ReputationConsumer({ address }: { address: string | null }) {
  const { reputation, error, isLoading } = useReputation(address);
  if (isLoading) return <div>rep: loading</div>;
  if (error) return <div>rep: error: {error.message}</div>;
  if (!reputation) return <div>rep: none</div>;
  return <div>rep: {reputation.averageRating}</div>;
}

function MutationHarness() {
  const { run } = useEscrowMutation();
  return (
    <button type="button" onClick={() => run(7, 'release', { milestoneIndex: 0 })}>
      release
    </button>
  );
}

describe('SWR data layer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('dedupes two concurrent consumers of the contracts list into one fetch', async () => {
    fetchMock.mockResolvedValue(ok({ data: [contract()] }));

    render(
      <SwrProvider value={{ provider: () => new Map() }}>
        <ListConsumer label="a" />
        <ListConsumer label="b" />
      </SwrProvider>,
    );

    await screen.findByText(/a: 7:Website redesign/);
    expect(screen.getByText(/b: 7:Website redesign/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes no request while the reputation key is null', async () => {
    render(
      <SwrProvider value={{ provider: () => new Map() }}>
        <ReputationConsumer address={null} />
      </SwrProvider>,
    );

    await screen.findByText('rep: none');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry 4xx responses', async () => {
    fetchMock.mockResolvedValue(fail(404, 'Not found'));

    render(
      <SwrProvider value={{ provider: () => new Map(), errorRetryInterval: 20 }}>
        <ListConsumer />
      </SwrProvider>,
    );

    await screen.findByText(/error: Not found/);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries network errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    render(
      <SwrProvider value={{ provider: () => new Map(), errorRetryInterval: 20 }}>
        <ListConsumer />
      </SwrProvider>,
    );

    await screen.findByText(/error: Failed to fetch/);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('revalidates the list on visibilitychange and shows an Updating indicator', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [contract({ title: 'Before' })] }));
    render(
      <SwrProvider value={{ provider: () => new Map(), dedupingInterval: 0, focusThrottleInterval: 0 }}>
        <ListConsumer />
      </SwrProvider>,
    );
    await screen.findByText(/7:Before/);

    let resolveSecond!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveSecond = resolve; }),
    );

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(await screen.findByText('list: updating')).toBeInTheDocument();

    resolveSecond(ok({ data: [contract({ title: 'After' })] }));
    await screen.findByText(/7:After/);
    expect(screen.queryByText('list: updating')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('writes a release response into the list cache with zero additional GETs', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [contract()] }));
    render(
      <SwrProvider value={{ provider: () => new Map() }}>
        <ListConsumer />
        <MutationHarness />
      </SwrProvider>,
    );
    await screen.findByText(/7:Website redesign:Funded:0/);

    const updated = contract({ releasedAmount: 300, milestones: [{ index: 0, title: 'Design', amount: 300, released: true }] });
    fetchMock.mockResolvedValueOnce(ok({ data: updated }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'release' }));

    expect(await screen.findByText(/7:Website redesign:Funded:300/)).toBeInTheDocument();
    expect(getCalls()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
