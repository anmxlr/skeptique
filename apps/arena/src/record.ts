import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { ArenaRecord } from "./schema";

/** sha256 over RFC 8785 canonical JSON, the same hashing the API uses for review evidence. */
export function hashCanonical(value: unknown): string {
  const canonical = canonicalize(value);
  if (canonical === undefined) throw new Error("record is not serialisable");
  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}

export const hashRecord = (record: ArenaRecord): string => hashCanonical(record);
