import { loadDeployment } from "@skeptique/shared/deployment-file";
import { readAuditLog } from "@skeptique/shared/hcs";
import { http } from "viem";
import { createAuditLog } from "../../apps/relayer/src/hcs";
import { createHederaTopicPublisher } from "../../apps/relayer/src/hcs-hedera";
import { relayAuditFromChain } from "../../apps/relayer/src/hcs-source";

// Re-runs the step-5 audit relay (idempotent: the topic is the checkpoint) and prints what is on the topic.
process.loadEnvFile(new URL("../../.env", import.meta.url));
const e = process.env as Record<string, string>;
const d = await loadDeployment(e.DEPLOYMENT_PATH);
const publisher = await createHederaTopicPublisher({ accountId: e.RELAYER_ACCOUNT_ID, privateKey: e.RELAYER_PRIVATE_KEY, mirrorUrl: e.HEDERA_MIRROR_NODE_URL, topicId: e.HCS_TOPIC_ID });
try {
  const r = await relayAuditFromChain({
    transport: http(e.HEDERA_RPC_URL, { timeout: 60_000, retryCount: 5, retryDelay: 1500 }),
    chainId: d.chainId, fromBlock: BigInt(d.deploymentBlock), confirmations: 1n,
    roundManager: d.contracts.RoundManager, criticRegistry: d.contracts.CriticRegistry, audit: createAuditLog(publisher),
  });
  console.log("posted", r.posted);
  await new Promise((r) => setTimeout(r, 8000));
  for (const m of await readAuditLog({ mirrorUrl: e.HEDERA_MIRROR_NODE_URL, topicId: e.HCS_TOPIC_ID, limit: 8 }))
    console.log(m.sequenceNumber, JSON.stringify(m.message), m.mirrorUrl);
} finally { publisher.close(); }
process.exit(0);
