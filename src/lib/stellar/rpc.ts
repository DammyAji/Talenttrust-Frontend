import {
  Address,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  type TransactionSource,
  xdr,
} from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import { site } from '../site';

export const RPC_URL = 'https://soroban-testnet.stellar.org';

export const networkPassphrase = site.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;

const server = new Server(RPC_URL);

/** Convert a positional argument to a Soroban ScVal. */
function toScVal(arg: unknown): xdr.ScVal {
  if (typeof arg === 'string') {
    return Address.fromString(arg).toScVal();
  }
  if (typeof arg === 'number' || typeof arg === 'bigint') {
    return xdr.ScVal.scvU64(BigInt(arg));
  }
  throw new Error(`Unsupported simulation argument: ${typeof arg}`);
}

/** A throwaway source account: simulations are read-only and never submitted. */
const simulationSource: TransactionSource = {
  accountId: () => Keypair.random().publicKey(),
  sequenceNumber: () => '0',
  incrementSequenceNumber: () => {
    /* no-op */
  },
};

/**
 * Run a read-only simulation of a Soroban contract call.
 * No transaction is signed or submitted; the RPC node executes the call against the
 * current ledger state and returns the host function result.
 */
export async function simulateRead(method: string, args: unknown[]): Promise<xdr.ScVal> {
  const tx = new TransactionBuilder(simulationSource, {
    fee: '0',
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(site.contractId).toScAddress(),
            functionName: method,
            args: args.map(toScVal),
          }),
        ),
      }),
    )
    .build();

  const sim = await server.simulateTransaction(tx);
  if ('error' in sim) {
    throw new Error(sim.error);
  }
  if (!sim.result?.retval) {
    throw new Error('On-chain read returned no result');
  }
  return sim.result.retval;
}
