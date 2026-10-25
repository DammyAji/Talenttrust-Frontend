import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  TimeoutInfinite,
  nativeToScVal,
  xdr,
  Address,
} from '@stellar/stellar-sdk';
import { getRpcServer, NETWORK_PASSPHRASE } from './rpc';
import { site } from '../site';

// ── Contract error codes ────────────────────────────────────────────────────

export const CONTRACT_ERRORS: Record<number, string> = {
  1: 'AlreadyInitialized',
  2: 'NotInitialized',
  3: 'Unauthorized',
  4: 'InvalidAmount',
  5: 'ContractNotFound',
  6: 'InvalidStatus',
  7: 'MilestoneNotFound',
  8: 'InvalidMilestone',
  9: 'OverFunded',
  10: 'InvalidStatus',
  11: 'ContractAlreadyFunded',
  12: 'MilestoneAlreadyReleased',
  13: 'InsufficientFunds',
  14: 'DisputeNotFound',
};

// ── On-chain types ──────────────────────────────────────────────────────────

export type ContractStatus =
  | 'Created'
  | 'Funded'
  | 'Completed'
  | 'Cancelled'
  | 'Disputed';

export type OnChainMilestone = {
  title: string;
  amount: bigint;    // stroops
  released: boolean;
};

export type OnChainEscrow = {
  id: number;
  client: string;        // Stellar public key
  freelancer: string;    // Stellar public key
  token: string;         // SAC contract address
  totalAmount: bigint;   // stroops
  fundedAmount: bigint;  // stroops
  releasedAmount: bigint; // stroops
  status: ContractStatus;
  milestones: OnChainMilestone[];
};

// ── Contract address helper ─────────────────────────────────────────────────

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID ?? site.contractId;

export function getEscrowContract(): Contract {
  return new Contract(CONTRACT_ADDRESS);
}

// ── ScVal decoders ──────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */

function decodeStatus(val: xdr.ScVal): ContractStatus {
  try {
    const name: string = (val as any).switch()?.name ?? '';
    if (name.includes('Funded')) return 'Funded';
    if (name.includes('Completed')) return 'Completed';
    if (name.includes('Cancelled')) return 'Cancelled';
    if (name.includes('Disputed')) return 'Disputed';
  } catch { /* ignore */ }
  return 'Created';
}

function decodeI128(val: xdr.ScVal): bigint {
  try {
    const parts = (val as any).i128() as { hi: () => any; lo: () => any };
    const hi = BigInt(parts.hi().toString());
    const lo = BigInt(parts.lo().toString());
    return (hi << 64n) | lo;
  } catch {
    return 0n;
  }
}

function decodeString(val: xdr.ScVal): string {
  try {
    const b = (val as any).bytes() as Buffer;
    return Buffer.from(b).toString('utf8');
  } catch {
    try { return (val as any).sym().toString(); } catch { return ''; }
  }
}

function decodeAddress(val: xdr.ScVal): string {
  try {
    return Address.fromScVal(val).toString();
  } catch { return ''; }
}

function decodeBool(val: xdr.ScVal): boolean {
  try { return Boolean((val as any).b()); } catch { return false; }
}

function scMapGet(entries: xdr.ScMapEntry[], key: string): xdr.ScVal | undefined {
  const found = entries.find((e) => {
    try { return ((e as any).key() as any).sym().toString() === key; } catch { return false; }
  });
  if (!found) return undefined;
  return (found as any).val() as xdr.ScVal;
}

function decodeMilestone(val: xdr.ScVal): OnChainMilestone {
  try {
    const entries: xdr.ScMapEntry[] = (val as any).map() ?? [];
    return {
      title: decodeString(scMapGet(entries, 'title') ?? xdr.ScVal.scvVoid()),
      amount: decodeI128(scMapGet(entries, 'amount') ?? xdr.ScVal.scvVoid()),
      released: decodeBool(scMapGet(entries, 'released') ?? xdr.ScVal.scvVoid()),
    };
  } catch {
    return { title: '', amount: 0n, released: false };
  }
}

