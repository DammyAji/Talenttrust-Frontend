/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom/vitest" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Keypair } from '@stellar/stellar-sdk';
import { ReputationLookup } from './ReputationLookup';
import { readOnChainReputation } from '@/lib/stellar/reputation';

vi.mock('@/lib/stellar/reputation', () => ({
  readOnChainReputation: vi.fn(),
}));

const mockReadOnChain = vi.mocked(readOnChainReputation);
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
const validAddress = Keypair.random().publicKey();

const respondWith = (data: unknown, status = 200) => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  );
};

const apiPayload = { address: validAddress, completedContracts: 5, totalRating: 25, averageRating: 5 };

const submitLookup = async (user: ReturnType<typeof userEvent.setup>, address = validAddress) => {
  const input = screen.getByLabelText('Freelancer address');
  await user.clear(input);
  await user.type(input, address);
  await user.click(screen.getByRole('button', { name: /look up/i }));
};

describe('ReputationLookup', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    mockReadOnChain.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    render(<ReputationLookup />);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders both labelled result groups when on-chain and API succeed and match', async () => {
    respondWith(apiPayload);
    mockReadOnChain.mockResolvedValue({ ...apiPayload, address: validAddress });

    const user = userEvent.setup();
    await submitLookup(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Reputation results' })).toHaveAttribute('aria-live', 'polite'),
    );

    expect(screen.getByRole('heading', { name: 'On-chain (verified)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TalentTrust API (demo)' })).toBeInTheDocument();
    expect(screen.getAllByText('Completed contracts')).toHaveLength(2);
    expect(screen.getAllByText('5.00 / 5')).toHaveLength(2);
    expect(screen.queryByText(/values differ/i)).not.toBeInTheDocument();

    expect(mockReadOnChain).toHaveBeenCalledWith(validAddress);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/reputation/${encodeURIComponent(validAddress)}`),
      expect.anything(),
    );
    expect(screen.getByRole('link', { name: /stellar.expert/i })).toBeInTheDocument();
  });

  it('shows a non-blocking notice when both succeed but differ', async () => {
    respondWith({ ...apiPayload, averageRating: 4 });
    mockReadOnChain.mockResolvedValue({ ...apiPayload, averageRating: 5 });

    const user = userEvent.setup();
    await submitLookup(user);

    await waitFor(() => screen.getByText(/values differ/i));
    await waitFor(() => screen.getByText(/demo mirror/i));
    expect(screen.getAllByText('4.00 / 5')).toHaveLength(1);
    expect(screen.getAllByText('5.00 / 5')).toHaveLength(1);
  });

  it('still shows the API result when on-chain read fails, with a retry control', async () => {
    respondWith(apiPayload);
    mockReadOnChain.mockRejectedValueOnce(new Error('could not read contract'));

    const user = userEvent.setup();
    await submitLookup(user);

    await waitFor(() => screen.getByText(/could not read contract/i));
    expect(screen.getByRole('heading', { name: 'TalentTrust API (demo)' })).toBeInTheDocument();
    expect(screen.getByText('5.00 / 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry on-chain/i })).toBeInTheDocument();

    mockReadOnChain.mockResolvedValue({ ...apiPayload, address: validAddress });
    await user.click(screen.getByRole('button', { name: /retry on-chain/i }));
    await waitFor(() => expect(mockReadOnChain).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/could not read contract/i)).not.toBeInTheDocument();
  });

  it('shows an API error and retry control for network error', async () => {
    fetchMock.mockReset();
    mockReadOnChain.mockResolvedValue({ ...apiPayload, address: validAddress });
    fetchMock.mockRejectedValue(new Error('network down'));

    const user = userEvent.setup();
    await submitLookup(user);

    await waitFor(() => screen.getByText('network down'), { timeout: 10000 });
    expect(screen.getByRole('heading', { name: 'On-chain (verified)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry api/i })).toBeInTheDocument();

    respondWith(apiPayload);
    await user.click(screen.getByRole('button', { name: /retry api/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(screen.queryByText(/network down/i)).not.toBeInTheDocument();
  });

  it('shows an API error and retry control for non-2xx', async () => {
    fetchMock.mockReset();
    mockReadOnChain.mockResolvedValue({ ...apiPayload, address: validAddress });
    respondWith({}, 404);

    const user = userEvent.setup();
    await submitLookup(user);

    await waitFor(() => screen.getByText('Request failed (404)'), { timeout: 10000 });
    expect(screen.getByRole('heading', { name: 'On-chain (verified)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry api/i })).toBeInTheDocument();

    respondWith(apiPayload);
    await user.click(screen.getByRole('button', { name: /retry api/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Request failed \(404\)/i)).not.toBeInTheDocument();
  });

  it('renders without crashing when the API returns empty data', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    mockReadOnChain.mockResolvedValue({ ...apiPayload, address: validAddress });

    const user = userEvent.setup();
    await submitLookup(user);

    expect(screen.getByRole('heading', { name: 'TalentTrust API (demo)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'On-chain (verified)' })).toBeInTheDocument();
  });

  it('shows errors from both sources when both fail', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    mockReadOnChain.mockRejectedValue(new Error('chain down'));

    const user = userEvent.setup();
    await submitLookup(user);

    await waitFor(() => screen.getByText('network down'), { timeout: 10000 });
    await waitFor(() => screen.getByText('chain down'));
    expect(screen.getByRole('heading', { name: 'On-chain (verified)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TalentTrust API (demo)' })).toBeInTheDocument();
    expect(screen.queryByText(/values differ/i)).not.toBeInTheDocument();
  });

  it('validates the address and makes zero network calls for an invalid address', async () => {
    const user = userEvent.setup();
    await submitLookup(user, 'not-an-address');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/valid Stellar public address/i),
    );
    expect(screen.getByLabelText('Freelancer address')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockReadOnChain).not.toHaveBeenCalled();
  });

  it('supports keyboard-only operation for every new control', async () => {
    const user = userEvent.setup();
    const input = screen.getByLabelText('Freelancer address');
    const lookUp = screen.getByRole('button', { name: /look up/i });

    await user.tab();
    expect(document.activeElement).toBe(input);
    await user.tab();
    expect(document.activeElement).toBe(lookUp);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(input);

    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
