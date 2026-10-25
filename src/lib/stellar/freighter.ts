/**
 * Minimal adapter over @stellar/freighter-api.
 * Keeps a stable interface whether Freighter is installed or not.
 */

let _freighter: typeof import('@stellar/freighter-api') | null = null;
async function freighter() {
  if (!_freighter) {
    _freighter = await import('@stellar/freighter-api');
  }
  return _freighter;
}

/** Returns the connected Stellar public key, or null if not connected. */
export async function getAddress(): Promise<string | null> {
  try {
    const f = await freighter();
    const result = await f.getAddress();
    return (result as { address: string }).address ?? (result as unknown as string) ?? null;
  } catch {
    return null;
  }
}

/** Returns the network passphrase for the current Freighter network. */
export async function getNetworkPassphrase(): Promise<string> {
  try {
    const f = await freighter();
    const result = await f.getNetworkDetails();
    return result.networkPassphrase;
  } catch {
    return 'Test SDF Network ; September 2015';
  }
}

/**
 * Signs a base64-encoded XDR transaction envelope.
 * Throws with a human-readable message on wallet rejection.
 */
export async function signTransaction(
  xdr: string,
  opts: { networkPassphrase: string; address?: string }
): Promise<string> {
  const f = await freighter();
  const result = await f.signTransaction(xdr, {
    networkPassphrase: opts.networkPassphrase,
    address: opts.address,
  });
  const signed =
    (result as { signedTxXdr: string }).signedTxXdr ?? (result as unknown as string);
  if (!signed) throw new Error('Freighter returned an empty signed transaction.');
  return signed;
}
