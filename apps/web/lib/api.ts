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
    /** POST JSON; resolves with any status so callers can show the API's own reason for a refusal. */
    async post(path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
      const res = await fetchImpl(new URL(path, baseUrl), {
        method: "POST",
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Client for the API configured by NEXT_PUBLIC_API_URL. */
export function apiClient(): ApiClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return createApiClient(baseUrl);
}
