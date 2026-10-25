import { rpc as StellarRpc, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { getRpcServer, NETWORK_PASSPHRASE } from './rpc';
import { signTransaction } from './freighter';
import { extractContractErrorCode, CONTRACT_ERRORS } from './escrow';

export type TxStatus =
  | 'idle'
  | 'simulating'
  | 'awaiting_signature'
  | 'submitting'
  | 'confirmed'
  | 'error';

export type StatusCallback = (status: TxStatus, detail?: string) => void;

/**
 * Full pipeline: simulate → sign → submit → poll.
 * Calls `onStatus` at each stage so the UI can show progress.
 */
export async function simulateSignSubmit(
  txXdr: string,
  signerAddress: string,
  onStatus: StatusCallback
): Promise<string> {
  const server = getRpcServer();

  // 1. Simulate
  onStatus('simulating');
  const rawTx = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
  const simResult = await server.simulateTransaction(rawTx);

  if (StellarRpc.Api.isSimulationError(simResult)) {
    const code = extractContractErrorCode(simResult.error);
    const name =
      code !== null ? (CONTRACT_ERRORS[code] ?? `Error #${code}`) : simResult.error;
    throw new Error(name);
  }

  const assembled = StellarRpc.assembleTransaction(
    rawTx,
    simResult as StellarRpc.Api.SimulateTransactionSuccessResponse
  ).build();

  // 2. Sign
  onStatus('awaiting_signature');
  let signedXdr: string;
  try {
    signedXdr = await signTransaction(assembled.toXDR(), {
      networkPassphrase: NETWORK_PASSPHRASE,
      address: signerAddress,
    });
  } catch (err) {
    throw new Error(
      err instanceof Error && err.message.toLowerCase().includes('cancel')
        ? 'Transaction cancelled by user.'
        : `Wallet error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. Submit
  onStatus('submitting');
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sendResult = await server.sendTransaction(signedTx);

  if (sendResult.status === 'ERROR') {
    const errXdr = (sendResult as { errorResult?: xdr.TransactionResult })
      .errorResult;
    throw new Error(`Submit failed: ${errXdr?.toString() ?? 'unknown'}`);
  }

  const hash = sendResult.hash;

  // 4. Poll
  const POLL_MS = 2_000;
  const TIMEOUT_MS = 30_000;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const poll = await server.getTransaction(hash);

    if (poll.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
      onStatus('confirmed', hash);
      return hash;
    }
    if (poll.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain.`);
    }
    // NOT_FOUND → still pending
  }

  throw new Error('RPC timeout: transaction not confirmed within 30 s.');
}
