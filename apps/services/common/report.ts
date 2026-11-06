export type ReportOptions = {
  apiUrl: string;
  serviceId: number;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
};

/** An `onSettled` handler that tells the API about each paid call. A failed report is logged, never thrown. */
export function reportPaidCalls({ apiUrl, serviceId, fetchImpl = fetch, log = console.error }: ReportOptions) {
  return async (txId: string, payer?: string): Promise<void> => {
    try {
      if (!payer) throw new Error("settlement did not name a payer");
      const res = await fetchImpl(new URL("/calls", apiUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceId, payer }),
      });
      if (!res.ok) throw new Error(`POST /calls responded ${res.status}`);
    } catch (error) {
      log(`call report for ${txId} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
