import { type Address, createPublicClient, http, isAddress } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

export function ensRecordKeys(parentName: string) {
  const parent = normalize(parentName);
  if (!parent.endsWith(".eth")) throw new Error("ENS parent must be under .eth");
  const prefix = parent.split(".").reverse().join(".");
  return {
    score: `${prefix}.score`,
    confidence: `${prefix}.confidence`,
    round: `${prefix}.round`,
    hederaTx: `${prefix}.hedera.tx`,
    stake: `${prefix}.stake`,
    honestRounds: `${prefix}.honestRounds`,
    slashes: `${prefix}.slashes`,
  };
}

export function validateEnsSubname(name: string, parentName: string, namespace: "svc" | "critic"): string {
  const normalized = normalize(name);
  const suffix = `.${namespace}.${normalize(parentName)}`;
  const label = normalized.slice(0, -suffix.length);
  if (!normalized.endsWith(suffix) || !label || label.includes(".")) {
    throw new Error(`Name must be in the ${namespace === "svc" ? "service" : "critic"} namespace`);
  }
  return normalized;
}

export interface EnsScoreReader {
  getBlockNumber(): Promise<bigint>;
  getEnsResolver(query: { name: string; blockNumber: bigint }): Promise<Address | null>;
  getEnsText(query: { name: string; key: string; blockNumber: bigint }): Promise<string | null>;
}

export interface EnsScoreSnapshot {
  name: string;
  resolver: Address;
  score: number;
  confidence: number;
  round: string;
  hederaTx: string;
  blockNumber: string;
  queries: Array<{ method: "getEnsText"; name: string; key: string; blockNumber: string }>;
}

/** Read one coherent snapshot through the chain's Universal Resolver, not an API score mirror. */
export async function readEnsScore(
  client: EnsScoreReader,
  options: { name: string; parentName: string; blockNumber?: bigint },
): Promise<EnsScoreSnapshot | null> {
  const name = validateEnsSubname(options.name, options.parentName, "svc");
  const keys = ensRecordKeys(options.parentName);
  const blockNumber = options.blockNumber ?? (await client.getBlockNumber());
  const requestedKeys = [keys.score, keys.confidence, keys.round, keys.hederaTx];
  const [resolver, ...values] = await Promise.all([
    client.getEnsResolver({ name, blockNumber }),
    ...requestedKeys.map((key) => client.getEnsText({ name, key, blockNumber })),
  ]);
  if (!resolver || values.some((value) => value === null || value === "")) return null;
  if (!isAddress(resolver)) throw new Error("Invalid ENS resolver");
  const [scoreText, confidenceText, round, hederaTx] = values;
  const score = Number(scoreText);
  const confidence = Number(confidenceText);
  if (!/^\d+$/.test(scoreText ?? "") || !Number.isInteger(score) || score < 0 || score > 100)
    throw new Error("Invalid ENS score");
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(confidenceText ?? "") || !Number.isFinite(confidence))
    throw new Error("Invalid ENS confidence");
  if (!round || !/^[1-9]\d*$/.test(round)) throw new Error("Invalid ENS round");
  if (!hederaTx) throw new Error("Invalid ENS transaction reference");
  return {
    name,
    resolver,
    score,
    confidence,
    round,
    hederaTx,
    blockNumber: blockNumber.toString(),
    queries: requestedKeys.map((key) => ({ method: "getEnsText", name, key, blockNumber: blockNumber.toString() })),
  };
}

export function createSepoliaScoreReader(rpcUrl: string): EnsScoreReader {
  const url = new URL(rpcUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid Sepolia RPC URL");
  return createPublicClient({ chain: sepolia, transport: http(url.href, { batch: true }) });
}
