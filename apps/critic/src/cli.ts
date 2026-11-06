import { createCriticFromEnv } from "./main";

const { daemon, pollMs } = await createCriticFromEnv(process.env);
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());
await daemon.run(controller.signal, pollMs);
