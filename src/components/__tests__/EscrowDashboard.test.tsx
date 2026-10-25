import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
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
  render(
    <NotificationsProvider>
      <EscrowDashboard />
    </NotificationsProvider>,
  );
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
    render(
      <NotificationsProvider>
        <EscrowDashboard />
      </NotificationsProvider>,
    );
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent('We could not reach the TalentTrust API');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the API message on a non-2xx response', async () => {
    nav.set('status=Funded');
    fetchMock.mockImplementation(() => reply({ message: 'Internal error' }, 500));
    render(
      <NotificationsProvider>
        <EscrowDashboard />
      </NotificationsProvider>,
    );
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
    render(
      <NotificationsProvider>
        <EscrowDashboard />
      </NotificationsProvider>,
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'Disputed');
    expect(await screen.findByText('#7 Disputed one')).toBeInTheDocument();
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('EscrowDashboard cancel confirmation', () => {
  const contract = escrow(7, {
    title: 'Website redesign',
    milestones: [{ index: 0, title: 'Design', amount: 300, released: false }],
    totalAmount: 1000,
    fundedAmount: 600,
    releasedAmount: 300,
    status: 'Funded',
  });

  const isCancel = (input: unknown, init?: RequestInit) => String(input).includes('/cancel') && init?.method === 'POST';
  const cancelCalls = () => fetchMock.mock.calls.filter(([input, init]) => isCancel(input, init as RequestInit | undefined));

  const renderDashboard = (cancel: () => Promise<Response> = () => reply({}, 404)) => {
    nav.set('');
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) =>
      isCancel(input, init) ? cancel() : reply({ data: [contract] }),
    );
    render(
      <ConfirmProvider>
        <EscrowDashboard />
      </ConfirmProvider>,
    );
  };

  it('makes no API call when the dialog is dismissed without confirming', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /^Cancel escrow #7 / }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Keep escrow' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(cancelCalls()).toHaveLength(0);
  });

  it('makes no API call when the dialog is closed with Escape', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /^Cancel escrow #7 / }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(cancelCalls()).toHaveLength(0);
  });

  it('requires exact text and makes exactly one API call once confirmed', async () => {
    const user = userEvent.setup();
    renderDashboard(() => reply({ data: {} }));

    await user.click(await screen.findByRole('button', { name: /^Cancel escrow #7 / }));
    await screen.findByRole('dialog');

    const confirmButton = screen.getByRole('button', { name: 'Cancel escrow' });
    const input = screen.getByLabelText(/type 7 to confirm/i);
    await user.type(input, '8');
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, '7');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => expect(cancelCalls()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(cancelCalls()).toHaveLength(1);
  });

  it('shows an error when the cancel request fails on the network', async () => {
    const user = userEvent.setup();
    renderDashboard(() => Promise.reject(new TypeError('Failed to fetch')));

    await user.click(await screen.findByRole('button', { name: /^Cancel escrow #7 / }));
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/type 7 to confirm/i), '7');
    await user.click(screen.getByRole('button', { name: 'Cancel escrow' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not reach the TalentTrust API');
    expect(alert).toHaveAttribute('title', 'Failed to fetch');
  });

  it('keeps the API message as detail on a non-2xx cancel response', async () => {
    const user = userEvent.setup();
    renderDashboard(() => reply({ message: 'Escrow already cancelled' }, 400));

    await user.click(await screen.findByRole('button', { name: /^Cancel escrow #7 / }));
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/type 7 to confirm/i), '7');
    await user.click(screen.getByRole('button', { name: 'Cancel escrow' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The TalentTrust API returned an error.');
    expect(alert).toHaveAttribute('title', 'Escrow already cancelled');
  });
});

describe('EscrowDashboard address validation', () => {
  const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const SECOND_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
  const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

  it('blocks creation when client and freelancer are the same address', async () => {
    await renderAt('', []);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Client address'), ACCOUNT);
    await user.type(screen.getByLabelText('Freelancer address'), ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    expect(await screen.findByText('Client and freelancer must be different addresses.')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('does not call the API when the freelancer address is invalid', async () => {
    await renderAt('', []);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Client address'), ACCOUNT);
    await user.type(screen.getByLabelText('Freelancer address'), ACCOUNT.slice(0, -1));
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    expect(await screen.findByText('Stellar addresses must be 56 characters long.')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('submits normalised addresses for valid input', async () => {
    await renderAt('', []);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Client address'), ACCOUNT.toLowerCase());
    await user.type(screen.getByLabelText('Freelancer address'), SECOND_ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    await waitFor(() => {
      const post = posts()[0];
      expect(post).toBeDefined();
      const body = JSON.parse((post?.[1] as RequestInit).body as string);
      expect(body.client).toBe(ACCOUNT);
      expect(body.freelancer).toBe(SECOND_ACCOUNT);
    });
  });
});

describe('EscrowDashboard accessibility', () => {
  const funded = escrow(4, {
    title: 'Website redesign',
    totalAmount: 1000,
    fundedAmount: 1000,
    releasedAmount: 300,
    status: 'Funded',
    milestones: [
      { index: 0, title: 'Design', amount: 300, released: true },
      { index: 1, title: 'Build', amount: 700, released: false },
    ],
  });

  it('renders hierarchical h2 sections above the h3 cards', async () => {
    await renderAt('', [funded]);

    expect(screen.getByRole('heading', { level: 2, name: /create escrow/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Escrows' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /new escrow/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /#4 website redesign/i })).toBeInTheDocument();
  });

  it('announces completion of a milestone release', async () => {
    await renderAt('', [funded]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /release next milestone for escrow #4/i }));

    await waitFor(() =>
      expect(screen.getByTestId('escrow-live-announcer')).toHaveTextContent(/milestone released/i),
    );
  });

  it('announces completion of escrow creation', async () => {
    await renderAt('', []);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Client address'), 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
    await user.type(screen.getByLabelText('Freelancer address'), 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV');
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    await waitFor(() => expect(screen.getByTestId('escrow-live-announcer')).toHaveTextContent(/escrow created/i));
  });

  it('announces an error in the live region when an action fails', async () => {
    await renderAt('', [funded]);
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) =>
      init?.method === 'POST' ? Promise.reject(new TypeError('Network timeout')) : reply({ data: [funded] }),
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /release next milestone for escrow #4/i }));

    await waitFor(() =>
      expect(screen.getByTestId('escrow-live-announcer')).toHaveTextContent(/error: we could not reach the talenttrust api/i),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the TalentTrust API/i);
  });
});
