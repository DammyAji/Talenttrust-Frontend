import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { ExportMenu } from '@/components/escrow/ExportMenu';
import { disputed, readBlob, resolved } from '@/test/exportFixtures';

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => nav.params,
}));

const fetchMock = vi.fn();
const createObjectURL = vi.fn((_: Blob) => 'blob:export');
const revokeObjectURL = vi.fn();
const downloads: string[] = [];

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const exportButton = () => screen.getByRole('button', { name: 'Export CSV' });

const lastCsv = async () => {
  const blob = createObjectURL.mock.calls.at(-1)![0];
  return new TextDecoder().decode(await readBlob(blob));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 19, 12));
  fetchMock.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  downloads.length = 0;
  nav.params = new URLSearchParams();
  vi.stubGlobal('fetch', fetchMock);
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExportMenu', () => {
  it('is disabled with an explanation while loading', () => {
    render(<ExportMenu contracts={null} />);
    expect(exportButton()).toBeDisabled();
    expect(exportButton()).toHaveAccessibleDescription('Loading escrows...');
  });

  it('is disabled with an explanation when there is nothing to export', () => {
    render(<ExportMenu contracts={[]} />);
    expect(exportButton()).toBeDisabled();
    expect(exportButton()).toHaveAccessibleDescription('Nothing to export yet.');
  });

  it('opens with the mouse and downloads the escrow CSV', async () => {
    const user = userEvent.setup();
    render(<ExportMenu contracts={[disputed, resolved]} />);
    expect(exportButton()).toHaveAttribute('aria-haspopup', 'menu');
    expect(exportButton()).toHaveAttribute('aria-expanded', 'false');

    expect(exportButton()).not.toHaveAttribute('aria-controls');
    await user.click(exportButton());
    expect(exportButton()).toHaveAttribute('aria-expanded', 'true');
    expect(exportButton()).toHaveAttribute('aria-controls', screen.getByRole('menu').id);
    await user.click(screen.getByRole('menuitem', { name: /Escrows/ }));

    expect(downloads).toEqual(['talenttrust-escrows-2026-10-19.csv']);
    const csv = await lastCsv();
    expect(csv.split('\r\n')[1]).toMatch(/^7,"'=HYPERLINK\(""http:\/\/evil""\)",Disputed,/);
    expect(csv).toContain('8,Логотип café,Resolved');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(exportButton()).toHaveFocus();
  });

  it('works with the keyboard only', async () => {
    const user = userEvent.setup();
    render(<ExportMenu contracts={[disputed]} />);
    await user.tab();
    expect(exportButton()).toHaveFocus();

    await user.keyboard('{Enter}');
    const [escrows, milestones] = screen.getAllByRole('menuitem');
    await waitFor(() => expect(escrows).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(milestones).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(escrows).toHaveFocus();
    await user.keyboard('{End}');
    expect(milestones).toHaveFocus();
    await user.keyboard(' ');

    expect(downloads).toHaveLength(1);
    expect((await lastCsv()).split('\r\n')[0]).toBe('contractId,contractTitle,index,milestoneTitle,amount,released');
    expect(exportButton()).toHaveFocus();
  });

  it('opens on ArrowUp at the last item and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<ExportMenu contracts={[disputed]} />);
    exportButton().focus();
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /Milestones/ })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(exportButton()).toHaveAttribute('aria-expanded', 'false');
    expect(exportButton()).toHaveFocus();
    expect(downloads).toHaveLength(0);
  });

  it('closes on Tab and on an outside click', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ExportMenu contracts={[disputed]} />
        <button>Outside</button>
      </>,
    );
    await user.click(exportButton());
    await waitFor(() => expect(screen.getAllByRole('menuitem')[0]).toHaveFocus());
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(exportButton());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Export in the dashboard', () => {
  it('exports the loaded list', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() => reply({ data: [resolved, disputed] }));
    render(<EscrowDashboard />);
    await waitFor(() => expect(exportButton()).toBeEnabled());
    await user.click(exportButton());
    await user.click(screen.getByRole('menuitem', { name: /Milestones/ }));
    expect((await lastCsv()).split('\r\n')).toHaveLength(4);
  });

  it('exports only the escrows matching the active filters', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams('q=hyperlink');
    fetchMock.mockImplementation(() => reply({ data: [resolved, disputed] }));
    render(<EscrowDashboard />);
    await waitFor(() => expect(exportButton()).toBeEnabled());
    await user.click(exportButton());
    await user.click(screen.getByRole('menuitem', { name: /Escrows/ }));
    const rows = (await lastCsv()).split('\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatch(/^7,/);
  });

  it('is disabled when no escrow matches the filters', async () => {
    nav.params = new URLSearchParams('q=nothing');
    fetchMock.mockImplementation(() => reply({ data: [resolved, disputed] }));
    render(<EscrowDashboard />);
    await waitFor(() => expect(exportButton()).toHaveAccessibleDescription('Nothing to export yet.'));
    expect(exportButton()).toBeDisabled();
  });

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a non-2xx response', () => reply({ message: 'Internal error' }, 500)],
    ['empty data', () => reply({ data: [] })],
  ])('stays disabled after %s', async (_, impl) => {
    fetchMock.mockImplementation(impl);
    render(<EscrowDashboard />);
    await waitFor(() => expect(exportButton()).toHaveAccessibleDescription('Nothing to export yet.'), { timeout: 3000 });
    expect(exportButton()).toBeDisabled();
  });
});
