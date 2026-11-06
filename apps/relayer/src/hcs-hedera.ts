import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { auditKey, readAuditLog } from "@skeptique/shared/hcs";
import type { TopicPublisher } from "./hcs";

export interface HederaTopicOptions {
  accountId: string;
  privateKey: string;
  mirrorUrl: string;
  /** Reuse this topic; when absent a new one is created and its id is on the returned publisher. */
  topicId?: string;
  network?: "testnet";
}

/** Publishes to an HCS topic with the relayer's ECDSA key (spec/notes/hedera-x402.md §8). The submit key restricts posting to the relayer. */
export async function createHederaTopicPublisher(
  options: HederaTopicOptions,
): Promise<TopicPublisher & { topicId: string; close(): void }> {
  const key = PrivateKey.fromStringECDSA(options.privateKey.replace(/^0x/, ""));
  const client = Client.forTestnet().setOperator(options.accountId, key);
  let topicId = options.topicId;
  if (!topicId) {
    const receipt = await (
      await new TopicCreateTransaction().setTopicMemo("skeptique audit log").setSubmitKey(key.publicKey).execute(client)
    ).getReceipt(client);
    if (!receipt.topicId) throw new Error("Topic creation returned no topic id");
    topicId = receipt.topicId.toString();
  }
  const id = topicId;
  return {
    topicId: id,
    close: () => client.close(),
    async submit(json) {
      const response = await new TopicMessageSubmitTransaction().setTopicId(id).setMessage(json).execute(client);
      await response.getReceipt(client);
    },
    async postedKeys() {
      const entries = await readAuditLog({ mirrorUrl: options.mirrorUrl, topicId: id, limit: 100 });
      return new Set(entries.map((entry) => auditKey(entry.message)));
    },
  };
}
