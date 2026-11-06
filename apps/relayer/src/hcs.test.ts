import type { AuditMessage } from "@skeptique/shared/hcs";
import { describe, expect, it } from "vitest";
import { createAuditLog } from "./hcs";

const finalized: AuditMessage = {
  type: "round_finalized",
  roundId: "3",
  serviceId: "1",
  median: 72,
  nReveals: 5,
  isVoid: false,
  ts: 1,
};
const slash: AuditMessage = {
  type: "critic_slashed",
  critic: "0x0000000000000000000000000000000000000001",
  roundId: "3",
  amount: "100",
  reason: "outlier",
  ts: 1,
};

const publisher = (sent: string[], posted: string[] = []) => ({
  submit: async (json: string) => void sent.push(json),
  postedKeys: async () => new Set(posted),
});

describe("hcs audit log", () => {
  it("posts valid messages and never posts a replayed event twice", async () => {
    const sent: string[] = [];
    const log = createAuditLog(publisher(sent));
    expect(await log.post(finalized)).toEqual({ posted: true });
    expect(await log.post(finalized)).toEqual({ posted: false });
    expect(await Promise.all([log.post(slash), log.post(slash)])).toEqual([{ posted: true }, { posted: false }]);
    expect(sent.map((json) => JSON.parse(json).type)).toEqual(["round_finalized", "critic_slashed"]);
  });
  it("skips events already on the topic after a restart", async () => {
    const sent: string[] = [];
    const log = createAuditLog(publisher(sent, ["round_finalized:3"]));
    expect(await log.post(finalized)).toEqual({ posted: false });
    expect(sent).toEqual([]);
  });
  it("rejects messages that do not match the spec shape without submitting", async () => {
    const sent: string[] = [];
    const log = createAuditLog(publisher(sent));
    await expect(log.post({ ...finalized, median: 500 })).rejects.toThrow();
    expect(sent).toEqual([]);
  });
});
