import { startLocalMarket } from "./local-market";
import { startArena } from "./start";

/** One command for the demo: a reviewed local marketplace plus the arena, paying on Hedera testnet. */
const market = await startLocalMarket();
console.log(`local market api ${market.apiUrl} · finalised medians ${JSON.stringify(market.medians)}`);
await startArena(market.apiUrl, { ...process.env, ARENA_PROVENANCE: "local-chain" });
