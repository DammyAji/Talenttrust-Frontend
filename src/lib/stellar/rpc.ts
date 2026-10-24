import {
  Address,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
  rpc as StellarRpc,
} from '@stellar/stellar-sdk';

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? Networks.TESTNET;

let _server: StellarRpc.Server | null = null;

export function getRpcServer(): StellarRpc.Server {
  if (!_server) {
    _server = new StellarRpc.Server(RPC_URL, { allowHttp: false });
  }
  return _server;
}

// ── Legacy simulateRead (used by reputation.ts) ──────────────────────────────

const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID ??
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

/** A throwaway source account — simulations are read-only and never submitted. */
const simulationSource = {
  accountId: () => Keypair.random().publicKey(),
  sequenceNumber: () => '0',
  incrementSequenceNumber: () => { /* no-op */ },
};

/**
 * Run a read-only simulation of a Soroban contract call.
 * No transaction is signed or submitted.
 */
export async function simulateRead(method: string, args: unknown[]): Promise<xdr.ScVal> {
  const server = getRpcServer();

  function toScVal(arg: unknown): xdr.ScVal {
    if (typeof arg === 'string') {
      return Address.fromString(arg).toScVal();
    }
    if (typeof arg === 'number' || typeof arg === 'bigint') {
      return xdr.ScVal.scvU64(new xdr.Uint64(BigInt(arg)));
    }
    throw new Error(`Unsupported simulation argument: ${typeof arg}`);
  }

  const tx = new TransactionBuilder(simulationSource as Parameters<typeof TransactionBuilder>[0], {
    fee: '0',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(CONTRACT_ADDRESS).toScAddress(),
            functionName: method,
            args: args.map(toScVal),
          }),
        ),
      }),
    )
    .build();

  const sim = await server.simulateTransaction(tx);
  if ('error' in sim) {
    throw new Error(String(sim.error));
  }
  const result = sim as { result?: { retval: xdr.ScVal } };
  if (!result.result?.retval) {
    throw new Error('On-chain read returned no result');
  }
  return result.result.retval;
}
