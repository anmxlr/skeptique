// Ticket 02 spike: create an HCS topic, submit one message, read it back from the mirror node.
// Usage: ENV_FILE=/path/to/.env node hcs.mjs   (reuses HCS_TOPIC_ID if set, else creates one)
import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hiero-ledger/sdk';
import { config } from 'dotenv';

config({ path: process.env.ENV_FILE ?? '.env' });

const operatorId = AccountId.fromString(process.env.RELAYER_ACCOUNT_ID);
const operatorKey = PrivateKey.fromStringECDSA(process.env.RELAYER_PRIVATE_KEY);
const mirror = process.env.HEDERA_MIRROR_NODE_URL;
const client = Client.forTestnet().setOperator(operatorId, operatorKey);

let topicId = process.env.HCS_TOPIC_ID;
if (!topicId) {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('skeptic audit log')
    .setSubmitKey(operatorKey.publicKey)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  topicId = receipt.topicId.toString();
  console.log(`created topic ${topicId} (tx ${tx.transactionId})`);
}
console.log(`topic: ${topicId}  https://hashscan.io/testnet/topic/${topicId}`);

const message = JSON.stringify({ type: 'agent_spend', spike: 'ticket-02', ts: new Date().toISOString() });
const submit = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client);
const submitReceipt = await submit.getReceipt(client);
const seq = submitReceipt.topicSequenceNumber.toString();
console.log(`submitted seq ${seq} status ${submitReceipt.status} tx ${submit.transactionId}`);

// Mirror node lags consensus by a few seconds; poll.
for (let i = 0; i < 20; i++) {
  const res = await fetch(`${mirror}/api/v1/topics/${topicId}/messages/${seq}`);
  if (res.ok) {
    const m = await res.json();
    console.log(`mirror read-back seq ${m.sequence_number} at ${m.consensus_timestamp}:`);
    console.log(Buffer.from(m.message, 'base64').toString('utf8'));
    client.close();
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.error('message not visible on mirror node after 40s');
client.close();
process.exit(1);
