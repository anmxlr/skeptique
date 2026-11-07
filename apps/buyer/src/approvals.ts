import { type Approval, ApprovalSchema, type SpendLimits, SpendLimitsSchema } from "@skeptique/shared";
import type { ApprovalRequest } from "./spend";

export interface ApprovalClientOptions {
  apiUrl: string;
  fetchImpl?: typeof fetch;
  /** How long a human has to answer before the payment is denied. */
  timeoutMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Queues a payment on the API and waits for a human; no answer in time is a denial and the request is withdrawn. */
export function createApprovalClient({
  apiUrl,
  fetchImpl = fetch,
  timeoutMs = 120_000,
  pollMs = 1_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}: ApprovalClientOptions) {
  const read = async (res: Response) => ApprovalSchema.parse(await res.json());
  return async (request: ApprovalRequest): Promise<boolean> => {
    const created = await fetchImpl(new URL("/buyer/approvals", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!created.ok) throw new Error(`POST /buyer/approvals responded ${created.status}`);
    const { id } = await read(created);
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      await sleep(pollMs);
      const res = await fetchImpl(new URL(`/buyer/approvals/${id}`, apiUrl));
      if (!res.ok) continue;
      const { status } = (await read(res)) as Approval;
      if (status !== "pending") return status === "approved";
    }
    await fetchImpl(new URL(`/buyer/approvals/${id}/deny`, apiUrl), { method: "POST" }).catch(() => {});
    return false;
  };
}

/** The owner's limits from the API; null while none are set. */
export async function fetchSpendLimits(apiUrl: string, fetchImpl: typeof fetch = fetch): Promise<SpendLimits | null> {
  const res = await fetchImpl(new URL("/buyer/limits", apiUrl));
  if (!res.ok) throw new Error(`GET /buyer/limits responded ${res.status}`);
  const body = await res.json();
  return body === null ? null : SpendLimitsSchema.parse(body);
}
