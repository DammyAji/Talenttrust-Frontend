import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import OnChainEscrowActions from '../OnChainEscrowActions';
import * as escrowLib from '@/lib/stellar/escrow';
import * as submitLib from '@/lib/stellar/submit';
import { useWallet } from '@/contexts/WalletContext';

vi.mock('@/contexts/WalletContext');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseWallet = useWallet as unknown as ReturnType<typeof vi.fn>;

const CLIENT = 'GCLIENT111';
const FREELANCER = 'GFREELANCER111';

const BASE_ESCROW: escrowLib.OnChainEscrow = {
  id: 1,
  client: CLIENT,
  freelancer: FREELANCER,
  token: 'GTOKEN',
  totalAmount: 100_000_000n,
  fundedAmount: 0n,
  releasedAmount: 0n,
  status: 'Created',
  milestones: [{ title: 'Design', amount: 50_000_000n, released: false }],
};

function wallet(address: string | null = CLIENT) {
  mockUseWallet.mockReturnValue({
    address,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  wallet();
});

// ── Loading / error ───────────────────────────────────────────────────────────

describe('loading and error states', () => {
  it('shows loading state initially', () => {
    vi.spyOn(escrowLib, 'getContract').mockReturnValue(new Promise(() => {}));
    render(<OnChainEscrowActions id={1} />);
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows alert when contract load fails', async () => {
    vi.spyOn(escrowLib, 'getContract').mockRejectedValue(new Error('ContractNotFound'));
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('ContractNotFound')
    );
  });
});

// ── Success path ──────────────────────────────────────────────────────────────

describe('success path', () => {
  beforeEach(() => {
    vi.spyOn(escrowLib, 'getContract').mockResolvedValue({ ...BASE_ESCROW });
    vi.spyOn(escrowLib, 'buildDepositTx').mockResolvedValue({
      xdr: 'fakexdr',
      networkPassphrase: 'Test',
    });
    vi.spyOn(submitLib, 'simulateSignSubmit').mockResolvedValue('txhash123');
  });

  it('renders contract info after load', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => expect(screen.getByText('Contract #1')).toBeInTheDocument());
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('shows Fund button for client on Created', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /fund contract/i })).toBeInTheDocument()
    );
  });

  it('shows Cancel button for client', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /cancel contract/i })).toBeInTheDocument()
    );
  });

  it('shows read-only note for freelancer', async () => {
    wallet(FREELANCER);
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() =>
      expect(screen.getByText(/only the client can take actions/i)).toBeInTheDocument()
    );
  });

  it('shows read-only note for anonymous visitor', async () => {
    wallet(null);
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() =>
      expect(screen.getByText(/only the client can take actions/i)).toBeInTheDocument()
    );
  });

  it('executes deposit and shows Confirmed', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByRole('button', { name: /fund contract/i }));
    fireEvent.click(screen.getByRole('button', { name: /fund contract/i }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/confirmed/i)
    );
    expect(submitLib.simulateSignSubmit).toHaveBeenCalled();
  });
});

// ── Cancel flow ───────────────────────────────────────────────────────────────

describe('cancel flow', () => {
  beforeEach(() => {
    vi.spyOn(escrowLib, 'getContract').mockResolvedValue({ ...BASE_ESCROW });
    vi.spyOn(escrowLib, 'buildCancelTx').mockResolvedValue({
      xdr: 'fakexdr',
      networkPassphrase: 'Test',
    });
    vi.spyOn(submitLib, 'simulateSignSubmit').mockResolvedValue('txhash456');
  });

  it('opens cancel dialog with refund info', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByRole('button', { name: /cancel contract/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel contract/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /cancel contract/i })).toBeInTheDocument();
  });

  it('closes dialog on Go back', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByRole('button', { name: /cancel contract/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel contract/i }));
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });

  it('closes dialog on Escape', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByRole('button', { name: /cancel contract/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel contract/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });

  it('submits cancel on Confirm cancel', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByRole('button', { name: /cancel contract/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel contract/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm cancel/i }));
    await waitFor(() => expect(submitLib.simulateSignSubmit).toHaveBeenCalled());
  });
});

