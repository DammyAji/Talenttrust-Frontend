'use client';

import React, { useEffect, useState, useCallback, useId } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import {
  getContract,
  buildDepositTx,
  buildReleaseTx,
  buildCancelTx,
  formatStroops,
  OnChainEscrow,
} from '@/lib/stellar/escrow';
import { simulateSignSubmit, TxStatus } from '@/lib/stellar/submit';

// ── Guard logic (pure, exported for tests) ───────────────────────────────────

export type ActionGuards = {
  canFund: boolean;
  canReleaseMilestone: (index: number) => boolean;
  canCancel: boolean;
};

export function computeGuards(
  escrow: OnChainEscrow | null,
  callerAddress: string | null
): ActionGuards {
  if (!escrow || !callerAddress) {
    return { canFund: false, canReleaseMilestone: () => false, canCancel: false };
  }
  const isClient =
    escrow.client.toLowerCase() === callerAddress.toLowerCase();
  const isCreated = escrow.status === 'Created';
  const isFunded = escrow.status === 'Funded';
  const isTerminal =
    escrow.status === 'Completed' ||
    escrow.status === 'Cancelled' ||
    escrow.status === 'Disputed';

  const remaining = escrow.totalAmount - escrow.fundedAmount;

  return {
    canFund: isClient && (isCreated || isFunded) && remaining > 0n && !isTerminal,
    canReleaseMilestone: (i: number) => {
      if (!isClient || !isFunded || isTerminal) return false;
      const ms = escrow.milestones[i];
      if (!ms || ms.released) return false;
      const available = escrow.fundedAmount - escrow.releasedAmount;
      return available >= ms.amount;
    },
    canCancel: isClient && (isCreated || isFunded) && !isTerminal,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TxStatus, string> = {
  idle: '',
  simulating: 'Simulating transaction…',
  awaiting_signature: 'Waiting for signature…',
  submitting: 'Submitting…',
  confirmed: 'Confirmed!',
  error: '',
};

function xlm(stroops: bigint): string {
  return `${formatStroops(stroops)} XLM`;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

// ── TxProgress ────────────────────────────────────────────────────────────────

type TxProgressProps = { status: TxStatus; error: string | null; txHash: string | null };
function TxProgress({ status, error, txHash }: TxProgressProps) {
  if (status === 'idle') return null;
  if (status === 'error')
    return (
      <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error ?? 'An error occurred.'}
      </p>
    );
  if (status === 'confirmed')
    return (
      <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        Confirmed!{' '}
        {txHash && (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline ${focusRing}`}
          >
            View on Explorer
          </a>
        )}
      </p>
    );
  return (
    <p role="status" aria-live="polite" className="mt-2 text-sm text-slate-500">
      {STATUS_LABELS[status]}
    </p>
  );
}

// ── CancelDialog ──────────────────────────────────────────────────────────────

type CancelDialogProps = {
  refundAmount: bigint;
  onConfirm: () => void;
  onDismiss: () => void;
  titleId: string;
};
function CancelDialog({ refundAmount, onConfirm, onDismiss, titleId }: CancelDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          Cancel contract?
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          This will cancel the contract and refund{' '}
          <strong aria-label={`${xlm(refundAmount)} will be refunded`}>
            {xlm(refundAmount)}
          </strong>{' '}
          to you.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`flex-1 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 ${focusRing}`}
          >
            Confirm cancel
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className={`flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 ${focusRing}`}
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type OnChainEscrowActionsProps = { id: number };

export default function OnChainEscrowActions({ id }: OnChainEscrowActionsProps) {
  const { address } = useWallet();
  const [escrow, setEscrow] = useState<OnChainEscrow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [depositInput, setDepositInput] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const cancelTitleId = useId();
  const depositInputId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getContract(id);
      setEscrow(data);
      const remaining = data.totalAmount - data.fundedAmount;
      if (remaining > 0n) setDepositInput(formatStroops(remaining));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load contract.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const guards = computeGuards(escrow, address ?? null);
  const isClient =
    escrow ? (address ?? '').toLowerCase() === escrow.client.toLowerCase() : false;

  const runTx = useCallback(
    async (buildFn: () => Promise<{ xdr: string; networkPassphrase: string }>) => {
      if (!address) return;
      setTxStatus('idle');
      setTxError(null);
      setTxHash(null);
      try {
        const { xdr } = await buildFn();
        const hash = await simulateSignSubmit(xdr, address, (s, detail) => {
          setTxStatus(s);
          if (s === 'confirmed' && detail) setTxHash(detail);
        });
        setTxHash(hash);
        setTxStatus('confirmed');
        await load();
      } catch (err) {
        setTxStatus('error');
        setTxError(err instanceof Error ? err.message : String(err));
      }
    },
    [address, load]
  );

  const handleDeposit = () => {
    if (!address || !escrow) return;
    const xlmVal = parseFloat(depositInput);
    if (isNaN(xlmVal) || xlmVal <= 0) {
      setTxStatus('error');
      setTxError('Please enter a valid amount greater than 0.');
      return;
    }
    const stroops = BigInt(Math.round(xlmVal * 10_000_000));
    const remaining = escrow.totalAmount - escrow.fundedAmount;
    if (stroops > remaining) {
      setTxStatus('error');
      setTxError(`Amount exceeds remaining: ${xlm(remaining)}.`);
      return;
    }
    runTx(() => buildDepositTx(id, stroops, address));
  };

  const handleRelease = (index: number) => {
    if (!address) return;
    runTx(() => buildReleaseTx(id, index, address));
  };

  const handleCancelConfirm = () => {
    setShowCancel(false);
    if (!address) return;
    runTx(() => buildCancelTx(id, address));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading contract"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <p className="text-sm text-slate-500">Loading contract…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-3xl border border-rose-200 bg-rose-50 p-6">
        <p className="text-sm text-rose-700">{loadError}</p>
      </div>
    );
  }

  if (!escrow) return null;

  const remaining = escrow.totalAmount - escrow.fundedAmount;
  const refundAmount = escrow.fundedAmount - escrow.releasedAmount;
  const isBusy =
    txStatus === 'simulating' ||
    txStatus === 'awaiting_signature' ||
    txStatus === 'submitting';

  return (
    <>
      {showCancel && (
        <CancelDialog
          refundAmount={refundAmount}
          onConfirm={handleCancelConfirm}
          onDismiss={() => setShowCancel(false)}
          titleId={cancelTitleId}
        />
      )}

      <section
        aria-labelledby="onchain-actions-heading"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6"
      >
        <div>
          <p className="text-sm text-slate-500 uppercase tracking-[0.24em]">On-chain Actions</p>
          <h2
            id="onchain-actions-heading"
            className="mt-2 text-xl font-semibold text-slate-900"
          >
            Contract #{id}
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="font-semibold text-slate-900">{escrow.status}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total</dt>
              <dd className="font-semibold text-slate-900">{xlm(escrow.totalAmount)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Funded</dt>
              <dd className="font-semibold text-slate-900">{xlm(escrow.fundedAmount)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Released</dt>
              <dd className="font-semibold text-slate-900">{xlm(escrow.releasedAmount)}</dd>
            </div>
          </dl>
        </div>

        {/* Read-only note for non-client */}
        {!isClient && (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Only the client can take actions on this contract. You are viewing in read-only mode.
          </p>
        )}

        {/* Fund section */}
        {guards.canFund && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-700">Fund contract</h3>
            <p className="text-sm text-slate-500">
              Remaining to fund: <strong>{xlm(remaining)}</strong>
            </p>
            <div className="flex gap-2">
              <label htmlFor={depositInputId} className="sr-only">
                Amount in XLM
              </label>
              <input
                id={depositInputId}
                type="number"
                min="0"
                step="0.0000001"
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
                disabled={isBusy}
                placeholder="Amount in XLM"
                aria-label="Deposit amount in XLM"
                className={`flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-50 ${focusRing}`}
              />
              <button
                type="button"
                onClick={handleDeposit}
                disabled={isBusy}
                aria-label="Fund contract"
                className={`rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
              >
                Fund
              </button>
            </div>
          </div>
        )}

        {/* Milestones */}
        {escrow.milestones.length > 0 && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-700">Milestones</h3>
            <ul className="space-y-2">
              {escrow.milestones.map((ms, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <span className="flex-1 text-sm text-slate-700">
                    {ms.title || `Milestone ${i + 1}`}{' '}
                    <span className="text-slate-400">— {xlm(ms.amount)}</span>
                    {ms.released && (
                      <span className="ml-2 text-emerald-600 text-xs font-semibold">(released)</span>
                    )}
                  </span>
                  {guards.canReleaseMilestone(i) && (
                    <button
                      type="button"
                      onClick={() => handleRelease(i)}
                      disabled={isBusy}
                      aria-label={`Release milestone ${i + 1}: ${ms.title || ''} (${xlm(ms.amount)})`}
                      className={`shrink-0 rounded-2xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
                    >
                      Release
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cancel */}
        {guards.canCancel && (
          <div className="border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowCancel(true)}
              disabled={isBusy}
              aria-label="Cancel contract"
              className={`w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
            >
              Cancel contract
            </button>
          </div>
        )}

        <TxProgress status={txStatus} error={txError} txHash={txHash} />
      </section>
    </>
  );
}
