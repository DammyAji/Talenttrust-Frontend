'use client';

import { ContractQuery, Sort, SORTS, STATUSES } from '@/lib/contractQuery';

interface Props {
  status: ContractQuery['status'];
  sort: Sort;
  search: string;
  onStatusChange: (status: ContractQuery['status']) => void;
  onSortChange: (sort: Sort) => void;
  onSearchChange: (search: string) => void;
}

export function EscrowToolbar({ status, sort, search, onStatusChange, onSortChange, onSearchChange }: Props) {
  return (
    <div className="toolbar" role="search" aria-label="Filter escrows">
      <div className="field toolbar-search">
        <label htmlFor="escrow-search">Search</label>
        <input
          id="escrow-search"
          className="input"
          type="search"
          placeholder="Title, id or address"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && search) {
              e.preventDefault();
              onSearchChange('');
            }
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="escrow-status">Status</label>
        <select
          id="escrow-status"
          className="input"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as ContractQuery['status'])}
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="escrow-sort">Sort</label>
        <select id="escrow-sort" className="input" value={sort} onChange={(e) => onSortChange(e.target.value as Sort)}>
          {(Object.keys(SORTS) as Sort[]).map((s) => (
            <option key={s} value={s}>
              {SORTS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
