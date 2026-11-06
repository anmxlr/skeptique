import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deployHedera } from "../deploy/hedera";

const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
deployHedera().catch(error => {
  console.error(error.shortMessage ?? error.message);
  process.exitCode = 1;
});
