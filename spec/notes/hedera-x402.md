# Hedera x402 + HCS + EVM units: research note (ticket 02 spike)

Researched 2026-11-06. Primary sources only. The npm versions were read live from `registry.npmjs.org/<pkg>/latest`. The facilitator `/supported` responses were fetched live on the same day. Anything not found in a primary source is marked **not found**.

## Decision summary

| Item | Decision |
| - | - |
| Primary facilitator | Official x402 facilitator, `https://x402.org/facilitator`. No API key. Advertises `hedera:testnet`, fee payer `0.0.9185802` ([Hedera docs](https://docs.hedera.com/solutions/ai/x402/facilitators.md); live `GET https://x402.org/facilitator/supported`) |
| Fallback facilitator | Blocky402 testnet, `https://api.testnet.blocky402.com`. No API key. Fee payer `0.0.7162784` ([Hedera docs](https://docs.hedera.com/solutions/ai/x402/facilitators.md)) |
| Network id string | `hedera:testnet` (CAIP-2). x402 **v2 only** ([exact-scheme doc](https://docs.hedera.com/solutions/ai/x402/exact-scheme.md)) |
| Asset | Native HBAR, `asset: "0.0.0"`, `amount` in **tinybars** ([spec](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md)). Alternative: testnet USDC `0.0.429274` (6 decimals) ([@x402/hedera README](https://www.npmjs.com/package/@x402/hedera)) |
| Packages | `@x402/core@2.30.0`, `@x402/express@2.30.0` (or `@x402/hono@2.30.0`), `@x402/fetch@2.30.0` (or `@x402/axios@2.30.0`), `@x402/hedera@2.30.0`, `@hiero-ledger/sdk@2.90.1` (`@x402/hedera` depends on it; see §2) |
| Settled tx id | `SettleResponse.transaction`, for example `0.0.9185802@1700000000.000000000`. The id is read from the base64-JSON `PAYMENT-RESPONSE` header |
| EVM | `https://testnet.hashio.io/api`, chain id `296` ([docs](https://docs.hedera.com/evm/development/json-rpc/index.md)) |

Why HBAR and not USDC: HBAR needs no token association. With USDC, both payer and payee must be associated with the token, or settlement fails with `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` ([@x402/hedera README](https://www.npmjs.com/package/@x402/hedera)). HBAR is also the same unit the contracts use for stake and bounty.

## 1. Facilitators listed by Hedera docs

Source for this whole table: https://docs.hedera.com/solutions/ai/x402/facilitators.md. The "Live /supported" column was checked on 2026-11-06.

| Facilitator | Testnet base URL | Hedera testnet? | Network id | Fee payer (testnet) | Key? | Live `/supported` |
| - | - | - | - | - | - | - |
| Official x402 | `https://x402.org/facilitator` | yes | `hedera:testnet` | `0.0.9185802` | none | `{"x402Version":2,"scheme":"exact","network":"hedera:testnet","extra":{"feePayer":"0.0.9185802"}}` |
| Blocky402 | `https://api.testnet.blocky402.com` (mainnet `https://api.blocky402.com`) | yes | `hedera:testnet` | `0.0.7162784` | none | same shape, feePayer `0.0.7162784` |
| Launa | `https://testnet.facilitator.launa.dev` (mainnet needs an account and a dedicated subdomain) | yes | `hedera:testnet` | `0.0.9839454` | none on testnet | same shape, feePayer `0.0.9839454` |
| Self-run | your host | yes | `hedera:testnet` | your account | n/a | build it with `x402Facilitator` from `@x402/core/facilitator` + `ExactHederaScheme` from `@x402/hedera/exact/facilitator` ([README](https://www.npmjs.com/package/@x402/hedera)) ([docs](https://docs.hedera.com/solutions/ai/x402/facilitators.md#run-your-own-hedera-facilitator)) |

- All three expose `GET /supported`, `POST /verify` and `POST /settle` ([docs](https://docs.hedera.com/solutions/ai/x402/facilitators.md)).
- `/supported` returns `kinds[]` with `x402Version: 2`. It also returns `signers: {"hedera:*": ["<feePayer>"]}` (live responses).
- **Assets settled:** `/supported` does not list assets per facilitator. The reference scheme every facilitator implements accepts HBAR (`0.0.0`) and any HTS fungible token ([spec](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md), [README](https://www.npmjs.com/package/@x402/hedera)). The x402 package's built-in default testnet USDC id is `0.0.429274`, and mainnet is `0.0.456858` (constants in the `@x402/hedera@2.30.0` dist, from [typescript/packages/mechanisms/hedera/src/constants.ts](https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/hedera/src/constants.ts)).
- **"Ax402": not found** on docs.hedera.com or in any primary source. Hedera's facilitator page lists Official x402, Launa and Blocky402 only.
- The older `hedera-dev/x402-hedera` fork is alpha and uses the v1 network string `hedera-testnet`. Its hosted facilitator URL now returns 404 ([README](https://github.com/hedera-dev/x402-hedera/blob/main/README.md); live check). **Do not use it.**
- The official facilitator is described as "for quickstart and testnet use". For mainnet, Hedera points to Blocky402 or Launa ([docs](https://docs.hedera.com/solutions/ai/x402/facilitators.md)).

**Recommendation for an unattended agent:** use `x402.org/facilitator` as primary and Blocky402 testnet as fallback. Neither needs a key or a human step. Treat the facilitator URL as a server-side env var (`X402_FACILITATOR_URL`). Fallback means changing that URL: the server picks up `extra.feePayer` from whichever facilitator it syncs with (`enhancePaymentRequirements` copies `supportedKind.extra.feePayer`, `@x402/hedera` server dist).

## 2. npm packages (registry `latest`, 2026-11-06)

| Purpose | Package | Version | Notes |
| - | - | - | - |
| Core types/client/server | `@x402/core` | 2.30.0 | `x402Client`, `x402ResourceServer`, `HTTPFacilitatorClient` (`@x402/core/server`) |
| Express middleware | `@x402/express` | 2.30.0 | `paymentMiddleware(routes, server, ...)` ([README](https://www.npmjs.com/package/@x402/express)) |
| Hono middleware | `@x402/hono` | 2.30.0 | |
| fetch client | `@x402/fetch` | 2.30.0 | `wrapFetchWithPayment`, `wrapFetchWithPaymentFromConfig`, `decodePaymentResponseHeader` ([README](https://www.npmjs.com/package/@x402/fetch)) |
| axios client | `@x402/axios` | 2.30.0 | |
| **Hedera scheme** | `@x402/hedera` | 2.30.0 | subpaths `@x402/hedera/exact/{client,server,facilitator}`. Depends on `@hiero-ledger/sdk` |
| Hedera SDK | `@hiero-ledger/sdk` | 2.90.1 | Hedera docs: "import from `@hiero-ledger/sdk`, not `@hashgraph/sdk`" ([docs banner](https://docs.hedera.com/solutions/ai/x402/pay-with-x402.md)) |
| Legacy SDK | `@hashgraph/sdk` | 2.81.0 | Same repo (hiero-sdk-js). Not recommended |
| Legacy v1 | `x402`, `x402-express`, `x402-fetch`, `x402-hono` 1.2.0; `x402-axios` 1.2.1 | | v1 only. **No Hedera support**, because the Hedera scheme is v2 only |

- The repo moved from `github.com/coinbase/x402` to `github.com/x402-foundation/x402`. Package metadata points at the new repo ([npm x402](https://registry.npmjs.org/x402/latest)).
- **v1 vs v2:**
  - Hedera exists only in v2 (`x402Version: 2`, CAIP-2 network ids) ([exact-scheme doc](https://docs.hedera.com/solutions/ai/x402/exact-scheme.md)).
  - v2 headers are `PAYMENT-REQUIRED` (402 response), `PAYMENT-SIGNATURE` (client retry) and `PAYMENT-RESPONSE` (settlement). v1 used `X-PAYMENT` / `X-PAYMENT-RESPONSE`. The v2 client still reads `X-PAYMENT-RESPONSE` as a fallback (`@x402/core@2.30.0` dist `encodePaymentSignatureHeader` / `getPaymentSettleResponse`).
  - Hedera's client page loosely says "`X-Payment` header (or equivalent)" ([docs](https://docs.hedera.com/solutions/ai/x402/pay-with-x402.md)). For v2 payloads the code sends `PAYMENT-SIGNATURE`.
- **SDK duplication gotcha:** `@x402/hedera` re-exports `PrivateKey`, `AccountId`, `Client`, `TransferTransaction`, `TransactionId` and other SDK classes. Its README warns that importing `@hiero-ledger/sdk` separately in a pnpm workspace can load two SDK copies and throw `t.startsWith is not a function`. **In the x402 path, import SDK classes from `@x402/hedera`** ([README](https://www.npmjs.com/package/@x402/hedera)).

## 3. How the Hedera `exact` scheme works

Sources: [spec](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md), [docs](https://docs.hedera.com/solutions/ai/x402/how-it-works.md) and the `@x402/hedera@2.30.0` dist.

1. The server returns 402 with `PaymentRequirements`:
   ```json
   {"scheme":"exact","network":"hedera:testnet","amount":"1000","asset":"0.0.0","payTo":"0.0.1234","maxTimeoutSeconds":180,"extra":{"feePayer":"0.0.1235"}}
   ```
2. The client builds a `TransferTransaction`:
   - payer `-amount`, `payTo` `+amount`, for HBAR or the HTS token;
   - `transactionId = TransactionId.generate(feePayer)`, so the **facilitator is the fee payer**;
   - the client calls `freezeWith(client)`, signs with its own key, and base64-encodes `toBytes()`.
   - Source: `createClientHederaSigner` in the dist.
3. The payload is `{"payload":{"transaction":"<base64 partially-signed tx>"}}` inside a full `PaymentPayload` (`x402Version:2`, `resource`, `accepted`, `payload`).
4. The facilitator `/verify` checks:
   - it is a direct `TransferTransaction` (no ScheduleCreate);
   - `transactionId.accountId == feePayer`;
   - the transfers net to zero, and the fee payer is never a net sender;
   - a single asset, credited to `payTo` exactly;
   - the payer's signature against its on-chain key (mirror node);
   - preflight: balance and token association;
   - replay.
5. `/settle`: the facilitator adds the fee-payer signature, submits, and waits for a SUCCESS receipt. It returns `{success, transaction: "<txId>", network, payer}`.
- **Payer needs no HBAR for fees.** The facilitator pays them ([docs](https://docs.hedera.com/solutions/ai/x402/pay-with-x402.md)). The payer still needs the asset balance.
- The client must accept `extra.feePayer`. It throws if `feePayer` is missing (dist).
- **Timing:** a Hedera transaction is valid for at most 180 s from its valid start ([transaction properties](https://docs.hedera.com/learn/core-concepts/transactions/properties.md)). So sign right before you send; do not pre-sign and cache.
- **Env vars.** The upstream e2e config is [mechanisms_hedera.json](https://github.com/x402-foundation/x402/blob/main/e2e/config/mechanisms_hedera.json). We map it onto the names already in `.env.example`, with no new vars:
  - server: `X402_FACILITATOR_URL` (set to `https://x402.org/facilitator`), and `payTo` = `SELLER_ACCOUNT_ID` (`0.0.x`);
  - client: `BUYER_ACCOUNT_ID` + `BUYER_PRIVATE_KEY` (critics use the matching entries of `CRITIC_ACCOUNT_IDS` / `CRITIC_PRIVATE_KEYS`);
  - HCS: `HCS_TOPIC_ID` (set to `0.0.11335650`), published by `RELAYER_ACCOUNT_ID` / `RELAYER_PRIVATE_KEY`;
  - shared: `HEDERA_MIRROR_NODE_URL`; the payer accounts must not be hollow (§10).
- **Key format:** `createClientHederaSigner(accountId, PrivateKey)` accepts any SDK `PrivateKey`. The official e2e client uses `PrivateKey.fromStringECDSA(...)` ([e2e client.ts](https://github.com/x402-foundation/x402/blob/main/e2e/clients/typescript/client.ts)). The package's live test "assumes ECDSA" with `0x`-prefixed hex ([README](https://www.npmjs.com/package/@x402/hedera)). **Use ECDSA accounts**, which are also required for Hardhat/EVM ([Hedera docs banner](https://docs.hedera.com/evm/development/json-rpc/index.md)). Create the account and get faucet HBAR at https://portal.hedera.com/ ([README](https://www.npmjs.com/package/@x402/hedera)).
- **Alias policy:** if `payTo` is an EVM-address alias rather than `0.0.x`, the reference facilitator rejects it by default (`aliasPolicy: "reject"`) ([README](https://www.npmjs.com/package/@x402/hedera)). **Always use `0.0.x` account ids for `payTo`.**

## 4. Snippets (adapted from official sources)

There is **no Hedera-specific example server or client** under `examples/` in the x402 repo (repo tree checked). The snippets below combine:
- the Hedera registration code from the [@x402/hedera README](https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/hedera/README.md) and the [Hedera merchant doc](https://docs.hedera.com/solutions/ai/x402/merchant-integration.md);
- the wiring from the [@x402/express README](https://www.npmjs.com/package/@x402/express) and the [@x402/fetch README](https://www.npmjs.com/package/@x402/fetch);
- `spendControls` and the ECDSA key loading from the [e2e client.ts](https://github.com/x402-foundation/x402/blob/main/e2e/clients/typescript/client.ts).

The HBAR route price `{amount:"100000", asset:"0.0.0"}` comes from [mechanisms_hedera.json](https://github.com/x402-foundation/x402/blob/main/e2e/config/mechanisms_hedera.json).

**Server (Express paywall):**
```ts
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";

const facilitator = new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL! }); // https://x402.org/facilitator
const server = new x402ResourceServer(facilitator).register("hedera:*", new ExactHederaScheme());

const app = express();
app.use(paymentMiddleware({
  "POST /run": {
    accepts: [{
      scheme: "exact",
      network: "hedera:testnet",
      price: { asset: "0.0.0", amount: process.env.PRICE_TINYBARS! }, // AssetAmount: HBAR in tinybars
      payTo: process.env.HEDERA_PAY_TO!,                               // "0.0.x"
    }],
    description: "service call",
  },
}, server));
app.post("/run", (req, res) => res.json({ ok: true }));
```
Price notes:
- A `"$0.10"` money price is converted into the default HTS token (USDC), **never HBAR**. `defaultMoneyConversion` throws if the default asset is `0.0.0` (server dist).
- **For HBAR, always pass an AssetAmount.**

**Client (agent, no human approval):**
```ts
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

const signer = createClientHederaSigner(
  process.env.HEDERA_ACCOUNT_ID!,
  PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY!),
  { network: "hedera:testnet" },
);
const client = x402Client.fromConfig({
  schemes: [{ network: "hedera:testnet", client: new ExactHederaScheme(signer) }],
  // HBAR is not a "default asset": without this, spend controls reject 0.0.0.
  spendControls: { allowedAssets: [{ network: "hedera:testnet", asset: "0.0.0", maxAmountPerPayment: maxPriceTinybars }] },
});
client.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
  if (!(await onBeforePay(r.amount, r.payTo))) return { abort: true, reason: "rejected by hook" };
});
const fetchPaid = wrapFetchWithPayment(fetch, client);
const res = await fetchPaid(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const hdr = res.headers.get("PAYMENT-RESPONSE");
const txId = hdr ? decodePaymentResponseHeader(hdr).transaction : null; // "0.0.x@secs.nanos"
```
API facts behind this snippet (`@x402/core@2.30.0` `.d.mts`):
- `x402Client.fromConfig({schemes, policies?, spendControls?, paymentRequirementsSelector?})`.
- `onBeforePaymentCreation(ctx => void | {abort:true, reason})`, where `ctx` = `{paymentRequired, selectedRequirements}`.
- `SpendControls.allowedAssets[]` = `{network, asset, maxAmountPerPayment?: string /* atomic */}`.
- The default cap applies only to recognised default assets and is `"$1"`.
- `spendControls: false` disables all checks. The official e2e client does this, but **we should not**: we want the cap.

## 5. Settled tx id: header, format, HashScan

- The server sets the `PAYMENT-RESPONSE` header to the base64 of the JSON `SettleResponse` (`@x402/core` dist: `return {"PAYMENT-RESPONSE": encoded}`).
- **v2 field names, from the type and the facilitator code:** `{ success, transaction, network, payer?, errorReason?, errorMessage?, amount?, extensions?, extra? }`. The Hedera facilitator sets `transaction: settled.transactionId` (`@x402/hedera` facilitator dist).
  - **Doc inconsistency:** the spec and the Hedera doc example show the field as `"transactionId"` ([spec](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md), [doc](https://docs.hedera.com/solutions/ai/x402/exact-scheme.md)). The shipped code and the `SettleResponse` type use **`transaction`**. Read `transaction` (and optionally fall back to `transactionId`).
- **Format:** `accountID@validStartSeconds.nanos`, for example `0.0.9401@1598924675.82525000` ([transaction properties](https://docs.hedera.com/learn/core-concepts/transactions/properties.md)).
  - In x402 payments the account is the **facilitator's fee payer**, not the buyer, because the client generated the id from `feePayer`.
  - Child transactions can carry `/nonce` (same source).
- **HashScan:** `https://hashscan.io/testnet/transaction/<txId>` accepts the `@` form directly, for example `https://hashscan.io/testnet/transaction/0.0.4649505@1723230945.514991505` ([HTS tutorial](https://docs.hedera.com/native/tutorials/tokens/hts-part1-mint); `${transactionId}` template in [batch-anchor-verify](https://docs.hedera.com/native/tutorials/consensus/batch-anchor-verify)). It also accepts a consensus timestamp (same docs).
- **Mirror node REST** uses a dash form: `GET https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.10-1234567890-000000000` ([API ref](https://docs.hedera.com/api-reference/transactions/get-transaction-by-id.md)).
  - Convert with `id.replace("@","-").replace(/\.(\d+)$/, "-$1")`.
  - The mirror examples show nanos zero-padded to 9 digits. Pad nanos to 9 digits if your source does not already do so. Whether SDK `toString()` always pads: **not verified**. In our live run (§11) the facilitator's id had 9-digit nanos, and the dashed lookup worked.

## 6. Hedera testnet EVM

- JSON-RPC: `https://testnet.hashio.io/api`, chain id **296**. Mainnet is `https://mainnet.hashio.io/api` / 295 ([JSON-RPC relay doc](https://docs.hedera.com/evm/development/json-rpc/index.md), [MetaMask doc](https://docs.hedera.com/evm/quickstart/setup-metamask.md)).
- Explorer: `https://hashscan.io/testnet` ([MetaMask doc](https://docs.hedera.com/evm/quickstart/setup-metamask.md)).
- Hashio is "for development and testing purposes only" ([doc](https://docs.hedera.com/evm/development/json-rpc/index.md)).
- Alternative RPC: `https://296.rpc.thirdweb.com` (same doc).

## 7. HBAR denomination in Solidity vs JSON-RPC

Source for this section: https://docs.hedera.com/evm/differences/hbar-decimals.md

- **Inside Solidity**, `msg.value`, `address.balance` and `call{value:...}` are **tinybars (8 decimals)**. 1 HBAR = 10^8 tinybars. The network divides the transaction `value` by 10^10 before the EVM runs.
- `1 ether` in Solidity is 10^18 **tinybars**, which is 10^10 HBAR. **Never use `ether` or `gwei` literals for HBAR amounts.**
- **JSON-RPC wire** (tx `value`, `eth_getBalance`, `eth_gasPrice`) uses **weibars (18 decimals)**. 1 tinybar = 10^10 weibars. In viem and ethers, `parseEther("1")` = 1 HBAR.
- **Rounding / minimum:**
  - The relay rejects a nonzero `value` below 10^10 wei with JSON-RPC error `-32602` ("Value can't be non-zero and less than 10_000_000_000 wei which is 1 tinybar").
  - Precision finer than a tinybar is **dropped** when the value is converted.
- ABI arguments that carry HBAR amounts are **not converted**. A contract that compares an argument with `msg.value` should take tinybars.
- **Guidance for constants:**
  - Write Solidity constants in tinybars, for example `uint256 constant MIN_STAKE = 10 * 1e8; // 10 HBAR`. Do not use `10 ether`.
  - Client side: `value = parseEther("10")` sends 10 HBAR, which arrives as `msg.value == 10e8`.
  - Keep every client-side value a multiple of 10^10 wei: `tinybars * 10n**10n`.
  - Return values read from contract storage (stake, bounty) are tinybars. Multiply by 10^10 only if you feed them back as a tx `value`.
  - x402 HBAR prices are also tinybars, so x402 prices and contract amounts share one unit.

## 8. HCS (Consensus Service)

**Create a topic and submit a message.** JS SDK, from the [create-first-topic tutorial](https://docs.hedera.com/native/tutorials/consensus/create-first-topic.md):
```js
import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
const client = Client.forTestnet().setOperator(process.env.OPERATOR_ID, process.env.OPERATOR_KEY);
const receipt = await (await new TopicCreateTransaction().setTopicMemo("skeptic events").execute(client)).getReceipt(client);
const topicId = receipt.topicId;               // e.g. 0.0.12345
const r = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(JSON.stringify(evt)).execute(client);
await r.getReceipt(client);                    // status SUCCESS; receipt also exposes topicSequenceNumber (not documented on these pages)
```
See also [create-topic](https://docs.hedera.com/native/consensus/create-topic.md) and [submit-message](https://docs.hedera.com/native/consensus/submit-message.md).
- **Who can publish:** a topic without a submit key is public, so anyone who knows the id can publish ([tutorial](https://docs.hedera.com/native/tutorials/consensus/create-first-topic.md)). Set a submit key so only our relayer can post ([private topic tutorial](https://docs.hedera.com/native/tutorials/consensus/private-topic.md)).

**Read back** with `GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages` ([tutorial](https://docs.hedera.com/native/tutorials/consensus/create-first-topic.md), [API ref](https://docs.hedera.com/api-reference/topics/list-topic-messages-by-id.md)).
- Query params:
  - `limit` (default 25, max 100), `order` (`asc` or `desc`);
  - `sequencenumber`, `timestamp` (for example `gt:`), `encoding`.
- The response contains `messages[]` and `links.next`. Each message has:
  - `consensus_timestamp` (`"1234567890.000000001"`);
  - `message` (**base64**);
  - `payer_account_id`, `running_hash`, `running_hash_version`;
  - `sequence_number` (int64), `topic_id`;
  - `chunk_info` (nullable).
- Decode with `Buffer.from(m.message, "base64").toString("utf8")`.
- Single message: `/api/v1/topics/{id}/messages/{sequenceNumber}` ([topics REST index](https://docs.hedera.com/reference/rest-api/topics/index.md)).
- The tutorial waits about 6 s for the mirror node to catch up. **Reads are eventually consistent.**

**Limits:**
- An HCS message is at most **1024 bytes**.
- The SDK auto-chunks larger messages: default chunk size 1024 B, default max 20 chunks ([submit-message](https://docs.hedera.com/native/consensus/submit-message.md)).
- A chunked message arrives as several mirror rows with `chunk_info`, and the reader must reassemble them ([API ref](https://docs.hedera.com/api-reference/topics/list-topic-messages-by-id.md)).

**Fees (USD), from the [fees table](https://docs.hedera.com/networks/fees.md):**
- ConsensusCreateTopic: \$0.01
- ConsensusSubmitMessage: \$0.0008
- The submit-message page says the baseline is "\$0.0001" ([submit-message](https://docs.hedera.com/native/consensus/submit-message.md)). The two pages disagree. Either way it is well under 0.01 HBAR per message.
- Topics with custom fees cost about \$0.05 per message. **Do not enable custom fees.**

**HashScan topic URL pattern: not found** in Hedera docs. HashScan transaction links (§5) are documented. Our spike prints `https://hashscan.io/testnet/topic/<id>`, but that pattern is not documented. Product code should link the topic's create transaction or the mirror REST URL.

## 9. Facts that affect our interface spec

- **`payAndCall({url, body, maxPrice, signer})`:**
  - `maxPrice` must be an **atomic integer string in tinybars** (HBAR, `0.0.0`) to compare against `PaymentRequirements.amount`, which is a tinybar string ([spec](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md)). If our spec states the price in HBAR decimals or USD, that is wrong for HBAR.
  - Enforce the cap natively with `spendControls.allowedAssets[].maxAmountPerPayment` (atomic). Without that entry, **HBAR payments are rejected by default spend controls** (`@x402/core` types).
- **`signer`:**
  - It is a Hedera `ClientHederaSigner` built from **account id `0.0.x` + SDK `PrivateKey`**, not a viem account or EVM address (`createClientHederaSigner`, [README](https://www.npmjs.com/package/@x402/hedera)).
  - The same ECDSA key can also drive viem on chain 296. The x402 payer is identified by its `0.0.x` id.
- **`onBeforePay(price, merchant)`:**
  - It maps cleanly onto `x402Client.onBeforePaymentCreation`, with `price = selectedRequirements.amount` (tinybars string) and `merchant = selectedRequirements.payTo`.
  - `payTo` is a Hedera account id `0.0.x`, not a URL host or EVM address.
  - Return `{abort:true, reason}` to refuse.
- **`txId`:** comes from `PAYMENT-RESPONSE` → `.transaction`. Format `0.0.<feePayer>@<secs>.<nanos>`. The account prefix is the **facilitator**, not the buyer or the merchant. Use the mirror REST transaction lookup to see the actual transfer parties.
- **`paid`:**
  - `true` when a `PAYMENT-RESPONSE` was present with `success: true`.
  - A free (non-402) response carries no header, so `txId` should be `null` (optional), not an empty string.
  - Settlement happens after the handler runs. If settlement fails, the client gets an error status, not the resource (express README, "Handles settlement after successful response").
- **`Evidence.x402Txs: string[]`:** fine as strings of `0.0.x@s.n`. Do not assume hex hashes or 0x prefixes: these are not EVM tx hashes and are not 32 bytes. If they are stored on chain in Solidity, use `string` / `string[]`, or hash them, never `bytes32`.
- **HCS messages `{type, ...fields, ts}`:**
  - Each JSON message must fit in **1024 bytes**, or it is auto-chunked into several mirror rows ([submit-message](https://docs.hedera.com/native/consensus/submit-message.md)). Keep events small: ids and hashes, not full evidence.
  - The authoritative order and time come from the mirror's `sequence_number` and `consensus_timestamp`. A client-side `ts` is informational only.
- **Stake/bounty in native HBAR in Solidity:**
  - Correct, but all amounts are **tinybars inside the contract**. Do not use `ether`.
  - Callers send weibars: tinybars × 10^10, with any value below 10^10 wei rejected ([decimals doc](https://docs.hedera.com/evm/differences/hbar-decimals.md)).
- **No human approval:** the client signs and the facilitator pays fees. No wallet popup, and the buyer needs no fee HBAR. Settlement waits for consensus (a few seconds) inside the paid request.

## 10. Hollow accounts block x402 payers (found live)

- Our first live payment failed with `402 {"error":"invalid_exact_hedera_payload_signature_invalid"}`.
- Cause: SELLER, BUYER and all three CRITIC accounts were **hollow**. They were created by sending HBAR to an EVM address, so the mirror node returned `key: null` for them. A hollow account "has an account number and alias but no key", and it cannot send until it is completed ([auto account creation](https://docs.hedera.com/learn/core-concepts/accounts/auto-account-creation.md)). The facilitator checks the payer's signature against its on-chain key (§3), so it had nothing to check against.
- Fix, per the same doc ("Complete a Hollow Account"): make the hollow account the **fee payer** of a transaction signed with its ECDSA key. `spikes/hedera-x402/complete-hollow.mjs` does this with a 1-tinybar transfer to DEPLOYER, and it skips accounts that are already complete. All five accounts are now complete (`ECDSA_SECP256K1` key on the mirror node).
- **Rule for later tickets:** any new account that pays over x402 must be complete. Create it with a key (`AccountCreateTransaction`), or run `complete-hollow.mjs` once. An EVM wallet's first JSON-RPC transaction also completes it (same doc).

## 11. Live transcripts (Hedera testnet, 2026-11-06)

Run with `cd spikes/hedera-x402 && npm ci && ENV_FILE=<repo>/.env npm run spike`. The spike is plain node and sits outside the pnpm workspace. Keys are never printed.

**x402 payment** (`x402.mjs`: local Express paywall that pays SELLER; BUYER pays through `x402.org/facilitator`; no human step):
```
paywall up on :4402, facilitator https://x402.org/facilitator, payTo 0.0.11334361
onBeforePay: 100000 tinybar of 0.0.0 to 0.0.11334361 (auto-approved)
status 200 body {"echo":{"hello":"hedera"}}
settle response: {"success":true,"payer":"0.0.11334607","transaction":"0.0.9185802@1793949293.996636002","network":"hedera:testnet"}
settled tx id: 0.0.9185802@1793949293.996636002
hashscan: https://hashscan.io/testnet/transaction/0.0.9185802@1793949293.996636002
```
Mirror check: `GET /api/v1/transactions/0.0.9185802-1793949293-996636002` returned `SUCCESS CRYPTOTRANSFER`, with these transfers:
- BUYER `0.0.11334607`: −100000
- SELLER `0.0.11334361`: +100000
- facilitator `0.0.9185802`: −292492 (the network fee)

This confirms on chain that the buyer pays no fee and the tx id's account is the facilitator. The response field is `transaction`, not `transactionId` (§5).

**HCS** (`hcs.mjs`, RELAYER as operator; the first run created the topic with a submit key):
```
created topic 0.0.11335650 (tx 0.0.11334611@1793948343.733720772)
topic: 0.0.11335650  https://hashscan.io/testnet/topic/0.0.11335650
submitted seq 1 status SUCCESS tx 0.0.11334611@1793948344.804105697
mirror read-back seq 1 at 1793948352.228674019:
{"type":"agent_spend","spike":"ticket-02","ts":"2026-11-06T06:59:12.439Z"}
```
- Consensus to mirror visibility took about 7 s.
- `receipt.topicSequenceNumber` is populated, and the single-message endpoint `/topics/{id}/messages/{seq}` works.

## 12. Where the docs disagree with spec/03 (proposed changes, not applied)

1. **x402 client signature.** `payAndCall({url, body, maxPrice, signer}) -> {response, txId, paid}` stays. Spell out the units:
   - `maxPrice: string`, in tinybars (atomic, HBAR `0.0.0`);
   - `signer: { accountId: string /* 0.0.x */, privateKey: string /* ECDSA hex */ }`;
   - `txId: string | null`, a Hedera tx id `0.0.x@secs.nanos` (null when no payment was needed);
   - `onBeforePay(price /* tinybars string */, merchant /* payTo 0.0.x */)`.

   Smallest change: add one line under "x402 client" with these types.
2. **Service `pricePerCall`.** It is the x402 `amount` in **tinybars**, the same unit the Solidity contract stores. State it as "tinybars" in the `listService` comment and in `ServiceView.pricePerCall`.
3. **`Evidence.x402Txs`.** Keep `string[]`, and add "Hedera tx ids `0.0.x@s.n`, not hex". Never use `bytes32` on chain.
4. **HCS messages.** Add "≤ 1024 bytes UTF-8 JSON per message (no chunking); the mirror `sequence_number` / `consensus_timestamp` are authoritative, `ts` is informational".
5. **Stake, bounty and fee constants.** Add "all HBAR amounts in contracts are tinybars (1 HBAR = 1e8); clients send `value = tinybars * 1e10` wei".

No conflict was found with the HCS audit-topic design, the native-HBAR mechanism or the 'no human approval' requirement.

## Sources

- https://docs.hedera.com/learn/core-concepts/accounts/auto-account-creation.md (hollow accounts)

- https://docs.hedera.com/solutions/ai/x402/facilitators.md
- https://docs.hedera.com/solutions/ai/x402/how-it-works.md
- https://docs.hedera.com/solutions/ai/x402/exact-scheme.md
- https://docs.hedera.com/solutions/ai/x402/merchant-integration.md
- https://docs.hedera.com/solutions/ai/x402/pay-with-x402.md
- https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md
- https://github.com/x402-foundation/x402/tree/main/typescript/packages/mechanisms/hedera (README, src/constants.ts)
- https://github.com/x402-foundation/x402/blob/main/e2e/config/mechanisms_hedera.json
- https://github.com/x402-foundation/x402/blob/main/e2e/clients/typescript/client.ts
- https://registry.npmjs.org/@x402/hedera/latest (plus `@x402/core`, `@x402/express`, `@x402/fetch`, `@x402/axios`, `@x402/hono`, `@hiero-ledger/sdk`, `@hashgraph/sdk`, `x402*`); package dists of `@x402/hedera`, `@x402/core`, `@x402/fetch` and `@x402/express` 2.30.0
- https://www.npmjs.com/package/@x402/express, https://www.npmjs.com/package/@x402/fetch
- Live: https://x402.org/facilitator/supported, https://api.testnet.blocky402.com/supported, https://testnet.facilitator.launa.dev/supported
- https://github.com/hedera-dev/x402-hedera (legacy v1 fork, not recommended)
- https://docs.hedera.com/evm/development/json-rpc/index.md
- https://docs.hedera.com/evm/quickstart/setup-metamask.md
- https://docs.hedera.com/evm/differences/hbar-decimals.md
- https://docs.hedera.com/learn/core-concepts/transactions/properties.md
- https://docs.hedera.com/native/tutorials/consensus/create-first-topic.md
- https://docs.hedera.com/native/consensus/create-topic.md
- https://docs.hedera.com/native/consensus/submit-message.md
- https://docs.hedera.com/api-reference/topics/list-topic-messages-by-id.md
- https://docs.hedera.com/reference/rest-api/topics/index.md
- https://docs.hedera.com/api-reference/transactions/get-transaction-by-id.md
- https://docs.hedera.com/networks/fees.md
- https://docs.hedera.com/native/tutorials/tokens/hts-part1-mint, https://docs.hedera.com/native/tutorials/consensus/batch-anchor-verify (HashScan tx URLs)
