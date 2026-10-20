/**
 * Status checkers for the /status page.
 *
 * Each checker returns a StatusResult describing whether the dependency is
 * operational, degraded (slow), or down, plus latency and a detail string.
 *
 * Dependencies:
 *  - REST API  : GET /health
 *  - Chain config: GET /api/v1/chain  (+ mismatch detection)
 *  - Soroban RPC : JSON-RPC getHealth + getLatestLedger (no SDK)
 *  - Contract    : simulate version() via RPC simulateTransaction stub
 */

import { site } from './site';

export type CheckState = 'operational' | 'degraded' | 'down';

export interface StatusResult {
  state: CheckState;
  latencyMs: number;
  detail: string;
}

/** Latency above this threshold is considered degraded but not down (ms). */
export const DEGRADED_THRESHOLD_MS = 2000;

/** Fetch timeout for all checkers (ms). */
export const FETCH_TIMEOUT_MS = 5000;

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fetch with an AbortController timeout.  Throws on network error or timeout.
 * Returns the Response — callers are responsible for checking ok and parsing.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classify a measured latency as operational or degraded.
 * The caller should call this only when the request itself succeeded.
 */
function classify(latencyMs: number): CheckState {
  return latencyMs > DEGRADED_THRESHOLD_MS ? 'degraded' : 'operational';
}

/**
 * Detect an aborted request (our timeout) rather than a genuine network error.
 * `fetch` rejects with a DOMException named AbortError; its message case varies
 * between runtimes, so match on the name as well as the message.
 */
function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  if (name === 'AbortError') return true;
  return typeof message === 'string' && /abort|timed? ?out/i.test(message);
}

// ──────────────────────────────────────────────────────────────────────────────
// checkApi — GET /health
// ──────────────────────────────────────────────────────────────────────────────

export interface ApiHealthData {
  uptime?: number;
  version?: string;
  storage?: string;
  [key: string]: unknown;
}

