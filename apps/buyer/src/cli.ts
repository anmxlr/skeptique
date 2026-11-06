import { parseArgs } from "node:util";
import { ServiceViewSchema } from "@skeptique/shared";
import { createLocalPayAndCall } from "@skeptique/x402-client";
import { publishBuyerRun, runBuyer, type Strategy } from "./index";

// Runs the skeptique and popularity buyers on one task and posts both runs for the Buyer page.
// Payments use the x402 client's local mode until ticket 15 adds Hedera mode.
const { values } = parseArgs({
  options: { api: { type: "string" }, category: { type: "string" }, task: { type: "string" } },
});
if (!values.api || !values.category || !values.task)
  throw new Error("Usage: pnpm --filter buyer start --api <url> --category <category> --task '<json>'");
const apiUrl = values.api;

const payAndCall = createLocalPayAndCall({
  priceFor: async (url) => {
    const services = ServiceViewSchema.array().parse(await (await fetch(new URL("/services", apiUrl))).json());
    const service = services.find((candidate) => candidate.endpoint === url);
    if (!service) throw new Error(`${url} is not a listed service`);
    return service.pricePerCall;
  },
});

for (const strategy of ["skeptique", "popularity"] as Strategy[]) {
  const run = await runBuyer({
    apiUrl,
    category: values.category,
    task: JSON.parse(values.task),
    strategy,
    payAndCall,
    signer: null,
  });
  await publishBuyerRun(apiUrl, run);
  console.log(`${strategy}: ${run.explanation}`);
}
