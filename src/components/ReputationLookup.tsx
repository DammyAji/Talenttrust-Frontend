'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { StrKey } from '@stellar/stellar-sdk';
import { api, Reputation } from '@/lib/api';
import { OnChainReputation, readOnChainReputation } from '@/lib/stellar/reputation';
import { site } from '@/lib/site';

const DEMO_ADDRESS = 'GFREELANCERDEMOBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

export function ReputationLookup() {
  const searchParams = useSearchParams();
  const [address, setAddress] = useState(DEMO_ADDRESS);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [apiResult, setApiResult] = useState<Reputation | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [chainResult, setChainResult] = useState<OnChainReputation | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  const clearResults = useCallback(() => {
    setApiResult(null);
    setApiError(null);
    setChainResult(null);
    setChainError(null);
  }, []);

  const mismatch =
    apiResult &&
    chainResult &&
    (apiResult.averageRating !== chainResult.averageRating ||
      apiResult.completedContracts !== chainResult.completedContracts ||
      apiResult.totalRating !== chainResult.totalRating);

  const performLookup = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setAddress(trimmed);
    setAddressError(null);
    clearResults();

    if (!StrKey.isValidEd25519PublicKey(trimmed)) {
      setAddressError('Enter a valid Stellar public address (it must start with G and pass the StrKey checksum).');
      return;
    }

    setBusy(true);
    try {
      const [apiSettled, chainSettled] = await Promise.allSettled([
        api<Reputation>(`/api/v1/reputation/${encodeURIComponent(trimmed)}`),
        readOnChainReputation(trimmed),
      ]);
      if (apiSettled.status === 'fulfilled') {
        setApiResult(apiSettled.value);
      } else {
        setApiError((apiSettled.reason as Error).message);
      }
      if (chainSettled.status === 'fulfilled') {
        setChainResult(chainSettled.value);
      } else {
        setChainError((chainSettled.reason as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }, [clearResults]);

  useEffect(() => {
    const queryAddress = searchParams?.get('address');
    if (queryAddress && queryAddress.trim()) {
      const clean = queryAddress.trim();
      performLookup(clean);
    }
  }, [searchParams, performLookup]);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    performLookup(address);
  };

  const retryApi = async () => {
    const value = address.trim();
    setApiError(null);
    try {
      setApiResult(await api<Reputation>(`/api/v1/reputation/${encodeURIComponent(value)}`));
    } catch (err) {
      setApiError((err as Error).message);
    }
  };

  const retryChain = async () => {
    const value = address.trim();
    setChainError(null);
    try {
      setChainResult(await readOnChainReputation(value));
    } catch (err) {
      setChainError((err as Error).message);
    }
  };

  const statRow = (label: string, value: React.ReactNode, id: string) => (
    <div key={id} className="stat-row">
      <dt id={id}>{label}</dt>
      <dd aria-labelledby={id}>{value}</dd>
    </div>
  );

  return (
    <div className="stack" style={{ maxWidth: 720, paddingBottom: 64 }}>
      <form className="card form" onSubmit={lookup}>
        <div className="field">
          <label htmlFor="address">Freelancer address</label>
          <div className="row">
            <input
              id="address"
              className="input mono"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              aria-invalid={addressError ? 'true' : 'false'}
              aria-describedby={addressError ? 'address-error' : undefined}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Looking up...' : 'Look up'}
            </button>
          </div>
          {addressError && (
            <div id="address-error" role="alert" className="alert alert-error">
              {addressError}
            </div>
          )}
        </div>
      </form>

      {(apiResult || chainResult || apiError || chainError) && (
        <div className="results" role="region" aria-label="Reputation results" aria-live="polite">
          {mismatch && (
            <div className="notice notice-info" role="status">
              <strong>The values differ.</strong> The TalentTrust API is a demo mirror &mdash; its data lives in memory
              and can reset. The on-chain value recorded by the escrow contract on Stellar is authoritative.
            </div>
          )}
          <div className="grid grid-2">
            {chainResult || chainError ? (
              <div className="card">
                <h3 id="onchain-heading">On-chain (verified)</h3>
                <p className="small muted">Stellar {site.network} &middot; get_reputation</p>
                {chainError ? (
                  <>
                    <div className="alert alert-error">{chainError}</div>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={retryChain}
                      aria-label="Retry on-chain reputation check"
                    >
                      Retry on-chain
                    </button>
                  </>
                ) : (
                  chainResult && (
                    <>
                      <dl className="stats" aria-labelledby="onchain-heading">
                        {statRow('Completed contracts', chainResult.completedContracts, 'onchain-contracts')}
                        {statRow('Total rating points', chainResult.totalRating, 'onchain-total')}
                        {statRow(
                          'Average rating',
                          `${chainResult.averageRating.toFixed(2)} / 5`,
                          'onchain-average',
                        )}
                      </dl>
                      <p className="small" style={{ marginTop: 12 }}>
                        <a
                          href={`https://stellar.expert/explorer/${site.network}/account/${encodeURIComponent(
                            address.trim(),
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View account ${address.trim()} on stellar.expert (opens in a new tab)`}
                        >
                          View on stellar.expert
                        </a>
                      </p>
                    </>
                  )
                )}
              </div>
            ) : null}
            {apiResult || apiError ? (
              <div className="card">
                <h3 id="api-heading">TalentTrust API (demo)</h3>
                <p className="small muted">In-memory demo data; may reset.</p>
                {apiError ? (
                  <>
                    <div className="alert alert-error">{apiError}</div>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={retryApi}
                      aria-label="Retry API reputation check"
                    >
                      Retry API
                    </button>
                  </>
              ) : (
                apiResult && (
                  <dl className="stats" aria-labelledby="api-heading">
                    {statRow('Completed contracts', apiResult.completedContracts, 'api-contracts')}
                    {statRow('Total rating points', apiResult.totalRating, 'api-total')}
                    {statRow('Average rating', `${(apiResult.averageRating ?? 0).toFixed(2)} / 5`, 'api-average')}
                  </dl>
                )
              )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
