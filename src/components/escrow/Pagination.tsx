'use client';

interface Props {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageCount, onPageChange }: Props) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span className="small muted">
        Page {page} of {pageCount}
      </span>
      <button className="btn btn-secondary btn-sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
