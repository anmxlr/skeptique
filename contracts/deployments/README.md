# Hedera testnet deployment

Copy `.env.example` to the repository root's `.env` and reuse the existing funded **ECDSA** testnet keys. Deployment needs `HEDERA_RPC_URL`, `DEPLOYER_PRIVATE_KEY` and `ATTESTOR_PRIVATE_KEY`; the live smoke additionally needs `SELLER_PRIVATE_KEY` and at least three comma-separated `CRITIC_PRIVATE_KEYS`. The seller needs the 20 HBAR listing fee plus transaction fees, and each critic needs 5 HBAR plus transaction fees. The deployer pays deployment fees. Keys are never written to deployment output.

From the repository root:

```sh
pnpm --filter @skeptique/contracts export:abis
HEDERA_DEMO_WINDOWS=true pnpm --filter @skeptique/contracts deploy:hedera
pnpm test:live -t 'round on hedera testnet'
```

The deployment command compiles and deploys ServiceRegistry, CriticRegistry and RoundManager, authorizes the manager in CriticRegistry, checks successful receipts and writes `hedera-testnet.json`. Every submitted transaction prints its HashScan link. Repeating the command deploys fresh contracts and atomically replaces the manifest only after all transactions succeed. Failed runs leave the previous manifest intact; earlier successful transaction links remain in the console.

`DEPLOYMENT_PATH` can override the manifest location. Empty or whitespace values use the default. Relative overrides always resolve against the repository root, including when pnpm changes the working directory. Full generated ABI JSON is exported to `packages/shared/abi/generated/`; clients also retain the existing typed ABI modules.

Constructor amounts and returned stakes/bounties are tinybars: 5 HBAR is `500000000`, 20 HBAR is `2000000000`. Hedera JSON-RPC transaction `value` has 18 decimals, so callers multiply tinybars by `10000000000`. Local Hardhat fixtures use their native unit directly. Unknown chains are rejected by the shared conversion helper.

The smoke test checks the RPC chain, actual onchain windows and minimums, rejects a 4.9 HBAR stake via onchain simulation, registers three 5 HBAR stakes, lists a service for 20 HBAR and commits/reveals/finalizes a real round. Demo windows are the specified 90 seconds and 45 seconds. It uses signed attestor vouchers and synthetic scores 68/72/76 solely as a contract smoke fixture; this does **not** claim fresh World verification or paid service-quality evaluation. The test fails explicitly when credentials are missing; a skipped or local run never counts as live acceptance.

The API loads the manifest at startup and rejects a mismatched RPC chain. Its public `/deployment` route supplies addresses to the web app. The ENS score relayer reads source contracts, chain ID and start block from the same manifest; ENS namespace addresses and explicit name mappings remain in its separate public JSON config. `ENS_NAMES_PATH` can point the API at that config's `serviceNames` map. A service name is exposed only when its namehash matches the service's registered ENS node; absent or mismatched mappings remain unconfigured.

No deployment address file or completion receipt should be invented before the funded live run succeeds.

The Sell and critic-onboarding pages fetch their registry addresses from `/deployment` and reject a mismatched wallet network. The Sell page requires the public ENS parent from the deployment/API configuration and commits the derived service namehash when listing. Its low-level local test helper can still list without ENS. Older listings with a zero ENS node cannot be patched later because the node is immutable: relist them with a configured namespace before ENS score publication.

When the browser and API use different origins, set `WEB_ORIGIN` to the exact web origin (for example `http://localhost:3000`). Only that origin can preflight and POST the two World verification routes; public GET routes remain readable without credentials. An empty setting grants no cross-origin World writes.
