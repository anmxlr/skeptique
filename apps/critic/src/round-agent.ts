import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type CommitmentInput, commitmentHash } from "@skeptique/shared";

export type PendingReveal = {
  roundId: number;
  critic: string;
  score: number;
  salt: `0x${string}`;
  evidenceHash: `0x${string}`;
  claimedCost: string;
};
export interface RoundStateStore {
  get(roundId: number): Promise<PendingReveal | undefined>;
  save(state: PendingReveal): Promise<void>;
  remove(roundId: number): Promise<void>;
}

export interface RoundAgentContract {
  commit(roundId: bigint, commitment: `0x${string}`): Promise<`0x${string}`>;
  reveal(
    roundId: bigint,
    score: number,
    salt: `0x${string}`,
    evidenceHash: `0x${string}`,
    claimedCost: bigint,
  ): Promise<`0x${string}`>;
  waitForReceipt(transaction: `0x${string}`): Promise<{ status: "success" | "reverted" }>;
  isCommitted(roundId: bigint, critic: string): Promise<boolean>;
  isRevealed(roundId: bigint, critic: string): Promise<boolean>;
}

export class FileRoundStateStore implements RoundStateStore {
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async readAll(): Promise<Record<string, PendingReveal>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid critic state file");
      return parsed as Record<string, PendingReveal>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async get(roundId: number): Promise<PendingReveal | undefined> {
    await this.writing;
    return (await this.readAll())[String(roundId)];
  }

  save(state: PendingReveal): Promise<void> {
    return this.update((records) => {
      records[String(state.roundId)] = state;
    });
  }

  remove(roundId: number): Promise<void> {
    return this.update((records) => {
      delete records[String(roundId)];
    });
  }

  private update(change: (records: Record<string, PendingReveal>) => void): Promise<void> {
    const operation = this.writing.then(async () => {
      const records = await this.readAll();
      change(records);
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp-${process.pid}`;
      await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    this.writing = operation.catch(() => {});
    return operation;
  }
}

export function createRoundAgent(options: {
  critic: string;
  contract: RoundAgentContract;
  store: RoundStateStore;
  saltFactory?: () => `0x${string}`;
}) {
  const saltFactory = options.saltFactory ?? (() => `0x${randomBytes(32).toString("hex")}`);
  const validateRoundId = (roundId: number) => {
    if (!Number.isSafeInteger(roundId) || roundId < 1) throw new Error("Invalid round ID");
  };
  const validateOwner = (pending: PendingReveal, roundId: number) => {
    if (pending.roundId !== roundId || pending.critic.toLowerCase() !== options.critic.toLowerCase())
      throw new Error("Saved reveal belongs to a different critic or round");
  };
  const confirm = async (transaction: `0x${string}`) => {
    if ((await options.contract.waitForReceipt(transaction)).status !== "success")
      throw new Error("Round transaction reverted");
  };
  const inFlight = new Map<number, Promise<unknown>>();
  const inRound = <T>(roundId: number, operation: () => Promise<T>): Promise<T> => {
    const current = (inFlight.get(roundId) ?? Promise.resolve()).catch(() => {}).then(operation);
    inFlight.set(roundId, current);
    const cleanup = () => {
      if (inFlight.get(roundId) === current) inFlight.delete(roundId);
    };
    void current.then(cleanup, cleanup);
    return current;
  };
  return {
    commit(input: {
      roundId: number;
      score: number;
      evidenceHash: `0x${string}`;
      claimedCost: string;
    }): Promise<PendingReveal> {
      return inRound(input.roundId, async () => {
        validateRoundId(input.roundId);
        if (!Number.isInteger(input.score) || input.score < 0 || input.score > 100)
          throw new Error("Score must be between 0 and 100");
        if (!/^(0|[1-9]\d*)$/.test(input.claimedCost)) throw new Error("Invalid claimed cost");
        const existing = await options.store.get(input.roundId);
        if (existing) {
          validateOwner(existing, input.roundId);
          if (
            existing.score !== input.score ||
            existing.evidenceHash.toLowerCase() !== input.evidenceHash.toLowerCase() ||
            existing.claimedCost !== input.claimedCost
          )
            throw new Error("A different reveal is already pending for this round");
          if (!(await options.contract.isCommitted(BigInt(input.roundId), options.critic))) {
            await confirm(
              await options.contract.commit(BigInt(input.roundId), commitmentHash(existing as CommitmentInput)),
            );
          }
          return existing;
        }
        const pending: PendingReveal = { ...input, critic: options.critic, salt: saltFactory() };
        const commitment = commitmentHash({
          score: pending.score,
          salt: pending.salt,
          evidenceHash: pending.evidenceHash,
          critic: pending.critic,
        });
        await options.store.save(pending);
        await confirm(await options.contract.commit(BigInt(pending.roundId), commitment));
        return pending;
      });
    },

    reveal(roundId: number): Promise<void> {
      return inRound(roundId, async () => {
        validateRoundId(roundId);
        const pending = await options.store.get(roundId);
        if (!pending) throw new Error("No pending reveal for round");
        validateOwner(pending, roundId);
        if (await options.contract.isRevealed(BigInt(roundId), options.critic)) {
          await options.store.remove(roundId);
          return;
        }
        if (!(await options.contract.isCommitted(BigInt(roundId), options.critic)))
          throw new Error("Critic commitment is not on-chain");
        await confirm(
          await options.contract.reveal(
            BigInt(roundId),
            pending.score,
            pending.salt,
            pending.evidenceHash,
            BigInt(pending.claimedCost),
          ),
        );
        await options.store.remove(roundId);
      });
    },
  };
}
