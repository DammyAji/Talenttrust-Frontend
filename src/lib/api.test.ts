import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError } from '@/lib/api';

describe('api client hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('returns parsed data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    await expect(api('/x')).resolves.toEqual({ ok: true });
  });

  it('maps a hung request to kind: timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      ),
    );
    const p = api('/x', { timeoutMs: 1000, retries: 0 });
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(1100);
    await assertion;
  });

  it('maps an offline rejection to kind: network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const p = api('/x');
    const assertion = expect(p).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it('keeps backend code on an http error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'over_funded', message: 'nope' }, 409)));
    await expect(api('/x', { method: 'POST' })).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      code: 'over_funded',
    });
  });

  it('uses friendly copy for known backend codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_status', message: 'nope' }, 409)));
    await expect(api('/x', { method: 'POST' })).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && /not allowed/i.test(e.userMessage),
    );
  });

  it('retries a 503 GET twice then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const p = api('/x');
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a POST 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unavailable' }, 503));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/x', { method: 'POST' })).rejects.toMatchObject({ kind: 'http', status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts with kind: aborted and never resolves data', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const p = api('/x', { signal: controller.signal });
    const assertion = expect(p).rejects.toMatchObject({ kind: 'aborted' });
    controller.abort();
    await assertion;
  });

  it('never surfaces a raw fetch error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const p = api('/x');
    const assertion = p.catch((e) => {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).userMessage).not.toContain('Failed to fetch');
    });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });
});
