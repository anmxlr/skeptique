import { paymentModeFromEnv } from "@skeptique/buyer/mode";
import { ServiceViewSchema } from "@skeptique/shared";
import { createHederaPayAndCall, type PayAndCall } from "@skeptique/x402-client";
import { createClaudeCliLlm } from "./llm";
import type { SpendPolicy } from "./policy";
import { buildArenaServer } from "./server";

/*
 * Starts the arena against a running Skeptique API. Payments always settle on Hedera testnet: the
 * process refuses to start without the facilitator and buyer account, if a buyer is also the seller,
 * or if any listed endpoint does not demand payment (HTTP 402).
 */
export const fail = (message: string): never => {
  console.error(`arena: ${message}`);
  process.exit(1);
};

/** Serialises payments when both sides share one account, so two x402 payments never race. */
function serial(pay: PayAndCall): PayAndCall {
  let tail: Promise<unknown> = Promise.resolve();
  return (args) => {
    const next = tail.then(() => pay(args));
    tail = next.catch(() => {});
    return next;
  };
}

export async function startArena(apiUrl: string, env: Record<string, string | undefined> = process.env) {
  const webOrigin = env.WEB_ORIGIN ?? "http://localhost:3000";
  const port = Number(env.ARENA_PORT ?? 4320);
  const mode = paymentModeFromEnv(env);
  if (mode.mode !== "hedera")
    fail("Hedera x402 is required: set X402_FACILITATOR_URL, BUYER_ACCOUNT_ID and BUYER_PRIVATE_KEY");
  const buyer = (mode as Extract<typeof mode, { mode: "hedera" }>).signer;
  const baselineSigner =
    env.ARENA_BASELINE_ACCOUNT_ID && env.ARENA_BASELINE_PRIVATE_KEY
      ? { accountId: env.ARENA_BASELINE_ACCOUNT_ID, privateKey: env.ARENA_BASELINE_PRIVATE_KEY }
      : buyer;
  if (env.SELLER_ACCOUNT_ID && [buyer.accountId, baselineSigner.accountId].includes(env.SELLER_ACCOUNT_ID))
    fail("SELLER_ACCOUNT_ID must differ from the buyer accounts, or payments would move no money");

  const shared = baselineSigner === buyer ? serial(createHederaPayAndCall()) : null;
  const budgetTinybars = BigInt(env.ARENA_BUDGET_TINYBARS ?? "100000000");
  const maxPerCallTinybars = BigInt(env.ARENA_MAX_PER_CALL_TINYBARS ?? "50000000");
  const basePolicy: SpendPolicy = { budgetTinybars, maxPerCallTinybars, evidence: null };

  const res = await fetch(new URL("/services", apiUrl), { signal: AbortSignal.timeout(10_000) }).catch((e) =>
    fail(`cannot reach ${apiUrl}: ${e.message}`),
  );
  if (!res.ok) fail(`GET ${apiUrl}/services responded ${res.status}`);
  const services = ServiceViewSchema.array().parse(await res.json());
  const paywall: Record<string, string> = {};
  await Promise.all(
    services.map(async (s) => {
      try {
        const probe = await fetch(s.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(5000),
        });
        paywall[s.name] =
          probe.status === 402 ? "402 payment required ✓" : `answered ${probe.status} without payment ✗`;
      } catch (error) {
        paywall[s.name] = `unreachable: ${(error as Error).message}`;
      }
    }),
  );
  for (const [name, status] of Object.entries(paywall)) console.log(`  ${name}: ${status}`);
  const open = Object.entries(paywall).filter(([, status]) => !status.startsWith("402"));
  if (open.length > 0) fail(`every listed endpoint must answer 402; not: ${open.map(([name]) => name).join(", ")}`);

  const provenance = env.ARENA_PROVENANCE ?? "api";
  const app = buildArenaServer({
    apiUrl,
    webOrigin,
    network: "hedera:testnet",
    provenance,
    port,
    llm: createClaudeCliLlm({ model: env.ARENA_MODEL ?? "claude-haiku-5-5" }),
    llmFor: ({ model, apiKey }) => createClaudeCliLlm({ model, apiKey }),
    userPayAndCall: () => serial(createHederaPayAndCall()),
    sellerAccountId: env.SELLER_ACCOUNT_ID,
    sides: {
      baseline: {
        payAndCall: shared ?? createHederaPayAndCall(),
        signer: baselineSigner,
        payer: baselineSigner.accountId,
        policy: basePolicy,
      },
      skeptique: {
        payAndCall: shared ?? createHederaPayAndCall(),
        signer: buyer,
        payer: buyer.accountId,
        policy: { ...basePolicy, evidence: { minMedian: Number(env.ARENA_MIN_MEDIAN ?? 70), minRounds: 1 } },
      },
    },
    health: () => ({
      paywall,
      buyer: buyer.accountId,
      baselineBuyer: baselineSigner.accountId,
      provenance,
    }),
  });
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`arena on http://127.0.0.1:${port} · api ${apiUrl} · buyer ${buyer.accountId}`);
  return app;
}
