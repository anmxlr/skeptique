import { createTestingLab } from "./demo/testing-lab";

const app = createTestingLab();
await app.listen({ host: "127.0.0.1", port: 4318 });
console.log("Skeptique fixture lab API: http://127.0.0.1:4318 — no wallets, payments or LLM calls.");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
