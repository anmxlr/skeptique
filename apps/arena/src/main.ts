import { fail, startArena } from "./start";

await startArena(process.env.API_URL ?? fail("API_URL is required (the Skeptique API that serves /services)"));
