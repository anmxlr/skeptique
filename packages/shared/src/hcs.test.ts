import { describe, expect, it } from "vitest";
import { auditKey, encodeAuditMessage, readAuditLog } from "./hcs";

const finalized = {
  type: "round_finalized",
  roundId: "3",
  serviceId: "1",
  median: 72,
  nReveals: 5,
  isVoid: false,
  ts: 1,
} as const;
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

describe("hcs audit messages", () => {
  it("encodes valid messages and rejects malformed ones", () => {
    expect(JSON.parse(encodeAuditMessage(finalized))).toEqual(finalized);
    expect(() => encodeAuditMessage({ ...finalized, median: 101 })).toThrow();
    expect(() => encodeAuditMessage({ type: "nope" } as never)).toThrow();
  });
  it("keys slashes by round and critic", () => {
    const slash = {
      type: "critic_slashed",
      critic: "0xAbC0000000000000000000000000000000000001",
      roundId: "3",
      amount: "100",
      reason: "outlier",
      ts: 1,
    } as const;
    expect(auditKey(slash)).toBe(`critic_slashed:3:${slash.critic.toLowerCase()}`);
    expect(auditKey(finalized)).toBe("round_finalized:3");
  });
  it("reads newest first from the mirror node and skips foreign rows", async () => {
    const urls: string[] = [];
    const entries = await readAuditLog({
      mirrorUrl: "https://mirror.test/",
      topicId: "0.0.9",
      fetch: async (url) => {
        urls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [
              { consensus_timestamp: "2.0", message: b64(finalized), sequence_number: 2 },
              { consensus_timestamp: "1.5", message: Buffer.from("not json").toString("base64"), sequence_number: 1 },
            ],
          }),
        };
      },
    });
    expect(urls[0]).toBe("https://mirror.test/api/v1/topics/0.0.9/messages?order=desc&limit=50");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.sequenceNumber).toBe(2);
    expect(entries[0]?.mirrorUrl).toBe("https://mirror.test/api/v1/topics/0.0.9/messages/2");
  });
});
