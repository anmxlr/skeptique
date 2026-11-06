const HEDERA_TX_ID = /^\d+\.\d+\.\d+@\d+\.\d+$/;

/** HashScan testnet link for a settled x402 tx id (`0.0.x@secs.nanos`); null when the id is not one. */
export function hashscanTxUrl(txId: string): string | null {
  return HEDERA_TX_ID.test(txId) ? `https://hashscan.io/testnet/transaction/${txId}` : null;
}
