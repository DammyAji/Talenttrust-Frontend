import type { EscrowContract } from '@/lib/api';

export const disputed: EscrowContract = {
  id: 7,
  title: '=HYPERLINK("http://evil")',
  client: 'GCLIENT7',
  freelancer: 'GFREE7',
  token: 'XLM',
  milestones: [
    { index: 0, title: 'Design, v1', amount: 300, released: true },
    { index: 1, title: '-Build', amount: 700, released: false },
  ],
  totalAmount: 1000,
  fundedAmount: 1000,
  releasedAmount: 300,
  status: 'Disputed',
  reputationIssued: false,
  dispute: { raisedBy: 'GCLIENT7', reason: 'Late "final" delivery\nsee chat', openedAt: '2026-10-02T10:00:00.000Z' },
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};

export const resolved: EscrowContract = {
  id: 8,
  title: 'Логотип café',
  client: 'GCLIENT8',
  freelancer: 'GFREE8',
  token: 'XLM',
  milestones: [{ index: 0, title: 'Logo', amount: 500, released: false }],
  totalAmount: 500,
  fundedAmount: 500,
  releasedAmount: 500,
  status: 'Resolved',
  reputationIssued: false,
  dispute: {
    raisedBy: 'GFREE8',
    reason: 'No reason given',
    openedAt: '2026-10-03T10:00:00.000Z',
    freelancerBps: 5000,
    resolvedAt: '2026-10-04T10:00:00.000Z',
  },
  createdAt: '2026-10-03T09:00:00.000Z',
  updatedAt: '2026-10-04T10:00:00.000Z',
};

// jsdom's Blob has no arrayBuffer()
export const readBlob = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
