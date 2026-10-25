import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import StatusClient from './StatusClient';
import {
  checkApi,
  checkChainConfig,
  checkContract,
  checkRpc,
  type StatusResult,
} from '@/lib/status';

vi.mock('@/lib/status', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/status')>();
  return {
    ...actual,
    checkApi: vi.fn(),
    checkChainConfig: vi.fn(),
    checkRpc: vi.fn(),
    checkContract: vi.fn(),
  };
});

const api = vi.mocked(checkApi);
const chain = vi.mocked(checkChainConfig);
const rpc = vi.mocked(checkRpc);
const contract = vi.mocked(checkContract);

const ok = (detail: string): StatusResult => ({ state: 'operational', latencyMs: 12, detail });
const down = (detail: string): StatusResult => ({ state: 'down', latencyMs: 0, detail });
const degraded = (detail: string): StatusResult => ({ state: 'degraded', latencyMs: 2500, detail });

beforeEach(() => {
  vi.clearAllMocks();
  api.mockResolvedValue(ok('API v1.2.3 responded in 12ms'));
  chain.mockResolvedValue({
    state: 'operational',
    latencyMs: 9,
    detail: 'Network: testnet, Contract: CCZMIVUB…',
    rpcUrl: 'https://rpc.example.com',
  });
  rpc.mockResolvedValue(ok('Ledger #12345, protocol v21'));
  contract.mockResolvedValue(ok('Contract CCZMIVUB… reachable at ledger #12345'));
});

describe('StatusClient', () => {
  it('renders an all-operational banner and every component row', async () => {
    render(<StatusClient />);

    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent('All systems operational'),
    );
    expect(screen.getByText('REST API (/health)')).toBeInTheDocument();
    expect(screen.getByText('Chain Config (/api/v1/chain)')).toBeInTheDocument();
    expect(screen.getByText('Soroban RPC')).toBeInTheDocument();
    expect(screen.getByText('Escrow Contract')).toBeInTheDocument();
    expect(screen.getAllByText('Operational')).toHaveLength(4);
    expect(screen.getAllByText('12ms').length).toBeGreaterThan(0);
    expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('https://rpc.example.com');
    expect(contract).toHaveBeenCalledWith('https://rpc.example.com');
  });

  it('marks the results region as a polite live region', async () => {
    render(<StatusClient />);
    const region = await screen.findByTestId('status-checks');
    expect(region).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(region).toHaveAttribute('aria-busy', 'false'));
  });

  it('shows a partial outage when the API is down and conveys state as text', async () => {
    api.mockResolvedValue(down('Network error: Failed to fetch'));
    render(<StatusClient />);

    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent(
        'Partial outage — one or more systems are down',
      ),
    );
    expect(screen.getByText('Down')).toBeInTheDocument();
    expect(screen.getByTestId('status-announcer')).toHaveTextContent(/Partial outage/);
  });

  it('shows the malformed-JSON failure detail when a checker returns one', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(down('Malformed JSON from /health'));
    render(<StatusClient />);

    const toggle = await screen.findByRole('button', { name: 'Show details for REST API (/health)' });
    await user.click(toggle);
    expect(screen.getByText('Malformed JSON from /health')).toBeVisible();
  });

  it('warns and announces degraded when the backend config mismatches', async () => {
    chain.mockResolvedValue({
      state: 'degraded',
      latencyMs: 15,
      detail: 'Contract ID mismatch',
      rpcUrl: 'https://rpc.example.com',
      mismatch: 'Contract ID mismatch — backend: OTHER, frontend: CCZMIVUB',
    });
    render(<StatusClient />);

    const alert = await screen.findByTestId('mismatch-alert');
    expect(alert).toHaveTextContent('Configuration mismatch:');
    expect(alert).toHaveTextContent('Contract ID mismatch');
    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent(
        'Partial outage — some systems degraded',
      ),
    );
    expect(screen.getAllByText('Degraded')).toHaveLength(1);
  });

  it('falls back to the configured RPC URL when chain config is unavailable', async () => {
    chain.mockResolvedValue(down('Network error: Failed to fetch'));
    render(<StatusClient />);

    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent(/Partial outage/),
    );
    expect(rpc).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//));
    expect(contract).toHaveBeenCalled();
  });

  it('supports keyboard-only operation of the details toggle and re-run button', async () => {
    const user = userEvent.setup();
    render(<StatusClient />);
    await screen.findByTestId('status-banner');
    await waitFor(() => expect(screen.getByTestId('status-checks')).toHaveAttribute('aria-busy', 'false'));

    const toggle = screen.getByRole('button', { name: 'Show details for REST API (/health)' });
    toggle.focus();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAccessibleName();

    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('API v1.2.3 responded in 12ms')).toBeVisible();

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    const rerun = screen.getByRole('button', { name: 'Re-run all status checks' });
    rerun.focus();
    expect(rerun).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(rerun).toBeEnabled());
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<StatusClient />);
    await screen.findByTestId('status-banner');
    await waitFor(() => expect(screen.getByTestId('status-checks')).toHaveAttribute('aria-busy', 'false'));
    expect(await axe(container)).toHaveNoViolations();
  });
});
