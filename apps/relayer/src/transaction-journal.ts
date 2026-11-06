import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Hex, keccak256 } from "viem";

export interface PendingTransaction {
  hash: Hex;
  raw: Hex;
}
export interface TransactionJournal {
  load(): Promise<PendingTransaction | null>;
  save(transaction: PendingTransaction): Promise<void>;
  clear(): Promise<void>;
}

/** Atomic replacement; store this on persistent local disk and run one process per signer. */
export function fileTransactionJournal(path: string): TransactionJournal {
  return {
    async load() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const value = JSON.parse(text) as PendingTransaction;
      if (
        !/^0x[0-9a-f]{64}$/i.test(value.hash) ||
        !/^0x[0-9a-f]+$/i.test(value.raw) ||
        keccak256(value.raw) !== value.hash
      )
        throw new Error("Invalid pending ENS transaction journal");
      return value;
    },
    async save(transaction) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(transaction), { mode: 0o600, flush: true });
      await rename(`${path}.tmp`, path);
    },
    async clear() {
      await unlink(path);
    },
  };
}
