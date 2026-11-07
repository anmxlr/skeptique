import { parseArgs } from "node:util";
import { ServiceViewSchema } from "@skeptique/shared";
import { createHederaPayAndCall, createLocalPayAndCall } from "@skeptique/x402-client";
import { createApprovalClient, fetchSpendLimits } from "./approvals";
import { publishBuyerRun, runBuyer, type Strategy } from "./index";
import { payAndCallFor, paymentModeFromEnv } from "./mode";
import { createSpendControls } from "./spend";

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
const priceFor = async (url: string) => {
  const services = ServiceViewSchema.array().parse(await (await fetch(new URL("/services", apiUrl))).json());
  const service = services.find((candidate) => candidate.endpoint === url);
  if (!service) throw new Error(`${url} is not a listed service`);
  return service.pricePerCall;
};

// With limits set on the Buyer page, every payment goes through the spend controls and is posted to the audit topic.
// Hedera mode checks the merchant's payTo account against the allowlist; local mode checks the service origin.
const controls = (await fetchSpendLimits(apiUrl))
  ? createSpendControls({
      limits: () => fetchSpendLimits(apiUrl),
      approve: createApprovalClient({ apiUrl }),
      audit: await auditPoster(),
      payer: process.env.BUYER_ACCOUNT_ID,
    })
  : null;
if (!controls) console.log("no spend limits set: paying without spend controls");
const payAndCall = controls
  ? controls.wrap((onBeforePay) =>
      mode === "hedera" ? createHederaPayAndCall({ onBeforePay }) : createLocalPayAndCall({ priceFor, onBeforePay }),
    )
  : payAndCallFor(mode, priceFor);

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

async function auditPoster() {
  const { HCS_TOPIC_ID, RELAYER_ACCOUNT_ID, RELAYER_PRIVATE_KEY, HEDERA_MIRROR_NODE_URL } = process.env;
  if (!(HCS_TOPIC_ID && RELAYER_ACCOUNT_ID && RELAYER_PRIVATE_KEY && HEDERA_MIRROR_NODE_URL)) {
    console.log("HCS audit env not set: agent_spend messages are not posted");
    return async () => {};
  }
  const { createAuditLog, createHederaTopicPublisher } = await import("@skeptique/relayer");
  const publisher = await createHederaTopicPublisher({
    accountId: RELAYER_ACCOUNT_ID,
    privateKey: RELAYER_PRIVATE_KEY,
    mirrorUrl: HEDERA_MIRROR_NODE_URL,
    topicId: HCS_TOPIC_ID,
  });
  const log = createAuditLog(publisher);
  process.once("beforeExit", () => publisher.close());
  return (message: Parameters<typeof log.post>[0]) => log.post(message);
}
