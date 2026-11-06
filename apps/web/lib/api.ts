import type { BuyerRun, Evidence, RoundView, ServiceView } from "@skeptique/shared";
import { type Deployment, DeploymentSchema } from "@skeptique/shared/deployment";

/** Response body of each API route (spec/03). Later tickets add routes with types from @skeptique/shared. */
export interface CriticView {
  address: string;
  nullifier: string;
  /** Current stake in tinybars. */
  stake: string;
  verdict?: "honest" | "slashed" | "outlier" | "unreviewed";
  lastRoundId?: number;
  slashedAmount?: string;
  honestRounds?: number;
  slashes?: number;
  /** Accrued, unclaimed rewards in tinybars. */
  pendingRewards?: string;
}

export interface ApiRoutes {
  [path: `/services/${string}/reviews`]: { evidenceHash: string; evidence: Evidence }[];
  "/health": { ok: true; chainId: number } | { ok: false };
  "/buyer/runs": BuyerRun[];
  "/critics": CriticView[];
  /** Ranked services; registry-indexed listings also carry their specHash and bounty (tinybars). */
  "/services": (ServiceView & { specHash?: string; bounty?: string })[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`API ${path} responded ${status}`);
  }
}

export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  return {
    async getDeployment(): Promise<Deployment> {
      const response = await fetchImpl(new URL("/deployment", baseUrl));
      if (!response.ok) throw new ApiError(response.status, "/deployment");
      return DeploymentSchema.parse(await response.json());
    },
    async getRound(id: number): Promise<RoundView> {
      if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid round ID");
      const path = `/rounds/${id}`;
      const res = await fetchImpl(new URL(path, baseUrl));
      if (!res.ok) throw new ApiError(res.status, path);
      return res.json() as Promise<RoundView>;
    },
    async get<P extends keyof ApiRoutes>(path: P): Promise<ApiRoutes[P]> {
      const res = await fetchImpl(new URL(path, baseUrl));
      if (!res.ok) throw new ApiError(res.status, path);
      return (await res.json()) as ApiRoutes[P];
    },
  };
}

/** One service, as returned by GET /services/:id. */
export type ServiceDetail = ApiRoutes["/services"][number];

/** GET /services/:id; null when the API does not know the id. */
export async function fetchService(id: number, baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(new URL(`/services/${id}`, baseUrl));
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `/services/${id}`);
  return (await res.json()) as ServiceDetail;
}

/** GET /services/:id/rounds: the service's rounds, oldest first. */
export async function fetchServiceRounds(id: number, baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(new URL(`/services/${id}/rounds`, baseUrl));
  if (!res.ok) throw new ApiError(res.status, `/services/${id}/rounds`);
  return (await res.json()) as RoundView[];
}

/** GET /evidence/:hash; null when the API does not know the hash. */
export async function fetchEvidence(hash: string, baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(new URL(`/evidence/${encodeURIComponent(hash)}`, baseUrl));
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `/evidence/${hash}`);
  return (await res.json()) as Evidence;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Client for the API configured by NEXT_PUBLIC_API_URL. */
export function apiClient(): ApiClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return createApiClient(baseUrl);
}
