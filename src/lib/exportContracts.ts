import type { EscrowContract } from './api';
import { Cell, toCsv } from './csv';

export const CONTRACT_HEADERS = [
  'id',
  'title',
  'status',
  'client',
  'freelancer',
  'token',
  'total',
  'funded',
  'released',
  'inEscrow',
  'milestones',
  'createdAt',
  'updatedAt',
  'disputeRaisedBy',
  'disputeReason',
];

export const MILESTONE_HEADERS = ['contractId', 'contractTitle', 'index', 'milestoneTitle', 'amount', 'released'];

export function contractsToRows(contracts: EscrowContract[]): Cell[][] {
  return contracts.map((c) => [
    c.id,
    c.title,
    c.status,
    c.client,
    c.freelancer,
    c.token,
    c.totalAmount,
    c.fundedAmount,
    c.releasedAmount,
    c.fundedAmount - c.releasedAmount,
    c.milestones?.length ?? 0,
    c.createdAt,
    c.updatedAt,
    c.dispute?.raisedBy,
    c.dispute?.reason,
  ]);
}

export function milestonesToRows(contracts: EscrowContract[]): Cell[][] {
  return contracts.flatMap((c) => (c.milestones ?? []).map((m) => [c.id, c.title, m.index, m.title, m.amount, m.released]));
}

export type ExportKind = 'escrows' | 'milestones';

export function buildExport(kind: ExportKind, contracts: EscrowContract[]): string {
  return kind === 'escrows'
    ? toCsv(CONTRACT_HEADERS, contractsToRows(contracts))
    : toCsv(MILESTONE_HEADERS, milestonesToRows(contracts));
}

export function exportFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `talenttrust-escrows-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.csv`;
}

// BOM so Excel reads the file as UTF-8
export function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
