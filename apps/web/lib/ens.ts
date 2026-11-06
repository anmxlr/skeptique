import { createPublicClient, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

export type EnsRecords = { resolver: string; url: string | null; description: string | null };

/** Resolves a name live: its resolver, then its url and description records, through the Universal Resolver. */
export type EnsResolve = (name: string) => Promise<EnsRecords | null>;

export function createEnsResolve(client: Pick<PublicClient, "getEnsResolver" | "getEnsText">): EnsResolve {
  return async (name) => {
    const resolver = await client.getEnsResolver({ name });
    if (!resolver) return null;
    const [url, description] = await Promise.all([
      client.getEnsText({ name, key: "url" }),
      client.getEnsText({ name, key: "description" }),
    ]);
    return { resolver, url, description };
  };
}

/** Resolver for NEXT_PUBLIC_SEPOLIA_RPC_URL; throws when it is not configured. */
export function ensResolve(): EnsResolve {
  const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("NEXT_PUBLIC_SEPOLIA_RPC_URL must be set");
  return createEnsResolve(createPublicClient({ chain: sepolia, transport: http(rpcUrl) }));
}
