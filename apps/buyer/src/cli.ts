import { parseArgs } from "node:util";
import { ServiceViewSchema } from "@skeptique/shared";
import { payAndCallFor, paymentModeFromEnv } from "./mode";
import { publishBuyerRun, runBuyer, type Strategy } from "./index";

// Runs the skeptique and popularity buyers on one task and posts both runs for the Buyer page.
// Pays on Hedera when the x402 env is set (facilitator + buyer account), otherwise in local mode.
const { values } = parseArgs({
  options: { api: { type: "string" }, category: { type: "string" }, task: { type: "string" } },
});
if (!values.api || !values.category || !values.task)
  throw new Error("Usage: pnpm --filter buyer start --api <url> --category <category> --task '<json>'");
const apiUrl = values.api;

const { mode, signer } = paymentModeFromEnv();
console.log(`payment mode: ${mode}`);
const payAndCall = payAndCallFor(mode, async (url) => {
  const services = ServiceViewSchema.array().parse(await (await fetch(new URL("/services", apiUrl))).json());
  const service = services.find((candidate) => candidate.endpoint === url);
  if (!service) throw new Error(`${url} is not a listed service`);
  return service.pricePerCall;
});

for (const strategy of ["skeptique", "popularity"] as Strategy[]) {
  const run = await runBuyer({
    apiUrl,
    category: values.category,
    task: JSON.parse(values.task),
    strategy,
    payAndCall,
    signer,
  });
  await publishBuyerRun(apiUrl, run);
  console.log(`${strategy}: ${run.explanation}`);
}
