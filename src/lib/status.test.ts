import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkApi,
  checkChainConfig,
  checkRpc,
  checkContract,
  aggregateState,
  DEGRADED_THRESHOLD_MS,
  fetchWithTimeout,
} from './status';

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch globally
// ─────────────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock site so tests are deterministic regardless of env vars
vi.mock('./site', () => ({
  site: {
    apiUrl: 'https://api.example.com',
    contractId: 'CONTRACT_FRONTEND_ID',
    network: 'testnet',
    name: 'TalentTrust',
    tagline: '',
    github: '',
  },
}));

function makeResponse(
  body: unknown,
  status = 200,
  ok = true,
): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return makeResponse({ error: 'fail' }, status, false);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchWithTimeout
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  it('resolves with the response when fetch succeeds', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));
    const res = await fetchWithTimeout('https://example.com');
    expect(res.ok).toBe(true);
  });

  it('aborts after the specified timeout', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          // Simulate the signal aborting
          (init.signal as AbortSignal).addEventListener('abort', () =>
            rej(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );

    const promise = fetchWithTimeout('https://example.com', {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow();
    vi.useRealTimers();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkApi
// ─────────────────────────────────────────────────────────────────────────────

describe('checkApi', () => {
  it('returns operational on successful /health response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ uptime: 100, version: '1.0.0', storage: 'ok' }),
    );
    const result = await checkApi();
    expect(result.state).toBe('operational');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.detail).toMatch(/API/);
  });

  it('returns degraded when latency exceeds threshold', async () => {
    // Simulate slow response by delaying Date.now
    let callCount = 0;
    const origDateNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call returns 0, second call returns threshold + 1
      return callCount === 1 ? 0 : DEGRADED_THRESHOLD_MS + 100;
    });
    mockFetch.mockResolvedValueOnce(makeResponse({ uptime: 100 }));

    const result = await checkApi();
    expect(result.state).toBe('degraded');
    Date.now = origDateNow;
  });

  it('returns down on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(503));
    const result = await checkApi();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/503/);
  });

  it('returns down on malformed JSON', async () => {
    const badRes = {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badRes);
    const result = await checkApi();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed JSON/);
  });

  it('returns down on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await checkApi();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Network error/);
  });

  it('returns down with timeout message on AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);
    const result = await checkApi();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/timed out/i);
  });

  it('includes version in detail when present', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ version: '2.3.1', uptime: 500 }));
    const result = await checkApi();
    expect(result.detail).toMatch(/v2\.3\.1/);
  });

  it('handles health response with no version gracefully', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ uptime: 50 }));
    const result = await checkApi();
    expect(result.state).toBe('operational');
    expect(result.detail).not.toMatch(/vundefined/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkChainConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('checkChainConfig', () => {
  it('returns operational when config matches frontend', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        network: 'testnet',
        contractId: 'CONTRACT_FRONTEND_ID',
        rpcUrl: 'https://rpc.example.com',
      }),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('operational');
    expect(result.detail).toMatch(/testnet/);
    expect(result.rpcUrl).toBe('https://rpc.example.com');
    expect(result.mismatch).toBeUndefined();
  });

  it('returns degraded with mismatch when contractId differs', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        network: 'testnet',
        contractId: 'CONTRACT_BACKEND_OTHER_ID',
        rpcUrl: 'https://rpc.example.com',
      }),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('degraded');
    expect(result.mismatch).toMatch(/Contract ID mismatch/);
    expect(result.detail).toMatch(/CONTRACT_FRONTEND_ID/);
  });

  it('returns degraded with mismatch when network differs', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        network: 'mainnet',
        contractId: 'CONTRACT_FRONTEND_ID',
        rpcUrl: 'https://rpc.example.com',
      }),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('degraded');
    expect(result.mismatch).toMatch(/Network mismatch/);
  });

  it('reports both mismatches when both contractId and network differ', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        network: 'mainnet',
        contractId: 'DIFFERENT_CONTRACT',
        rpcUrl: 'https://rpc.example.com',
      }),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('degraded');
    expect(result.mismatch).toMatch(/Contract ID mismatch/);
    expect(result.mismatch).toMatch(/Network mismatch/);
  });

  it('returns down on non-2xx from /api/v1/chain', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(404));
    const result = await checkChainConfig();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/404/);
  });

  it('returns down on malformed JSON', async () => {
    const badRes = {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad json'); },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badRes);
    const result = await checkChainConfig();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed JSON/);
  });

  it('returns down on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await checkChainConfig();
    expect(result.state).toBe('down');
  });

  it('returns down with timeout message on AbortError', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('Aborted', 'AbortError'),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/timed out/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkRpc
// ─────────────────────────────────────────────────────────────────────────────

describe('checkRpc', () => {
  const RPC_URL = 'https://soroban-testnet.stellar.org';

  it('returns operational on valid getLatestLedger response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { sequence: 12345, protocolVersion: 21 },
      }),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('operational');
    expect(result.detail).toMatch(/Ledger #12345/);
    expect(result.detail).toMatch(/protocol v21/);
  });

  it('returns down when rpcUrl is empty string', async () => {
    const result = await checkRpc('');
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/not configured/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns down on non-2xx HTTP response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(502));
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/502/);
  });

  it('returns down on malformed JSON', async () => {
    const badRes = {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad'); },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badRes);
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed JSON/);
  });

  it('returns down on JSON-RPC error field', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/-32601/);
  });

  it('returns down when result field is missing', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ jsonrpc: '2.0', id: 1 }),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Unexpected RPC/);
  });

  it('returns down on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Network error/);
  });

  it('returns down with timeout message on AbortError', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('Aborted', 'AbortError'),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/timed out/i);
  });

  it('returns degraded when latency exceeds threshold', async () => {
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount === 1 ? 0 : DEGRADED_THRESHOLD_MS + 500;
    });
    mockFetch.mockResolvedValueOnce(
      makeResponse({ jsonrpc: '2.0', id: 1, result: { sequence: 999, protocolVersion: 21 } }),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('degraded');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkContract
// ─────────────────────────────────────────────────────────────────────────────

describe('checkContract', () => {
  const RPC_URL = 'https://soroban-testnet.stellar.org';

  it('returns operational when RPC confirms latest ledger', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        jsonrpc: '2.0',
        id: 2,
        result: { sequence: 55000 },
      }),
    );
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('operational');
    expect(result.detail).toMatch(/CONTRACT/);
    expect(result.detail).toMatch(/55000/);
  });

  it('returns down when rpcUrl is empty', async () => {
    const result = await checkContract('');
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/RPC URL required/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns down on non-2xx HTTP', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/500/);
  });

  it('returns down on malformed JSON', async () => {
    const badRes = {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad'); },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badRes);
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed JSON/);
  });

  it('returns down on JSON-RPC error', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ jsonrpc: '2.0', id: 2, error: { code: -32700, message: 'Parse error' } }),
    );
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/-32700/);
  });

  it('returns down on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Network error/);
  });

  it('returns down with timeout message on AbortError', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/timed out/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateState
// ─────────────────────────────────────────────────────────────────────────────

describe('aggregateState', () => {
  it('returns operational when all results are operational', () => {
    const results = [
      { state: 'operational' as const, latencyMs: 100, detail: '' },
      { state: 'operational' as const, latencyMs: 200, detail: '' },
    ];
    expect(aggregateState(results)).toBe('operational');
  });

  it('returns degraded when any result is degraded (none down)', () => {
    const results = [
      { state: 'operational' as const, latencyMs: 100, detail: '' },
      { state: 'degraded' as const, latencyMs: 2500, detail: '' },
    ];
    expect(aggregateState(results)).toBe('degraded');
  });

  it('returns down when any result is down', () => {
    const results = [
      { state: 'operational' as const, latencyMs: 100, detail: '' },
      { state: 'degraded' as const, latencyMs: 2500, detail: '' },
      { state: 'down' as const, latencyMs: 5001, detail: '' },
    ];
    expect(aggregateState(results)).toBe('down');
  });

  it('returns down even if other results are operational', () => {
    const results = [
      { state: 'operational' as const, latencyMs: 100, detail: '' },
      { state: 'down' as const, latencyMs: 5001, detail: '' },
    ];
    expect(aggregateState(results)).toBe('down');
  });

  it('returns operational for empty array', () => {
    expect(aggregateState([])).toBe('operational');
  });
});
