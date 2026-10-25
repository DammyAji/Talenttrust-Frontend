import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EscrowContract } from '@/lib/api';

const notFoundMock = vi.fn(() => {
  throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
});

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  usePathname: () => '/contracts/7/statement',
}));

import StatementPage from '@/app/contracts/[id]/statement/page';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const contract = (over: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 7,
  title: 'Website redesign',
  client: 'GCLIENT',
  freelancer: 'GFREE',
  token: 'XLM',
  milestones: [{ index: 0, title: 'Design', amount: 1000, released: true }],
  totalAmount: 1000,
  fundedAmount: 1000,
  releasedAmount: 1000,
  status: 'Completed',
  reputationIssued: false,
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-05T12:30:00.000Z',
  ...over,
});

const renderPage = async (id: string) => {
  const ui = await StatementPage({ params: Promise.resolve({ id }) });
  return render(ui);
};

beforeEach(() => {
  notFoundMock.mockClear();
  vi.restoreAllMocks();
});

describe('StatementPage', () => {
  it('renders the ledger for a completed escrow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract() })));
    await renderPage('7');
    expect(screen.getByRole('heading', { name: /#7 website redesign/i })).toBeInTheDocument();
    expect(screen.getByText(/milestone 1: design/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print \/ save as pdf/i })).toBeInTheDocument();
  });

  it('does not fetch and calls notFound for an invalid id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(renderPage('abc')).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch and calls notFound for a negative id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(renderPage('-3')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls notFound when the API returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'contract_not_found' }, 404)));
    await expect(renderPage('999')).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('throws a clear error on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'boom' }, 500)));
    await expect(renderPage('7')).rejects.toThrow(/Failed to load contract \(500\)/);
  });

  it('calls notFound when the payload has no data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({})));
    await expect(renderPage('7')).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('shows In progress for a funded escrow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract({ status: 'Funded', releasedAmount: 0, milestones: [{ index: 0, title: 'Design', amount: 1000, released: false }] }) })));
    await renderPage('7');
    expect(screen.getAllByText(/in progress/i).length).toBeGreaterThan(0);
  });
});
