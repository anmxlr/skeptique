// Ticket 02 spike: settle one real x402 payment on Hedera testnet (HBAR, exact scheme, x402 v2).
// Starts a local paywalled endpoint (pays SELLER), then pays it as BUYER with no human approval.
// Usage: ENV_FILE=/path/to/.env node x402.mjs
import { HTTPFacilitatorClient } from '@x402/core/server';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';
import { ExactHederaScheme as ClientScheme } from '@x402/hedera/exact/client';
import { ExactHederaScheme as ServerScheme } from '@x402/hedera/exact/server';
import { config } from 'dotenv';
import express from 'express';

config({ path: process.env.ENV_FILE ?? '.env' });

const NETWORK = 'hedera:testnet';
const PRICE_TINYBARS = '100000'; // 0.001 HBAR
const facilitatorUrl = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';
const port = 4402;

// --- server: paywalled endpoint ---
const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitator).register('hedera:*', new ServerScheme());
const app = express();
app.use(express.json());
app.use(
  paymentMiddleware(
    {
      'POST /call': {
        accepts: [
          {
            scheme: 'exact',
            network: NETWORK,
            price: { asset: '0.0.0', amount: PRICE_TINYBARS },
            payTo: process.env.SELLER_ACCOUNT_ID,
          },
        ],
        description: 'spike service call',
      },
    },
    resourceServer,
  ),
);
app.post('/call', (req, res) => res.json({ echo: req.body }));
const httpServer = await new Promise((resolve) => {
  const s = app.listen(port, () => resolve(s));
});
console.log(`paywall up on :${port}, facilitator ${facilitatorUrl}, payTo ${process.env.SELLER_ACCOUNT_ID}`);

// --- client: buyer agent ---
const signer = createClientHederaSigner(
  process.env.BUYER_ACCOUNT_ID,
  PrivateKey.fromStringECDSA(process.env.BUYER_PRIVATE_KEY),
  { network: NETWORK },
);
const client = x402Client.fromConfig({
  schemes: [{ network: NETWORK, client: new ClientScheme(signer) }],
  spendControls: { allowedAssets: [{ network: NETWORK, asset: '0.0.0', maxAmountPerPayment: PRICE_TINYBARS }] },
});
client.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
  console.log(`onBeforePay: ${r.amount} tinybar of ${r.asset} to ${r.payTo} (auto-approved)`);
});
const fetchPaid = wrapFetchWithPayment(fetch, client);

let exitCode = 1;
try {
  const res = await fetchPaid(`http://localhost:${port}/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hello: 'hedera' }),
  });
  console.log(`status ${res.status} body ${await res.text()}`);
  const hdr = res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('X-PAYMENT-RESPONSE');
  if (hdr) {
    const settle = decodePaymentResponseHeader(hdr);
    console.log('settle response:', JSON.stringify(settle));
    const txId = settle.transaction ?? settle.transactionId;
    console.log(`settled tx id: ${txId}`);
    console.log(`hashscan: https://hashscan.io/testnet/transaction/${txId}`);
    exitCode = settle.success ? 0 : 1;
  } else {
    console.error('no PAYMENT-RESPONSE header');
  }
} catch (err) {
  console.error('payment failed:', err);
} finally {
  httpServer.close();
}
process.exit(exitCode);
