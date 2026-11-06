import { decodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnsTarget, ensResolverAbi } from "./ens-target";
import type { PendingTransaction, TransactionJournal } from "./transaction-journal";

const mocks = vi.hoisted(() => ({
  readContract: vi.fn(),
  getEnsText: vi.fn(),
  getEnsResolver: vi.fn(),
  simulateContract: vi.fn(),
  prepareTransactionRequest: vi.fn(),
  signTransaction: vi.fn(),
  sendRawTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  getBlockNumber: vi.fn(),
}));
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => mocks,
  createWalletClient: () => mocks,
}));
const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
const resolver = "0x0000000000000000000000000000000000000001";
const name = "demo.svc.skeptique.eth";
const records = {
  "eth.skeptique.score": "87",
  "eth.skeptique.confidence": "0.6",
  "eth.skeptique.round": "12",
  "eth.skeptique.hedera.tx": "0xabc",
};
const target = () =>
  createEnsTarget({ transport: http("https://rpc.invalid"), account, parentName: "skeptique.eth" }).target;

describe("ENS scores target", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getBlockNumber.mockResolvedValue(40n);
    mocks.getEnsResolver.mockResolvedValue(resolver);
    mocks.readContract.mockResolvedValue(true);
    mocks.simulateContract.mockImplementation(async (request) => ({ request }));
    mocks.prepareTransactionRequest.mockResolvedValue({});
    mocks.signTransaction.mockResolvedValue("0x1234");
    mocks.sendRawTransaction.mockResolvedValue(`0x${"ab".repeat(32)}`);
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 42n });
    mocks.getEnsText.mockImplementation(async ({ key }) => records[key as keyof typeof records]);
  });
  it("checks each resource role, sends one atomic multicall and pins read-back above a stale RPC head", async () => {
    await target().write(name, records);
    expect(mocks.readContract).toHaveBeenCalledTimes(4);
    expect(mocks.sendRawTransaction).toHaveBeenCalledTimes(1);
    const call = mocks.simulateContract.mock.calls[0][0];
    expect(call.functionName).toBe("multicall");
    expect(
      call.args[0].map((data: `0x${string}`) => decodeFunctionData({ abi: ensResolverAbi, data }).args?.slice(1)),
    ).toEqual(Object.entries(records));
    expect(mocks.getEnsText.mock.calls.every(([query]) => query.blockNumber === 42n)).toBe(true);
  });
  it("cannot write seller keys or write without the relayer setter role", async () => {
    await expect(target().write(name, { url: "https://evil.invalid" })).rejects.toThrow("Disallowed");
    mocks.readContract.mockResolvedValue(false);
    await expect(target().write(name, records)).rejects.toThrow("lacks ENS setter role");
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled();
  });
  it("does not acknowledge a reverted transaction or mismatched resolver read-back", async () => {
    mocks.waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted", blockNumber: 42n });
    await expect(target().write(name, records)).rejects.toThrow("reverted");
    mocks.getEnsText.mockResolvedValue("wrong");
    await expect(target().write(name, records)).rejects.toThrow("read-back mismatch");
  });
  it("propagates RPC outages instead of interpreting them as absent records", async () => {
    mocks.getEnsText.mockRejectedValue(new Error("offline"));
    await expect(target().read(name, Object.keys(records))).rejects.toThrow("offline");
  });
  it("recovers the exact signed transaction after a broadcast crash before replaying", async () => {
    let pending: PendingTransaction | null = null;
    const journal: TransactionJournal = {
      load: async () => pending,
      save: async (value) => {
        pending = value;
      },
      clear: async () => {
        pending = null;
      },
    };
    const make = () =>
      createEnsTarget({ transport: http("https://rpc.invalid"), account, parentName: "skeptique.eth", journal }).target;
    mocks.sendRawTransaction.mockRejectedValueOnce(new Error("connection reset"));
    await expect(make().write(name, records)).rejects.toThrow("connection reset");
    expect(pending).not.toBeNull();
    await make().read(name, Object.keys(records));
    expect(mocks.sendRawTransaction.mock.calls.map(([query]) => query.serializedTransaction)).toEqual([
      "0x1234",
      "0x1234",
    ]);
    expect(mocks.signTransaction).toHaveBeenCalledTimes(1);
    expect(pending).toBeNull();
  });
  it("clears a confirmed reverted transaction so restart can retry after fixing the cause", async () => {
    let pending: PendingTransaction | null = null;
    const journal: TransactionJournal = {
      load: async () => pending,
      save: async (value) => {
        pending = value;
      },
      clear: async () => {
        pending = null;
      },
    };
    const make = () =>
      createEnsTarget({ transport: http("https://rpc.invalid"), account, parentName: "skeptique.eth", journal }).target;
    mocks.waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted", blockNumber: 42n });
    await expect(make().write(name, records)).rejects.toThrow("reverted");
    expect(pending).toBeNull();
    await make().write(name, records);
    expect(mocks.signTransaction).toHaveBeenCalledTimes(2);
    expect(pending).toBeNull();
  });
});
