import type { BuyerRun, ServiceView } from "@skeptique/shared";

/** Response body of each API route (spec/03). Later tickets add routes with types from @skeptique/shared. */
export interface ApiRoutes {
  "/health": { ok: true; chainId: number } | { ok: false };
  "/buyer/runs": BuyerRun[];
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

export type ApiClient =ReturnType<typeof createApiClient>;

/** Client for the API configured by NEXT_PUBLIC_API_URL. */
export function apiClient(): ApiClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return createApiClient(baseUrl);
}
