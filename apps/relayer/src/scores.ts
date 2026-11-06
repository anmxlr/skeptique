import { ensRecordKeys, validateEnsSubname } from "@skeptique/shared/ens";
import { type Hex, isAddress } from "viem";

export interface TextTarget {
  read(name: string, keys: string[]): Promise<Record<string, string | null>>;
  /** Must return only after the entire record batch has a successful mined receipt. */
  write(name: string, records: Record<string, string>): Promise<Hex>;
}

export interface FinalizedScore {
  name: string;
  roundId: string;
  score: number;
  nReveals: number;
  hederaTx: string;
}

export interface CriticSnapshot {
  name: string;
  address: string;
  stake: string;
  honestRounds: number;
  slashes: number;
}

type Result = { status: "written"; transactionHash: Hex } | { status: "unchanged" | "superseded" };

/** One active relayer process per signer. Confirmed ENS records are the durable replay checkpoint. */
export function createScoreRelayer(options: {
  target: TextTarget;
  parentName: string;
  ensureCritic?: (name: string, owner: string) => Promise<void>;
}) {
  const keys = ensRecordKeys(options.parentName);
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation, operation);
    tail = next.catch(() => {});
    return next;
  };
  const update = async (name: string, desired: Record<string, string>): Promise<Result> => {
    const current = await options.target.read(name, Object.keys(desired));
    if (Object.entries(desired).every(([key, value]) => current[key] === value)) return { status: "unchanged" };
    return { status: "written", transactionHash: await options.target.write(name, desired) };
  };

  return {
    finalize(event: FinalizedScore): Promise<Result> {
      return serialize(async () => {
        const name = validateEnsSubname(event.name, options.parentName, "svc");
        if (
          !/^[1-9]\d*$/.test(event.roundId) ||
          !Number.isInteger(event.score) ||
          event.score < 0 ||
          event.score > 100 ||
          !Number.isInteger(event.nReveals) ||
          event.nReveals < 1 ||
          event.nReveals > 255 ||
          !event.hederaTx.trim()
        ) {
          throw new Error("Invalid finalized score");
        }
        const desired = {
          [keys.score]: String(event.score),
          [keys.confidence]: String(Math.min(1, event.nReveals / 5)),
          [keys.round]: event.roundId,
          [keys.hederaTx]: event.hederaTx,
        };
        const current = await options.target.read(name, Object.keys(desired));
        const previousRound = current[keys.round];
        if (previousRound && !/^[1-9]\d*$/.test(previousRound)) throw new Error("Invalid existing ENS round");
        if (previousRound && BigInt(previousRound) > BigInt(event.roundId)) return { status: "superseded" };
        if (Object.entries(desired).every(([key, value]) => current[key] === value)) return { status: "unchanged" };
        if (previousRound === event.roundId) throw new Error("Conflicting finalized round");
        return { status: "written", transactionHash: await options.target.write(name, desired) };
      });
    },
    critic(snapshot: CriticSnapshot): Promise<Result> {
      return serialize(async () => {
        const name = validateEnsSubname(snapshot.name, options.parentName, "critic");
        if (
          !isAddress(snapshot.address) ||
          !/^(0|[1-9]\d*)$/.test(snapshot.stake) ||
          !Number.isSafeInteger(snapshot.honestRounds) ||
          snapshot.honestRounds < 0 ||
          !Number.isSafeInteger(snapshot.slashes) ||
          snapshot.slashes < 0
        )
          throw new Error("Invalid critic snapshot");
        if (!options.ensureCritic) throw new Error("Critic namespace adapter is required");
        await options.ensureCritic(name, snapshot.address);
        return update(name, {
          [keys.stake]: snapshot.stake,
          [keys.honestRounds]: String(snapshot.honestRounds),
          [keys.slashes]: String(snapshot.slashes),
        });
      });
    },
  };
}
