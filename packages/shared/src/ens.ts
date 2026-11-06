/** A service name as one DNS-safe ENS label. */
export function serviceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `<slug>.svc.<parent>` (spec/03 "ENS records"). */
export function serviceEnsName(slug: string, parent: string): string {
  return `${slug}.svc.${parent}`;
}

/** ENSIP-5 service-key prefix: the parent's labels reversed, e.g. `eth.skeptique`. */
export function ensKeyPrefix(parent: string): string {
  return parent.split(".").reverse().join(".");
}

/** Text keys only the relayer may write on a service subname. */
export function scoreKeys(parent: string): string[] {
  const prefix = ensKeyPrefix(parent);
  return ["score", "confidence", "round", "hedera.tx"].map((key) => `${prefix}.${key}`);
}

/** Text keys only the seller may write on their own subname. */
export const SELLER_KEYS = ["url", "description"] as const;
