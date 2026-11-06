import { describe, expect, it, vi } from "vitest";
import { reportPaidCalls } from "./report";

describe("reports paid calls", () => {
  it("posts exactly one /calls with the service id and the payer per settled payment", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 202 }));
    const onSettled = reportPaidCalls({ apiUrl: "http://api.test", serviceId: 4, fetchImpl });
    await onSettled("0.0.1@1.2", "0xAbCdEf0123456789aBcDeF0123456789abcdef01");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("http://api.test/calls");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      serviceId: 4,
      payer: "0xAbCdEf0123456789aBcDeF0123456789abcdef01",
    });
  });

  it("logs a failed report and does not throw, so the paid call still answers", async () => {
    const log = vi.fn();
    for (const fetchImpl of [
      vi.fn(async () => new Response("no", { status: 500 })),
      vi.fn(async () => {
        throw new Error("down");
      }),
    ]) {
      const onSettled = reportPaidCalls({ apiUrl: "http://api.test", serviceId: 1, fetchImpl, log });
      await expect(onSettled("tx", "0.0.5")).resolves.toBeUndefined();
    }
    expect(log).toHaveBeenCalledTimes(2);
  });
});
