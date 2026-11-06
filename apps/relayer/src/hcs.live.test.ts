import { readAuditLog } from "@skeptique/shared/hcs";
import { describe, expect, it } from "vitest";
import { createAuditLog } from "./hcs";
import { createHederaTopicPublisher } from "./hcs-hedera";

const required = ["RELAYER_ACCOUNT_ID", "RELAYER_PRIVATE_KEY", "HEDERA_MIRROR_NODE_URL"];
describe.skipIf(required.some((key) => !process.env[key]))("hcs audit log (live)", () => {
  it("hcs audit log posts to testnet and reads back from the mirror node", async () => {
    const mirrorUrl = process.env.HEDERA_MIRROR_NODE_URL as string;
    const publisher = await createHederaTopicPublisher({
      accountId: process.env.RELAYER_ACCOUNT_ID as string,
      privateKey: process.env.RELAYER_PRIVATE_KEY as string,
      mirrorUrl,
      topicId: process.env.HCS_TOPIC_ID || undefined,
    });
    try {
      const roundId = String(Date.now());
      const log = createAuditLog(publisher);
      const message = {
        type: "round_finalized",
        roundId,
        serviceId: "1",
        median: 72,
        nReveals: 5,
        isVoid: false,
        ts: Math.floor(Date.now() / 1000),
      } as const;
      expect(await log.post(message)).toEqual({ posted: true });
      expect(await log.post(message)).toEqual({ posted: false });
      let found = false;
      for (let attempt = 0; attempt < 15 && !found; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const entries = await readAuditLog({ mirrorUrl, topicId: publisher.topicId });
        found = entries.some((entry) => entry.message.type === "round_finalized" && entry.message.roundId === roundId);
      }
      expect(found).toBe(true);
    } finally {
      publisher.close();
    }
  }, 120_000);
});
