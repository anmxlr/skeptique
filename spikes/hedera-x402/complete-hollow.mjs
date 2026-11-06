// Complete hollow accounts (created by sending HBAR to an EVM alias; no key on chain yet).
// A hollow account cannot be verified as an x402 payer until it has paid for one transaction itself.
// https://docs.hedera.com/learn/core-concepts/accounts/auto-account-creation.md#complete-a-hollow-account
// Usage: ENV_FILE=/path/to/.env node complete-hollow.mjs
import { AccountId, Client, Hbar, HbarUnit, PrivateKey, TransferTransaction } from '@hiero-ledger/sdk';
import { config } from 'dotenv';

config({ path: process.env.ENV_FILE ?? '.env', quiet: true });

const env = process.env;
const pairs = [
  [env.SELLER_ACCOUNT_ID, env.SELLER_PRIVATE_KEY],
  [env.BUYER_ACCOUNT_ID, env.BUYER_PRIVATE_KEY],
  ...env.CRITIC_ACCOUNT_IDS.split(',').map((id, i) => [id, env.CRITIC_PRIVATE_KEYS.split(',')[i]]),
];
const sink = AccountId.fromString(env.DEPLOYER_ACCOUNT_ID);

for (const [id, key] of pairs) {
  const info = await (await fetch(`${env.HEDERA_MIRROR_NODE_URL}/api/v1/accounts/${id}`)).json();
  if (info.key) {
    console.log(`${id} already complete (${info.key._type})`);
    continue;
  }
  const account = AccountId.fromString(id);
  const pk = PrivateKey.fromStringECDSA(key);
  const client = Client.forTestnet().setOperator(account, pk); // hollow account is the fee payer
  const tx = await new TransferTransaction()
    .addHbarTransfer(account, Hbar.from(-1, HbarUnit.Tinybar))
    .addHbarTransfer(sink, Hbar.from(1, HbarUnit.Tinybar))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  console.log(`${id} completed: ${receipt.status} tx ${tx.transactionId}`);
  client.close();
}
