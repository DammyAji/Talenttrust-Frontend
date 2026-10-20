'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  checkApi,
  checkChainConfig,
  checkContract,
  checkRpc,
  aggregateState,
  type StatusResult,
  type CheckState,
  type ChainConfigResult,
} from '@/lib/status';
import { site } from '@/lib/site';

const AUTO_REFRESH_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Icons (inline SVG, aria-hidden — state is always conveyed by text too)
// ─────────────────────────────────────────────────────────────────────────────

function IconOk() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--ok)" />
      <path d="M6 10l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--warn)" />
      <path d="M10 6v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="14" r="1" fill="#fff" />
    </svg>
  );
}

function IconDown() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--bad)" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" className="status-spinner">
      <circle cx="10" cy="10" r="8" stroke="var(--border)" strokeWidth="3" />
      <path d="M10 2a8 8 0 018 8" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StateIcon({ state }: { state: CheckState | 'loading' }) {
  if (state === 'loading') return <IconSpinner />;
  if (state === 'operational') return <IconOk />;
  if (state === 'degraded') return <IconWarn />;
  return <IconDown />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label helpers
// ─────────────────────────────────────────────────────────────────────────────

export function stateLabel(state: CheckState | 'loading'): string {
  if (state === 'loading') return 'Checking…';
  if (state === 'operational') return 'Operational';
  if (state === 'degraded') return 'Degraded';
  return 'Down';
}

export function bannerLabel(state: CheckState): string {
  if (state === 'operational') return 'All systems operational';
  if (state === 'degraded') return 'Partial outage — some systems degraded';
  return 'Partial outage — one or more systems are down';
}

// ─────────────────────────────────────────────────────────────────────────────
// CheckRow — single component row
// ─────────────────────────────────────────────────────────────────────────────

interface CheckRowProps {
  label: string;
  state: CheckState | 'loading';
  result: StatusResult | null;
}

function CheckRow({ label, state, result }: CheckRowProps) {
  const [open, setOpen] = useState(false);
  const detailId = useId();

  return (
    <div className="status-row">
      <div className="status-row-main">
        <div className="status-row-icon">
          <StateIcon state={state} />
        </div>
        <div className="status-row-info">
          <span className="status-row-label">{label}</span>
          <span className={`status-row-state status-row-state--${state}`}>
            {stateLabel(state)}
          </span>
        </div>
        <div className="status-row-meta">
          {result && <span className="status-row-latency">{result.latencyMs}ms</span>}
          {result && (
            <button
              type="button"
              className="status-row-toggle"
              aria-expanded={open}
              aria-controls={detailId}
              aria-label={`${open ? 'Hide' : 'Show'} details for ${label}`}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Hide' : 'Details'}
            </button>
          )}
        </div>
      </div>
      {open && result && (
        <div id={detailId} className="status-row-detail" role="region" aria-label={`${label} details`}>
          <span>{result.detail}</span>
          {(result as ChainConfigResult).mismatch && (
            <span className="status-mismatch-badge">⚠ Config mismatch</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main client component
// ─────────────────────────────────────────────────────────────────────────────

interface Checks {
  api: StatusResult | null;
  chain: ChainConfigResult | null;
  rpc: StatusResult | null;
  contract: StatusResult | null;
}

const EMPTY_CHECKS: Checks = { api: null, chain: null, rpc: null, contract: null };

export default function StatusClient() {
  const [checks, setChecks] = useState<Checks>(EMPTY_CHECKS);
  const [running, setRunning] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const runChecks = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setAnnouncement('Running status checks…');

    try {
      // Health and chain config first: the chain endpoint supplies the RPC URL.
      const [apiResult, chainResult] = await Promise.all([checkApi(), checkChainConfig()]);
      if (!mounted.current) return;
      setChecks((prev) => ({ ...prev, api: apiResult, chain: chainResult }));

      const rpcUrl = chainResult.rpcUrl || site.rpcUrl;
      const [rpcResult, contractResult] = await Promise.all([
        checkRpc(rpcUrl),
        checkContract(rpcUrl),
      ]);
      if (!mounted.current) return;

      const next: Checks = { api: apiResult, chain: chainResult, rpc: rpcResult, contract: contractResult };
      setChecks(next);
      setLastChecked(new Date());
      setAnnouncement(bannerLabel(aggregateState([apiResult, chainResult, rpcResult, contractResult])));
    } finally {
      inFlight.current = false;
      if (mounted.current) setRunning(false);
    }
  }, []);

  // Run on mount and every 30s while the tab is visible.
  useEffect(() => {
    mounted.current = true;
    runChecks();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') runChecks();
    }, AUTO_REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [runChecks]);

  const results = [checks.api, checks.chain, checks.rpc, checks.contract].filter(
    Boolean,
  ) as StatusResult[];
  const overall: CheckState | 'loading' = results.length < 4 ? 'loading' : aggregateState(results);
  const mismatch = checks.chain?.mismatch;

  return (
    <div className="container">
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="status-announcer">
        {announcement}
      </div>

      <div className="page-head">
        <h1>System Status</h1>
        <p>Live health of the TalentTrust API, Soroban RPC and escrow contract.</p>
      </div>

      <div
        className={`status-banner status-banner--${overall}`}
        data-testid="status-banner"
        aria-label="Overall system status"
      >
        <StateIcon state={overall} />
        <span>{overall === 'loading' ? 'Checking all systems…' : bannerLabel(overall)}</span>
      </div>

      {mismatch && (
        <div className="alert alert-error" role="alert" data-testid="mismatch-alert">
          <strong>Configuration mismatch:</strong> {mismatch}
        </div>
      )}

      <section
        aria-labelledby="checks-heading"
        aria-live="polite"
        aria-busy={running}
        className="status-list"
        data-testid="status-checks"
      >
        <h2 id="checks-heading" className="sr-only">
          Individual component checks
        </h2>
        <CheckRow label="REST API (/health)" state={checks.api?.state ?? 'loading'} result={checks.api} />
        <CheckRow
          label="Chain Config (/api/v1/chain)"
          state={checks.chain?.state ?? 'loading'}
          result={checks.chain}
        />
        <CheckRow label="Soroban RPC" state={checks.rpc?.state ?? 'loading'} result={checks.rpc} />
        <CheckRow label="Escrow Contract" state={checks.contract?.state ?? 'loading'} result={checks.contract} />
      </section>

      <div className="status-controls">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={runChecks}
          disabled={running}
          aria-label="Re-run all status checks"
        >
          {running ? 'Checking…' : 'Re-run checks'}
        </button>
        {lastChecked && (
          <span className="small muted">
            Last checked:{' '}
            <time dateTime={lastChecked.toISOString()}>{lastChecked.toLocaleTimeString()}</time>
          </span>
        )}
      </div>
    </div>
  );
}
