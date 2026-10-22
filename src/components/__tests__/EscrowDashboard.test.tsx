import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { escrow } from '@/test/fixtures';

// Minimal stand-in for the App Router: replace() updates useSearchParams()
const nav = vi.hoisted(() => {
  let params = new URLSearchParams();
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    set(search: string) {
      params = new URLSearchParams(search);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    replace: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => useSyncExternalStore(nav.subscribe, nav.get),
}));

const fetchMock = vi.fn();

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const requested = () => fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''));
const lastUrl = () => nav.replace.mock.calls.at(-1)?.[0];

const many = Array.from({ length: 23 }, (_, i) =>
  escrow(i + 1, { title: i % 2 ? `Audit ${i + 1}` : `Logo ${i + 1}`, status: i % 3 ? 'Funded' : 'Disputed' }),
);

const renderAt = async (search = '', data: unknown = many) => {
  nav.set(search);
  fetchMock.mockImplementation(() => reply({ data }));
  render(<EscrowDashboard />);
  await screen.findByRole('heading', { name: 'Escrows' });
  await waitFor(() => expect(screen.queryByText('Loading escrows...')).not.toBeInTheDocument());
};

beforeEach(() => {
  nav.replace.mockReset();
  nav.replace.mockImplementation((url: string) => act(() => nav.set(url.split('?')[1] ?? '')));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EscrowDashboard list', () => {
  it('shows the first page with a summary and pagination', async () => {
    await renderAt();
    expect(requested()).toEqual(['/api/v1/contracts']);
    expect(screen.getAllByRole('article')).toHaveLength(10);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–10 of 23 escrows');
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    expect(pager).toHaveTextContent('Page 1 of 3');
    expect(within(pager).getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('reads the initial state from the URL', async () => {
    await renderAt('status=Funded&q=audit&sort=oldest&page=1');
    expect(requested()).toEqual(['/api/v1/contracts?status=Funded']);
    expect(screen.getByLabelText('Status')).toHaveValue('Funded');
    expect(screen.getByLabelText('Search')).toHaveValue('audit');
    expect(screen.getByLabelText('Sort')).toHaveValue('oldest');
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('#2 Audit 2');
  });

  it('falls back to defaults for invalid params', async () => {
    await renderAt('status=Nope&sort=price&page=-1');
    expect(requested()).toEqual(['/api/v1/contracts']);
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(screen.getByLabelText('Sort')).toHaveValue('newest');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–10 of 23 escrows');
  });

  it('refetches with ?status= when the status changes and resets the page', async () => {
    const user = userEvent.setup();
    await renderAt('page=2');
    await user.selectOptions(screen.getByLabelText('Status'), 'Disputed');
    expect(lastUrl()).toBe('/contracts?status=Disputed');
    await waitFor(() => expect(requested()).toEqual(['/api/v1/contracts', '/api/v1/contracts?status=Disputed']));
  });

  it('updates the URL on sort without fetching', async () => {
    const user = userEvent.setup();
    await renderAt();
    await user.selectOptions(screen.getByLabelText('Sort'), 'total');
    expect(lastUrl()).toBe('/contracts?sort=total');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('debounces search, filters client-side and does not fetch', async () => {
    const user = userEvent.setup();
    await renderAt();
    await user.type(screen.getByLabelText('Search'), 'logo 1');
    expect(nav.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(lastUrl()).toBe('/contracts?q=logo+1'));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–6 of 6 escrows');
  });

  it('clears the search with Escape', async () => {
    const user = userEvent.setup();
    await renderAt('q=logo');
    const input = screen.getByLabelText('Search');
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    await waitFor(() => expect(lastUrl()).toBe('/contracts'));
  });

  it('moves to the next page and focuses the list heading', async () => {
    const user = userEvent.setup();
    await renderAt();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(lastUrl()).toBe('/contracts?page=2');
    expect(screen.getByRole('heading', { name: 'Escrows' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 11–20 of 23 escrows');
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Page 2 of 3');
  });

  it('works with the keyboard only', async () => {
    const user = userEvent.setup();
    await renderAt('page=3');
    screen.getByLabelText('Search').focus();
    await user.tab();
    expect(screen.getByLabelText('Status')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Sort')).toHaveFocus();
    screen.getByRole('button', { name: 'Previous' }).focus();
    await user.keyboard('{Enter}');
    expect(lastUrl()).toBe('/contracts?page=2');
    expect(screen.getByRole('heading', { name: 'Escrows' })).toHaveFocus();
    screen.getByRole('button', { name: 'Next' }).focus();
    await user.keyboard(' ');
    expect(lastUrl()).toBe('/contracts?page=3');
  });

  it('shows the last page when the page is past the end', async () => {
    await renderAt('page=40');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 21–23 of 23 escrows');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('shows an empty state with Clear filters when nothing matches', async () => {
    const user = userEvent.setup();
    await renderAt('status=Funded&q=zzz&sort=total');
    expect(screen.getByText('No escrows match these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(lastUrl()).toBe('/contracts');
    expect(screen.getByLabelText('Search')).toHaveValue('');
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(screen.getByLabelText('Sort')).toHaveValue('newest');
    await waitFor(() => expect(requested().at(-1)).toBe('/api/v1/contracts'));
    expect(await screen.findByText('Showing 1–10 of 23 escrows')).toBeInTheDocument();
  });

  it('shows the no-escrows message for empty data without filters', async () => {
    await renderAt('', []);
    expect(screen.getByText('No escrows yet. Create the first one.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('treats a response without a data array as empty', async () => {
    await renderAt('', 'oops');
    expect(screen.getByText('No escrows yet. Create the first one.')).toBeInTheDocument();
  });

  it('shows an error on a network failure', async () => {
    nav.set('');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<EscrowDashboard />);
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent('We could not reach the TalentTrust API');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the API message on a non-2xx response', async () => {
    nav.set('status=Funded');
    fetchMock.mockImplementation(() => reply({ message: 'Internal error' }, 500));
    render(<EscrowDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The TalentTrust API returned an error.');
    expect(screen.queryByText('No escrows match these filters.')).not.toBeInTheDocument();
  });

  it('aborts the previous request when the status changes', async () => {
    const user = userEvent.setup();
    let firstSignal: AbortSignal | null | undefined;
    nav.set('');
    fetchMock
      // Like real fetch: never resolves, rejects once aborted
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        firstSignal = init.signal;
        return new Promise<Response>((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        );
      })
      .mockImplementation(() => reply({ data: [escrow(7, { title: 'Disputed one', status: 'Disputed' })] }));
    render(<EscrowDashboard />);
    await user.selectOptions(screen.getByLabelText('Status'), 'Disputed');
    expect(await screen.findByText('#7 Disputed one')).toBeInTheDocument();
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
