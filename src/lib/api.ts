import { site } from './site';

export interface Milestone {
  index: number;
  title: string;
  amount: number;
  released: boolean;
}

export interface EscrowContract {
  id: number;
  title: string;
  client: string;
  freelancer: string;
  token: string;
  milestones: Milestone[];
  totalAmount: number;
  fundedAmount: number;
  releasedAmount: number;
  status: 'Created' | 'Funded' | 'Completed' | 'Disputed' | 'Resolved' | 'Cancelled';
  reputationIssued: boolean;
}

export interface Reputation {
  address: string;
  completedContracts: number;
  totalRating: number;
  averageRating: number;
}

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'aborted';

const FRIENDLY_CODES: Record<string, string> = {
  contract_not_found: 'That escrow could not be found. It may have been removed.',
  invalid_status: 'That action is not allowed while the escrow is in its current state.',
  over_funded: 'That deposit would fund the escrow more than its total budget.',
  insufficient_funds: 'There is not enough money in escrow for that action.',
  already_released: 'That milestone has already been released.',
  already_rated: 'The freelancer has already been rated for this escrow.',
  invalid_split: 'The dispute split is invalid. It must be between 0 and 100%.',
  invalid_rating: 'Ratings must be a whole number from 1 to 5.',
  unauthorized: 'You are not allowed to perform that action.',
};

const FRIENDLY_KIND: Record<ApiErrorKind, string> = {
  network: 'We could not reach the TalentTrust API. Check your connection and try again.',
  timeout: 'The TalentTrust API took too long to respond. Please try again.',
  http: 'The TalentTrust API returned an error. Please try again.',
  aborted: 'The request was cancelled.',
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly userMessage: string;

  constructor(opts: { kind: ApiErrorKind; message?: string; status?: number; code?: string; userMessage?: string }) {
    super(opts.message ?? opts.userMessage ?? FRIENDLY_KIND[opts.kind]);
    this.name = 'ApiError';
    this.kind = opts.kind;
    this.status = opts.status;
    this.code = opts.code;
    this.userMessage = opts.userMessage ?? (opts.code && FRIENDLY_CODES[opts.code]) ?? FRIENDLY_KIND[opts.kind];
  }
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_STATUSES = new Set([502, 503, 504]);
const BACKOFF_MS = [250, 750];

const isAbortSignalLike = (s: unknown): s is AbortSignal =>
  typeof s === 'object' && s !== null && typeof (s as AbortSignal).aborted === 'boolean';

export function combineSignals(signals: AbortSignal[]): AbortSignal {
  const live = signals.filter(isAbortSignalLike);
  if (live.length === 1) return live[0];
  const AnyCtor = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof AnyCtor === 'function') return AnyCtor(live);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const s of live) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new ApiError({ kind: 'aborted' }));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiError({ kind: 'aborted' }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

function backoffDelay(attempt: number): number {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  const jitter = base * 0.25 * Math.random();
  return Math.round(base + jitter);
}

function readError(data: unknown): { code?: string; message?: string } {
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    return {
      code: typeof rec.error === 'string' ? rec.error : typeof rec.code === 'string' ? rec.code : undefined,
      message: typeof rec.message === 'string' ? rec.message : undefined,
    };
  }
  return {};
}

function isGet(method: string): boolean {
  return method.toUpperCase() === 'GET';
}

export async function api<T>(path: string, init: ApiOptions = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = isGet(method) ? init.retries ?? MAX_RETRIES : 0;
  const url = `${site.apiUrl}${path}`;

  let attempt = 0;
  for (;;) {
    if (init.signal?.aborted) throw new ApiError({ kind: 'aborted' });

    const timeoutController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);
    const signals = [timeoutController.signal];
    if (init.signal) signals.push(init.signal);
    const signal = combineSignals(signals);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
        signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (init.signal?.aborted) throw new ApiError({ kind: 'aborted' });
      const kind: ApiErrorKind = timedOut ? 'timeout' : 'network';
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(backoffDelay(attempt - 1), init.signal ?? new AbortController().signal);
        continue;
      }
      throw new ApiError({ kind, message: (e as Error)?.message });
    }
    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const { code } = readError(data);
      if (attempt < maxRetries && RETRY_STATUSES.has(res.status)) {
        attempt += 1;
        await sleep(backoffDelay(attempt - 1), init.signal ?? new AbortController().signal);
        continue;
      }
      throw new ApiError({
        kind: 'http',
        status: res.status,
        code,
        message: readError(data).message || `Request failed (${res.status})`,
      });
    }

    return data as T;
  }
}
