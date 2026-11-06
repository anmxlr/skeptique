import { serviceByName } from "./catalog";
import { paywallFromEnv, startService } from "./common/server";

// Serves one demo service: `tsx ../start.ts <name>`. HOST defaults to 0.0.0.0, PORT is required by hosts.
const name = process.argv[2] ?? "";
const service = serviceByName(name);
if (!service) throw new Error(`Usage: start.ts <service name>; unknown service "${name}"`);
const paywall = await paywallFromEnv(process.env.PRICE_PER_CALL ?? "1");
const { url } = await startService(service, Number(process.env.PORT ?? 0), process.env.HOST ?? "0.0.0.0", {
  paywall: paywall ?? undefined,
});
console.log(`${name} listening on ${url} (${paywall ? "x402 paywall" : "free local mode"})`);
