import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { commitmentHash, type CommitmentInput } from '../../../packages/shared/src/index';

export type PendingReveal = { roundId: number; critic: string; score: number; salt: `0x${string}`; evidenceHash: `0x${string}`; claimedCost: string };
export interface RoundStateStore {
  get(roundId: number): Promise<PendingReveal | undefined>;
  save(state: PendingReveal): Promise<void>;
  remove(roundId: number): Promise<void>;
}

export interface RoundAgentContract {
  commit(roundId: bigint, commitment: `0x${string}`): Promise<unknown>;
  reveal(roundId: bigint, score: number, salt: `0x${string}`, evidenceHash: `0x${string}`, claimedCost: bigint): Promise<unknown>;
  isCommitted(roundId: bigint, critic: string): Promise<boolean>;
}

export class FileRoundStateStore implements RoundStateStore {
  constructor(private readonly filePath: string) {}

  private async readAll(): Promise<Record<string, PendingReveal>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid critic state file');
      return parsed as Record<string, PendingReveal>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  async get(roundId: number): Promise<PendingReveal | undefined> {
    return (await this.readAll())[String(roundId)];
  }

  async save(state: PendingReveal): Promise<void> {
    const records = await this.readAll();
    records[String(state.roundId)] = state;
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}`;
    await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }

  async remove(roundId: number): Promise<void> {
    const records = await this.readAll();
    delete records[String(roundId)];
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}`;
    await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}

export function createRoundAgent(options: {
  critic: string;
  contract: RoundAgentContract;
  store: RoundStateStore;
  saltFactory?: () => `0x${string}`;
}) {
  const saltFactory = options.saltFactory ?? (() => `0x${randomBytes(32).toString('hex')}`);
  return {
    async commit(input: { roundId: number; score: number; evidenceHash: `0x${string}`; claimedCost: string }): Promise<PendingReveal> {
      if (!Number.isInteger(input.roundId) || input.roundId < 1) throw new Error('Invalid round ID');
      if (!Number.isInteger(input.score) || input.score < 0 || input.score > 100) throw new Error('Score must be between 0 and 100');
      if (!/^(0|[1-9]\d*)$/.test(input.claimedCost)) throw new Error('Invalid claimed cost');
      const existing = await options.store.get(input.roundId);
      if (existing) {
        if (existing.score !== input.score || existing.evidenceHash !== input.evidenceHash) throw new Error('A different reveal is already pending for this round');
        if (!(await options.contract.isCommitted(BigInt(input.roundId), options.critic))) {
          await options.contract.commit(BigInt(input.roundId), commitmentHash(existing as CommitmentInput));
        }
        return existing;
      }
      const pending: PendingReveal = { ...input, critic: options.critic, salt: saltFactory() };
      await options.store.save(pending);
      const commitment = commitmentHash({ score: pending.score, salt: pending.salt, evidenceHash: pending.evidenceHash, critic: pending.critic });
      await options.contract.commit(BigInt(pending.roundId), commitment);
      return pending;
    },

    async reveal(roundId: number): Promise<void> {
      const pending = await options.store.get(roundId);
      if (!pending) throw new Error('No pending reveal for round');
      if (!(await options.contract.isCommitted(BigInt(roundId), options.critic))) throw new Error('Critic commitment is not on-chain');
      await options.contract.reveal(BigInt(roundId), pending.score, pending.salt, pending.evidenceHash, BigInt(pending.claimedCost));
      await options.store.remove(roundId);
    },
  };
}
