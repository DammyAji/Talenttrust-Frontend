import type { EscrowContract } from '@/lib/api';

export const escrow = (id: number, over: Partial<EscrowContract> = {}): EscrowContract => ({
  id,
  title: `Escrow ${id}`,
  client: `GCLIENT${id}`,
  freelancer: `GFREE${id}`,
  token: 'XLM',
  milestones: [],
  totalAmount: 100,
  fundedAmount: 0,
  releasedAmount: 0,
  status: 'Created',
  reputationIssued: false,
  ...over,
});
