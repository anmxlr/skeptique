import { buildApp } from "./app";

const port = Number(process.env.API_PORT);
if (!Number.isInteger(port)) throw new Error("API_PORT must be set");

const app = buildApp({ logger: true });
await app.listen({ port, host: "0.0.0.0" });