export function decodeEscrow(raw: xdr.ScVal, id: number): OnChainEscrow {
  const entries: xdr.ScMapEntry[] = (raw as any).map() ?? [];
  const get = (k: string) => scMapGet(entries, k) ?? xdr.ScVal.scvVoid();

  const milestones: OnChainMilestone[] = [];
  try {
    for (const m of ((get('milestones') as any).vec() ?? []) as xdr.ScVal[]) {
      milestones.push(decodeMilestone(m));
    }
  } catch { /* empty */ }

  return {
    id,
    client: decodeAddress(get('client')),
    freelancer: decodeAddress(get('freelancer')),
    token: decodeAddress(get('token')),
    totalAmount: decodeI128(get('total_amount')),
    fundedAmount: decodeI128(get('funded_amount')),
    releasedAmount: decodeI128(get('released_amount')),
    status: decodeStatus(get('status')),
    milestones,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Read helper ─────────────────────────────────────────────────────────────

export async function getContract(id: number): Promise<OnChainEscrow> {
  const server = getRpcServer();
  const contract = getEscrowContract();
  const { Keypair } = await import('@stellar/stellar-sdk');
  const keypair = Keypair.random();

  const account = await server.getAccount(keypair.publicKey()).catch(() => ({
    accountId: () => keypair.publicKey(),
    sequenceNumber: () => '0',
    incrementSequenceNumber: () => {},
  } as unknown as Awaited<ReturnType<typeof server.getAccount>>));

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_contract', nativeToScVal(id, { type: 'u32' })))
    .setTimeout(TimeoutInfinite)
    .build();

  const result = await server.simulateTransaction(tx);
  if ('error' in result) {
    const code = extractContractErrorCode(String(result.error));
    if (code === 5) throw new Error('ContractNotFound');
    throw new Error(String(result.error));
  }

  const sim = result as { result?: { retval: xdr.ScVal } };
  if (!sim.result) throw new Error('No result returned from simulation');
  return decodeEscrow(sim.result.retval, id);
}

// ── TX builders ─────────────────────────────────────────────────────────────

export type BuiltTx = {
  xdr: string;
  networkPassphrase: string;
};

async function buildTx(
  sourceAddress: string,
  ...operations: xdr.Operation[]
): Promise<BuiltTx> {
  const server = getRpcServer();
  const account = await server.getAccount(sourceAddress);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  for (const op of operations) {
    tx.addOperation(op);
  }
  const built = tx.setTimeout(TimeoutInfinite).build();
  return { xdr: built.toXDR(), networkPassphrase: NETWORK_PASSPHRASE };
}

export async function buildDepositTx(
  id: number,
  amountStroops: bigint,
  sourceAddress: string
): Promise<BuiltTx> {
  const contract = getEscrowContract();
  const op = contract.call(
    'deposit_funds',
    nativeToScVal(id, { type: 'u32' }),
    nativeToScVal(amountStroops, { type: 'i128' })
  );
  return buildTx(sourceAddress, op);
}

export async function buildReleaseTx(
  id: number,
  milestoneIndex: number,
  sourceAddress: string
): Promise<BuiltTx> {
  const contract = getEscrowContract();
  const op = contract.call(
    'release_milestone',
    nativeToScVal(id, { type: 'u32' }),
    nativeToScVal(milestoneIndex, { type: 'u32' })
  );
  return buildTx(sourceAddress, op);
}

export async function buildCancelTx(
  id: number,
  sourceAddress: string
): Promise<BuiltTx> {
  const contract = getEscrowContract();
  const op = contract.call(
    'cancel_contract',
    nativeToScVal(id, { type: 'u32' })
  );
  return buildTx(sourceAddress, op);
}

// ── Utilities ───────────────────────────────────────────────────────────────

export function extractContractErrorCode(errStr: string): number | null {
  const m = errStr.match(/Error\(Contract,\s*#(\d+)\)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Format stroops (bigint) as 7-decimal XLM string. No Number() on stroop values. */
export function formatStroops(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const frac = stroops % 10_000_000n;
  const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '') || '0';
  return `${whole}.${fracStr}`;
}
