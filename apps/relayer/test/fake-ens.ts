import type { SubnameChain } from "../src/ens/chain";
import { type Grant, planResolverGrants } from "../src/ens/grants";

/** In-memory PermissionedResolver: text-key roles only, as in spec/notes/ens.md §4. */
export class FakeResolver {
  private readonly roles = new Set<string>();
  readonly text = new Map<string, string>();

  constructor(grants: Grant[]) {
    for (const { key, account } of grants) this.roles.add(`${key}|${account.toLowerCase()}`);
  }

  setText(caller: string, key: string, value: string): void {
    if (!this.roles.has(`${key}|${caller.toLowerCase()}`)) throw new Error("EACUnauthorizedAccountRoles");
    this.text.set(key, value);
  }
}

/** In-memory subname registry; counts creations so tests can see duplicates. */
export class FakeEns implements SubnameChain {
  readonly subnames = new Map<string, { seller: string; resolver: FakeResolver }>();
  creations = 0;

  constructor(
    private readonly parent: string,
    private readonly relayer: string,
  ) {}

  async hasSubname(slug: string) {
    return this.subnames.has(slug);
  }

  async createSubname(input: { slug: string; seller: `0x${string}` }) {
    this.creations += 1;
    const grants = planResolverGrants({ parent: this.parent, relayer: this.relayer, seller: input.seller });
    this.subnames.set(input.slug, { seller: input.seller, resolver: new FakeResolver(grants) });
  }
}
