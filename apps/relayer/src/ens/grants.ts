import { SELLER_KEYS, scoreKeys } from "@skeptique/shared";

export type Grant = { key: string; account: string };

/**
 * Who may write which text key in one service's own PermissionedResolver (spec/03 "ENS records").
 * Roles are per key, so the relayer alone gets the score keys and the seller alone gets url and description.
 * Nobody gets a resolver-wide role.
 */
export function planResolverGrants(input: { parent: string; relayer: string; seller: string }): Grant[] {
  return [
    ...scoreKeys(input.parent).map((key) => ({ key, account: input.relayer })),
    ...SELLER_KEYS.map((key) => ({ key, account: input.seller })),
  ];
}