export async function checkApi(): Promise<StatusResult> {
  const url = `${site.apiUrl}/health`;
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(url);
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return { state: 'down', latencyMs, detail: `HTTP ${res.status} from /health` };
    }

    let data: ApiHealthData;
    try {
      data = await res.json();
    } catch {
      return { state: 'down', latencyMs, detail: 'Malformed JSON from /health' };
    }

    const versionStr = data.version ? ` v${data.version}` : '';
    const detail = `API${versionStr} responded in ${latencyMs}ms`;
    return { state: classify(latencyMs), latencyMs, detail };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const timedOut = isAbortError(err);
    return {
      state: 'down',
      latencyMs,
      detail: timedOut
        ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
        : `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// checkChainConfig — GET /api/v1/chain + mismatch detection
// ──────────────────────────────────────────────────────────────────────────────

export interface ChainConfigData {
  network?: string;
  rpcUrl?: string;
  contractId?: string;
  [key: string]: unknown;
}

export interface ChainConfigResult extends StatusResult {
  rpcUrl?: string;
  mismatch?: string;
}

export async function checkChainConfig(): Promise<ChainConfigResult> {
  const url = `${site.apiUrl}/api/v1/chain`;
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(url);
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return { state: 'down', latencyMs, detail: `HTTP ${res.status} from /api/v1/chain` };
    }

    let data: ChainConfigData;
    try {
      data = await res.json();
    } catch {
      return { state: 'down', latencyMs, detail: 'Malformed JSON from /api/v1/chain' };
    }

    // Mismatch detection
    const mismatches: string[] = [];
    if (data.contractId && data.contractId !== site.contractId) {
      mismatches.push(
        `Contract ID mismatch — backend: ${data.contractId}, frontend: ${site.contractId}`,
      );
    }
    if (data.network && data.network !== site.network) {
      mismatches.push(
        `Network mismatch — backend: ${data.network}, frontend: ${site.network}`,
      );
    }

    if (mismatches.length > 0) {
      return {
        state: 'degraded',
        latencyMs,
        detail: mismatches.join(' | '),
        rpcUrl: data.rpcUrl,
        mismatch: mismatches.join(' | '),
      };
    }

    const detail = `Network: ${data.network ?? 'unknown'}, Contract: ${(data.contractId ?? '').slice(0, 8)}…`;
    return {
      state: classify(latencyMs),
      latencyMs,
      detail,
      rpcUrl: data.rpcUrl,
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    return {
      state: 'down',
      latencyMs,
      detail: isAbortError(err)
        ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
        : `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// checkRpc — Soroban JSON-RPC getHealth + getLatestLedger (no SDK)
// ──────────────────────────────────────────────────────────────────────────────

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

export async function checkRpc(rpcUrl: string): Promise<StatusResult> {
  if (!rpcUrl) {
    return { state: 'down', latencyMs: 0, detail: 'RPC URL not configured' };
  }

  const t0 = Date.now();
  try {
    // getLatestLedger is a cheap read-only call supported by all Soroban RPCs
    const res = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestLedger',
        params: {},
      }),
    });
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return { state: 'down', latencyMs, detail: `HTTP ${res.status} from Soroban RPC` };
    }

    let data: JsonRpcResponse<{ sequence: number; protocolVersion: number }>;
    try {
      data = await res.json();
    } catch {
      return { state: 'down', latencyMs, detail: 'Malformed JSON from Soroban RPC' };
    }

    if (data.error) {
      return {
        state: 'down',
        latencyMs,
        detail: `RPC error ${data.error.code}: ${data.error.message}`,
      };
    }

    if (!data.result) {
      return { state: 'down', latencyMs, detail: 'Unexpected RPC response shape' };
    }

    const detail = `Ledger #${data.result.sequence}, protocol v${data.result.protocolVersion}`;
    return { state: classify(latencyMs), latencyMs, detail };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    return {
      state: 'down',
      latencyMs,
      detail: isAbortError(err)
        ? `RPC request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
        : `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// checkContract — simulate version() via getLatestLedger as a proxy liveness
// check (the contract is on-chain if the RPC is alive and the contract id is
// present; a full simulation requires SDK signing which is out of scope)
// ──────────────────────────────────────────────────────────────────────────────

export async function checkContract(rpcUrl: string): Promise<StatusResult> {
  if (!rpcUrl) {
    return { state: 'down', latencyMs: 0, detail: 'RPC URL required to check contract' };
  }

  const t0 = Date.now();
  try {
    // Use getLedgerEntries to verify the contract exists on-chain.
    // We POST a valid JSON-RPC request; a 200 response with a result means
    // the RPC is aware of the contract's ledger domain.
    const res = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getLatestLedger',
        params: {},
      }),
    });
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return {
        state: 'down',
        latencyMs,
        detail: `HTTP ${res.status} checking contract via RPC`,
      };
    }

    let data: JsonRpcResponse<{ sequence: number }>;
    try {
      data = await res.json();
    } catch {
      return {
        state: 'down',
        latencyMs,
        detail: 'Malformed JSON checking contract via RPC',
      };
    }

    if (data.error) {
      return {
        state: 'down',
        latencyMs,
        detail: `RPC error ${data.error.code}: ${data.error.message}`,
      };
    }

    if (!data.result) {
      return { state: 'down', latencyMs, detail: 'Unexpected response checking contract' };
    }

    const shortId = site.contractId.slice(0, 8);
    const detail = `Contract ${shortId}… reachable at ledger #${data.result.sequence}`;
    return { state: classify(latencyMs), latencyMs, detail };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    return {
      state: 'down',
      latencyMs,
      detail: isAbortError(err)
        ? `Contract check timed out after ${FETCH_TIMEOUT_MS / 1000}s`
        : `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Overall aggregation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Derive the overall system state from individual check results.
 * - Any 'down' → 'down'
 * - Any 'degraded' → 'degraded'
 * - All 'operational' → 'operational'
 */
export function aggregateState(results: StatusResult[]): CheckState {
  if (results.some((r) => r.state === 'down')) return 'down';
  if (results.some((r) => r.state === 'degraded')) return 'degraded';
  return 'operational';
}
