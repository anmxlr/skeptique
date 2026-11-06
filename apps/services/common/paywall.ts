import type { IncomingMessage, ServerResponse } from "node:http";
import { HTTPFacilitatorClient, type HTTPRequestContext, x402HTTPResourceServer } from "@x402/core/http";
import { x402ResourceServer } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";

export type PaywallOptions = {
  facilitatorUrl: string;
  /** Hedera account id `0.0.x` that receives the payments. */
  payTo: string;
  /** Price per call in tinybars (HBAR, asset 0.0.0). */
  price: string;
  /** Called with each settled Hedera tx id. */
  onSettled?: (txId: string) => void;
};

export type Paywall = {
  /** Returns true when the call may run; otherwise the 402 (or error) response has been written. */
  guard(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  /** Settles a guarded call after its handler succeeded; returns the headers to send, or null on failure. */
  settle(
    request: IncomingMessage,
  ): Promise<
    | { headers: Record<string, string> }
    | { failure: { status: number; headers: Record<string, string>; body?: unknown } }
  >;
};

const ROUTE = "POST /call";

function context(request: IncomingMessage): HTTPRequestContext {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const header = (name: string) => {
    const value = request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    adapter: {
      getHeader: header,
      getMethod: () => request.method ?? "POST",
      getPath: () => url.pathname,
      getUrl: () => url.href,
      getAcceptHeader: () => header("accept") ?? "",
      getUserAgent: () => header("user-agent") ?? "",
    },
    path: url.pathname,
    method: request.method ?? "POST",
    paymentHeader: header("payment-signature") ?? header("x-payment"),
  };
}

function sendInstructions(
  response: ServerResponse,
  instructions: { status: number; headers: Record<string, string>; body?: unknown },
) {
  response.writeHead(instructions.status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
    ...instructions.headers,
  });
  response.end(JSON.stringify(instructions.body ?? {}));
}

// x402 v2 paywall for a service's POST /call: HBAR in tinybars on hedera:testnet, settled by the facilitator.
export async function createPaywall({ facilitatorUrl, payTo, price, onSettled }: PaywallOptions): Promise<Paywall> {
  const resources = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl })).register(
    "hedera:*",
    new ExactHederaScheme(),
  );
  const http = new x402HTTPResourceServer(resources, {
    [ROUTE]: {
      accepts: [{ scheme: "exact", network: "hedera:testnet", price: { asset: "0.0.0", amount: price }, payTo }],
      description: "service call",
    },
  });
  await http.initialize();
  const pending = new WeakMap<
    IncomingMessage,
    Extract<Awaited<ReturnType<typeof http.processHTTPRequest>>, { type: "payment-verified" }>
  >();

  return {
    async guard(request, response) {
      const result = await http.processHTTPRequest(context(request));
      if (result.type === "payment-error") {
        sendInstructions(response, result.response);
        return false;
      }
      if (result.type === "payment-verified") pending.set(request, result);
      return true;
    },
    async settle(request) {
      const verified = pending.get(request);
      if (!verified) return { headers: {} };
      const settled = await http.processSettlement(
        verified.paymentPayload,
        verified.paymentRequirements,
        verified.declaredExtensions,
        { request: context(request) },
        undefined,
        verified.beforeHandlerSettlement,
      );
      if (!settled.success) return { failure: settled.response };
      if (settled.transaction) onSettled?.(settled.transaction);
      return { headers: settled.headers };
    },
  };
}
