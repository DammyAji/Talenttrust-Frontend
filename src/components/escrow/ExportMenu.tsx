'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { EscrowContract } from '@/lib/api';
import { buildExport, downloadCsv, ExportKind, exportFilename } from '@/lib/exportContracts';

const OPTIONS: { kind: ExportKind; label: string }[] = [
  { kind: 'escrows', label: 'Escrows (one row each)' },
  { kind: 'milestones', label: 'Milestones (one row each)' },
];

export function ExportMenu({ contracts }: { contracts: EscrowContract[] | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const hint = contracts === null ? 'Loading escrows...' : contracts.length === 0 ? 'Nothing to export yet.' : null;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (hint) setOpen(false);
  }, [hint]);

  const openMenu = (index: number) => {
    setOpen(true);
    requestAnimationFrame(() => items.current[index]?.focus());
  };

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(e.key === 'ArrowDown' ? 0 : OPTIONS.length - 1);
    }
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const i = items.current.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      e.preventDefault();
      items.current[(to + OPTIONS.length) % OPTIONS.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(i + 1);
    else if (e.key === 'ArrowUp') move(i - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(OPTIONS.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') setOpen(false);
  };

  const run = (kind: ExportKind) => {
    if (!contracts?.length) return;
    downloadCsv(buildExport(kind, contracts), exportFilename());
    close();
  };

  return (
    <div className="export" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="btn btn-secondary btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'export-menu' : undefined}
        aria-describedby={hint ? 'export-hint' : undefined}
        disabled={hint !== null}
        onClick={() => (open ? setOpen(false) : openMenu(0))}
        onKeyDown={onTriggerKey}
      >
        Export CSV
      </button>
      {hint && (
        <span id="export-hint" className="small muted">
          {hint}
        </span>
      )}
      {open && (
        <div id="export-menu" className="export-menu" role="menu" aria-label="Export CSV" onKeyDown={onMenuKey}>
          {OPTIONS.map((o, i) => (
            <button
              key={o.kind}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => run(o.kind)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
