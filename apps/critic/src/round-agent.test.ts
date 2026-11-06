import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoundAgent, FileRoundStateStore, type PendingReveal } from "./round-agent";

const critic = `0x${"11".repeat(20)}`;
const salt = `0x${"22".repeat(32)}` as `0x${string}`;
const evidenceHash = `0x${"33".repeat(32)}` as `0x${string}`;
const transaction = `0x${"44".repeat(32)}` as `0x${string}`;
const input = { roundId: 1, score: 80, evidenceHash, claimedCost: "7" };

function harness(pending: PendingReveal | undefined = { ...input, critic, salt }) {
  const store = {
    get: vi.fn(async (_roundId: number): Promise<PendingReveal | undefined> => pending),
    save: vi.fn(async (state: PendingReveal) => {
      pending = state;
    }),
    remove: vi.fn(async () => {
      pending = undefined;
    }),
  };
  const contract = {
    commit: vi.fn(async () => transaction),
    reveal: vi.fn(async () => transaction),
    waitForReceipt: vi.fn(async () => ({ status: "success" as "success" | "reverted" })),
    isCommitted: vi.fn(async () => true),
    isRevealed: vi.fn(async () => false),
  };
  return { store, contract, agent: createRoundAgent({ critic, store, contract, saltFactory: () => salt }) };
}

describe("critic persisted reveal recovery", () => {
  it("preserves the reveal payload when the submitted transaction reverts", async () => {
    const { agent, contract, store } = harness();
    contract.waitForReceipt.mockResolvedValue({ status: "reverted" });
    await expect(agent.reveal(1)).rejects.toThrow("reverted");
    expect(await store.get(1)).toMatchObject(input);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("keeps the payload until a successful receipt is confirmed", async () => {
    const { agent, contract, store } = harness();
    let confirm: (receipt: { status: "success" | "reverted" }) => void = () => {};
    contract.waitForReceipt.mockImplementation(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const revealing = agent.reveal(1);
    await vi.waitFor(() => expect(contract.waitForReceipt).toHaveBeenCalled());
    expect(store.remove).not.toHaveBeenCalled();
    confirm({ status: "success" });
    await revealing;
    expect(store.remove).toHaveBeenCalledWith(1);
  });

  it("recovers a reveal mined before a crash without submitting it twice", async () => {
    const { agent, contract, store } = harness();
    contract.isRevealed.mockResolvedValue(true);
    contract.reveal.mockRejectedValue(new Error("AlreadyRevealed"));
    await agent.reveal(1);
    expect(contract.reveal).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith(1);
  });

  it("rejects another critic or changed claimed cost in a saved payload", async () => {
    const wrongCritic = harness({ ...input, critic: `0x${"55".repeat(20)}`, salt });
    await expect(wrongCritic.agent.commit(input)).rejects.toThrow("different critic");
    await expect(wrongCritic.agent.reveal(1)).rejects.toThrow("different critic");
    await expect(harness().agent.commit({ ...input, claimedCost: "8" })).rejects.toThrow("different reveal");
  });

  it("validates commitment inputs before persisting a new reveal", async () => {
    const { agent, store } = harness();
    store.get.mockResolvedValue(undefined);
    await expect(agent.commit({ ...input, evidenceHash: "0x00" })).rejects.toThrow();
    expect(store.save).not.toHaveBeenCalled();
    await expect(agent.commit({ ...input, roundId: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow("round ID");
  });

  it("awaits confirmation of both commit and reveal", async () => {
    const { agent, contract } = harness();
    contract.isCommitted.mockResolvedValue(false);
    await agent.commit(input);
    expect(contract.waitForReceipt).toHaveBeenCalledWith(transaction);
    contract.isCommitted.mockResolvedValue(true);
    await agent.reveal(1);
    expect(contract.waitForReceipt).toHaveBeenCalledTimes(2);
  });

  it("reuses one persisted salt when the same round is committed concurrently", async () => {
    const { contract } = harness();
    let pending: PendingReveal | undefined;
    let committed = false;
    const store = {
      get: async () => pending,
      save: async (state: PendingReveal) => {
        pending = state;
      },
      remove: async () => {
        pending = undefined;
      },
    };
    contract.isCommitted.mockImplementation(async () => committed);
    contract.commit.mockImplementation(async () => {
      if (committed) throw new Error("AlreadyCommitted");
      committed = true;
      return transaction;
    });
    let salts = 0;
    const agent = createRoundAgent({
      critic,
      store,
      contract,
      saltFactory: () => `0x${(++salts).toString(16).padStart(64, "0")}`,
    });
    const [first, second] = await Promise.all([agent.commit(input), agent.commit(input)]);
    expect(first.salt).toBe(second.salt);
    expect(pending?.salt).toBe(first.salt);
    expect(contract.commit).toHaveBeenCalledTimes(1);
  });
});

describe("file round state store", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("retains both payloads when different rounds are saved concurrently", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skeptic-state-"));
    directories.push(directory);
    const store = new FileRoundStateStore(join(directory, "state.json"));
    await Promise.all([store.save({ ...input, critic, salt }), store.save({ ...input, roundId: 2, critic, salt })]);
    expect(await store.get(1)).toMatchObject({ roundId: 1 });
    expect(await store.get(2)).toMatchObject({ roundId: 2 });
  });
});
