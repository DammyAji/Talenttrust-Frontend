import { describe, expect, it } from 'vitest';
import type { EscrowContract } from '@/lib/api';
import { applyQuery, ContractQuery, DEFAULT_QUERY, parseQuery, toSearchParams } from '@/lib/contractQuery';
import { escrow } from '@/test/fixtures';

const q = (over: Partial<ContractQuery> = {}): ContractQuery => ({ ...DEFAULT_QUERY, ...over });
const ids = (list: EscrowContract[]) => list.map((c) => c.id);

describe('parseQuery', () => {
  it.each([
    ['', DEFAULT_QUERY],
    ['status=Funded&q=audit&sort=total&page=2', { status: 'Funded', q: 'audit', sort: 'total', page: 2 }],
    ['status=funded', DEFAULT_QUERY],
    ['status=Bogus', DEFAULT_QUERY],
    ['sort=price', DEFAULT_QUERY],
    ['sort=toString', DEFAULT_QUERY],
    ['page=0', DEFAULT_QUERY],
    ['page=-3', DEFAULT_QUERY],
    ['page=1.5', DEFAULT_QUERY],
    ['page=abc', DEFAULT_QUERY],
    ['q=%20%20logo%20', { ...DEFAULT_QUERY, q: 'logo' }],
  ])('%s', (search, expected) => {
    expect(parseQuery(new URLSearchParams(search))).toEqual(expected);
  });

  it('round-trips through toSearchParams', () => {
    const query = q({ status: 'Disputed', q: 'gabc', sort: 'escrow', page: 3 });
    expect(parseQuery(toSearchParams(query))).toEqual(query);
  });

  it('leaves defaults out of the URL', () => {
    expect(toSearchParams(DEFAULT_QUERY).toString()).toBe('');
    expect(toSearchParams(q({ sort: 'oldest' })).toString()).toBe('sort=oldest');
  });
});

describe('applyQuery', () => {
  const list = [
    escrow(1, { title: 'Logo design', totalAmount: 500, fundedAmount: 500, releasedAmount: 100 }),
    escrow(2, { title: 'Security audit', client: 'GAUDITCLIENT', totalAmount: 900 }),
    escrow(3, { title: 'Docs', freelancer: 'GXYZFREELANCER', totalAmount: 500, fundedAmount: 500 }),
    escrow(12, { title: 'Landing page', totalAmount: 100 }),
  ];

  it.each([
    ['logo', [1]],
    ['LOGO', [1]],
    ['audit', [2]],
    ['xyzfree', [3]],
    ['12', [12]],
    ['1', [12, 1]],
    ['nothing', []],
  ])('search %s', (search, expected) => {
    expect(ids(applyQuery(list, q({ q: search })).items)).toEqual(expected);
  });

  it.each([
    ['newest', [12, 3, 2, 1]],
    ['oldest', [1, 2, 3, 12]],
    ['total', [2, 3, 1, 12]],
    ['escrow', [3, 1, 12, 2]],
  ] as const)('sort %s', (sort, expected) => {
    expect(ids(applyQuery(list, q({ sort })).items)).toEqual(expected);
  });

  it('gives the same order for ties regardless of input order', () => {
    const reversed = list.slice().reverse();
    for (const sort of ['total', 'escrow'] as const) {
      expect(ids(applyQuery(reversed, q({ sort })).items)).toEqual(ids(applyQuery(list, q({ sort })).items));
    }
  });

  it('does not mutate the input', () => {
    const copy = list.slice();
    applyQuery(list, q({ sort: 'oldest' }));
    expect(list).toEqual(copy);
  });

  describe('pagination', () => {
    const many = Array.from({ length: 43 }, (_, i) => escrow(i + 1));

    it('returns the requested page', () => {
      const r = applyQuery(many, q({ page: 2 }));
      expect(r).toMatchObject({ total: 43, page: 2, pageCount: 5, from: 11, to: 20 });
      expect(ids(r.items)).toEqual([33, 32, 31, 30, 29, 28, 27, 26, 25, 24]);
    });

    it('returns a short last page', () => {
      const r = applyQuery(many, q({ page: 5 }));
      expect(r).toMatchObject({ page: 5, from: 41, to: 43 });
      expect(r.items).toHaveLength(3);
    });

    it('clamps a page past the end to the last page', () => {
      expect(applyQuery(many, q({ page: 99 }))).toMatchObject({ page: 5, from: 41, to: 43 });
    });

    it('handles an exact multiple of the page size', () => {
      expect(applyQuery(many.slice(0, 20), q({ page: 3 }))).toMatchObject({ page: 2, pageCount: 2, from: 11, to: 20 });
    });

    it('handles an empty list', () => {
      expect(applyQuery([], q({ page: 4 }))).toEqual({ items: [], total: 0, page: 1, pageCount: 1, from: 0, to: 0 });
    });
  });
});
