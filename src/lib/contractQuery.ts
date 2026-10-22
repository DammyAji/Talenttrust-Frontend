import type { EscrowContract } from './api';

export const STATUSES: EscrowContract['status'][] = ['Created', 'Funded', 'Completed', 'Disputed', 'Resolved', 'Cancelled'];

export const SORTS = {
  newest: 'Newest',
  oldest: 'Oldest',
  total: 'Largest total',
  escrow: 'Most in escrow',
} as const;

export type Sort = keyof typeof SORTS;

export const PAGE_SIZE = 10;

export interface ContractQuery {
  status: EscrowContract['status'] | '';
  q: string;
  sort: Sort;
  page: number;
}

export const DEFAULT_QUERY: ContractQuery = { status: '', q: '', sort: 'newest', page: 1 };

export function parseQuery(params: Pick<URLSearchParams, 'get'>): ContractQuery {
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page'));
  return {
    status: (STATUSES as string[]).includes(status) ? (status as ContractQuery['status']) : '',
    q: (params.get('q') ?? '').trim(),
    sort: Object.prototype.hasOwnProperty.call(SORTS, sort) ? (sort as Sort) : 'newest',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function toSearchParams(query: ContractQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

const inEscrow = (c: EscrowContract) => c.fundedAmount - c.releasedAmount;

const compare: Record<Sort, (a: EscrowContract, b: EscrowContract) => number> = {
  newest: (a, b) => b.id - a.id,
  oldest: (a, b) => a.id - b.id,
  total: (a, b) => b.totalAmount - a.totalAmount || b.id - a.id,
  escrow: (a, b) => inEscrow(b) - inEscrow(a) || b.id - a.id,
};

export interface QueryResult {
  items: EscrowContract[];
  total: number;
  page: number;
  pageCount: number;
  from: number;
  to: number;
}

export function applyQuery(list: EscrowContract[], query: ContractQuery): QueryResult {
  const q = query.q.toLowerCase();
  const matches = q
    ? list.filter((c) =>
        [c.title, String(c.id), c.client, c.freelancer].some((v) => v.toLowerCase().includes(q)),
      )
    : list.slice();
  matches.sort(compare[query.sort]);

  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const items = matches.slice(start, start + PAGE_SIZE);
  return { items, total, page, pageCount, from: total ? start + 1 : 0, to: start + items.length };
}
