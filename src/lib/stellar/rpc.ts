import { rpc as StellarRpc, Networks } from '@stellar/stellar-sdk';

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