// ── Failure states ────────────────────────────────────────────────────────────

describe('failure states', () => {
  beforeEach(() => {
    vi.spyOn(escrowLib, 'getContract').mockResolvedValue({ ...BASE_ESCROW });
    vi.spyOn(escrowLib, 'buildDepositTx').mockResolvedValue({
      xdr: 'fakexdr',
      networkPassphrase: 'Test',
    });
  });

  async function clickFund() {
    await waitFor(() => screen.getByRole('button', { name: /fund contract/i }));
    fireEvent.click(screen.getByRole('button', { name: /fund contract/i }));
  }

  it('shows error for InvalidStatus (code 10)', async () => {
    vi
      .spyOn(submitLib, 'simulateSignSubmit')
      .mockRejectedValue(new Error('InvalidStatus'));
    render(<OnChainEscrowActions id={1} />);
    await clickFund();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('InvalidStatus')
    );
  });

  it('shows error for MilestoneAlreadyReleased (code 12)', async () => {
    vi
      .spyOn(submitLib, 'simulateSignSubmit')
      .mockRejectedValue(new Error('MilestoneAlreadyReleased'));
    render(<OnChainEscrowActions id={1} />);
    await clickFund();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('MilestoneAlreadyReleased')
    );
  });

  it('shows error for InsufficientFunds (code 13)', async () => {
    vi
      .spyOn(submitLib, 'simulateSignSubmit')
      .mockRejectedValue(new Error('InsufficientFunds'));
    render(<OnChainEscrowActions id={1} />);
    await clickFund();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('InsufficientFunds')
    );
  });

  it('shows error on wallet rejection', async () => {
    vi
      .spyOn(submitLib, 'simulateSignSubmit')
      .mockRejectedValue(new Error('Transaction cancelled by user.'));
    render(<OnChainEscrowActions id={1} />);
    await clickFund();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Transaction cancelled by user.')
    );
  });

  it('shows error on RPC timeout', async () => {
    vi
      .spyOn(submitLib, 'simulateSignSubmit')
      .mockRejectedValue(new Error('RPC timeout'));
    render(<OnChainEscrowActions id={1} />);
    await clickFund();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('RPC timeout')
    );
  });

  it('shows error for zero deposit amount', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByRole('spinbutton', { name: /deposit amount/i }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /deposit amount/i }), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: /fund contract/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid amount/i);
  });

  it('shows error when deposit exceeds remaining', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByRole('spinbutton', { name: /deposit amount/i }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /deposit amount/i }), {
      target: { value: '999' },
    });
    fireEvent.click(screen.getByRole('button', { name: /fund contract/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds remaining/i);
  });
});

// ── Funded escrow with milestones ─────────────────────────────────────────────

describe('Funded escrow with milestones', () => {
  const FUNDED: escrowLib.OnChainEscrow = {
    ...BASE_ESCROW,
    status: 'Funded',
    fundedAmount: 100_000_000n,
    milestones: [
      { title: 'Design', amount: 50_000_000n, released: false },
      { title: 'Dev', amount: 50_000_000n, released: true },
    ],
  };

  beforeEach(() => {
    vi.spyOn(escrowLib, 'getContract').mockResolvedValue({ ...FUNDED });
    vi.spyOn(escrowLib, 'buildReleaseTx').mockResolvedValue({
      xdr: 'fakexdr',
      networkPassphrase: 'Test',
    });
    vi.spyOn(submitLib, 'simulateSignSubmit').mockResolvedValue('txhash789');
  });

  it('shows Release for unreleased milestone', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /release milestone 1/i })).toBeInTheDocument()
    );
  });

  it('does not show Release for already-released milestone', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByText('Milestones'));
    expect(
      screen.queryByRole('button', { name: /release milestone 2/i })
    ).not.toBeInTheDocument();
  });

  it('executes release and shows Confirmed', async () => {
    render(<OnChainEscrowActions id={1} />);
    await waitFor(() => screen.getByRole('button', { name: /release milestone 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /release milestone 1/i }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/confirmed/i)
    );
  });
});
