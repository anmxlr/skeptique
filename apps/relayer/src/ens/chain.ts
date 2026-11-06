/** What the relayer needs from the ENS side. The Sepolia implementation is in ./sepolia. */
export interface SubnameChain {
  hasSubname(slug: string): Promise<boolean>;
  /** Creates `<slug>.svc.<parent>` with its own resolver, owned by the seller with no registry roles. */
  createSubname(input: { slug: string; seller: `0x${string}` }): Promise<unknown>;
}
